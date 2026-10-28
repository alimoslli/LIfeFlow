import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { addDaysStr, DATE_RE, todayIn, type DateStr } from "@/lib/dates";
import type { Database } from "../db/client";
import { healthSamples, healthTokens, users, type HealthMetric } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "./errors";

/**
 * Apple Health has no web API: data leaves the iPhone only through the
 * user's own iOS Shortcut, which POSTs daily totals with a personal key.
 * Values are the user's own measurements; we store one per metric per day.
 */

export const HEALTH_METRICS: Record<HealthMetric, { label: string; unit: string; max: number; decimals: number }> = {
  steps: { label: "Steps", unit: "steps", max: 200_000, decimals: 0 },
  active_energy_kcal: { label: "Active energy", unit: "kcal", max: 20_000, decimals: 0 },
  exercise_minutes: { label: "Exercise", unit: "min", max: 1440, decimals: 0 },
  sleep_hours: { label: "Sleep", unit: "h", max: 24, decimals: 1 },
  resting_heart_rate: { label: "Resting heart rate", unit: "bpm", max: 250, decimals: 0 },
  weight_kg: { label: "Weight", unit: "kg", max: 700, decimals: 1 },
  distance_km: { label: "Walking + running", unit: "km", max: 1000, decimals: 1 },
  mindful_minutes: { label: "Mindful minutes", unit: "min", max: 1440, decimals: 0 },
};

/** Shortcut-friendly names → stored metric (+ unit conversion). */
const ALIASES: Record<string, { metric: HealthMetric; factor?: number }> = {
  steps: { metric: "steps" },
  activeEnergy: { metric: "active_energy_kcal" },
  exerciseMinutes: { metric: "exercise_minutes" },
  sleepHours: { metric: "sleep_hours" },
  sleepMinutes: { metric: "sleep_hours", factor: 1 / 60 },
  restingHeartRate: { metric: "resting_heart_rate" },
  weightKg: { metric: "weight_kg" },
  weightLb: { metric: "weight_kg", factor: 0.45359237 },
  distanceKm: { metric: "distance_km" },
  distanceMi: { metric: "distance_km", factor: 1.609344 },
  mindfulMinutes: { metric: "mindful_minutes" },
};

export const HEALTH_FIELDS = Object.keys(ALIASES);

/** Shortcuts often sends numbers as text ("8,532" or "72 bpm"); take the leading number. */
const looseNumber = z.union([z.number(), z.string().max(40)]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v.replace(/,/g, "").match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: "custom", message: "must be a non-negative number" });
    return z.NEVER;
  }
  return n;
});

const dayEntry = z.object({
  date: z.string().regex(DATE_RE).optional(),
  metrics: z.record(z.string().max(40), looseNumber.nullable()),
});

export const ingestSchema = z.union([dayEntry, z.object({ days: z.array(dayEntry).min(1).max(62) })]);
export type HealthIngest = z.input<typeof ingestSchema>;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const TOKEN_PREFIX = "lfh_";

/** Creates a personal key for the Shortcut. The raw key is returned once and never stored. */
export async function createHealthToken({ tx, userId }: UserScope, name: string) {
  const active = await tx
    .select({ id: healthTokens.id })
    .from(healthTokens)
    .where(and(eq(healthTokens.userId, userId), isNull(healthTokens.revokedAt)));
  if (active.length >= 5) throw new ServiceError("You already have 5 active keys. Revoke one first.");
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const [row] = await tx
    .insert(healthTokens)
    .values({ userId, name: name.trim().slice(0, 60) || "iPhone", tokenHash: sha256(token) })
    .returning({ id: healthTokens.id });
  return { id: row.id, token };
}

export async function listHealthTokens({ tx, userId }: UserScope) {
  return tx
    .select({ id: healthTokens.id, name: healthTokens.name, createdAt: healthTokens.createdAt, lastUsedAt: healthTokens.lastUsedAt })
    .from(healthTokens)
    .where(and(eq(healthTokens.userId, userId), isNull(healthTokens.revokedAt)))
    .orderBy(desc(healthTokens.createdAt));
}

export async function revokeHealthToken({ tx, userId }: UserScope, id: string) {
  const [row] = await tx
    .update(healthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(healthTokens.id, id), eq(healthTokens.userId, userId), isNull(healthTokens.revokedAt)))
    .returning({ id: healthTokens.id });
  if (!row) throw new ServiceError("Key not found.");
}

/** Looks up a raw key before any user context exists (like sessions). Returns the owner, or null. */
export async function resolveHealthToken(db: Database, raw: string): Promise<{ userId: string; timezone: string } | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length > 100) return null;
  const [row] = await db
    .select({ id: healthTokens.id, userId: healthTokens.userId, timezone: users.timezone })
    .from(healthTokens)
    .innerJoin(users, eq(users.id, healthTokens.userId))
    .where(and(eq(healthTokens.tokenHash, sha256(raw)), isNull(healthTokens.revokedAt)));
  if (!row) return null;
  await db.update(healthTokens).set({ lastUsedAt: new Date() }).where(eq(healthTokens.id, row.id));
  return { userId: row.userId, timezone: row.timezone };
}

/** Saves the Shortcut's daily values. Re-sending a day replaces that day's values. Unknown fields are reported, not saved. */
export async function ingestHealth({ tx, userId }: UserScope, input: unknown, tz: string, now = new Date()) {
  const parsed = ingestSchema.parse(input);
  const entries = "days" in parsed ? parsed.days : [parsed];
  const today = todayIn(tz, now);
  const oldest = addDaysStr(today, -400);
  const rows: { metric: HealthMetric; day: DateStr; value: number }[] = [];
  const ignored = new Set<string>();
  for (const e of entries) {
    const day = e.date ?? today;
    if (day > addDaysStr(today, 1) || day < oldest) throw new ServiceError(`Date ${day} is out of range.`);
    for (const [key, v] of Object.entries(e.metrics)) {
      const alias = ALIASES[key];
      if (!alias) {
        ignored.add(key);
        continue;
      }
      if (v == null) continue;
      const info = HEALTH_METRICS[alias.metric];
      const value = Number((v * (alias.factor ?? 1)).toFixed(info.decimals));
      if (value > info.max) throw new ServiceError(`${key} looks wrong (${v}).`);
      // A day's sleep may arrive as several fields; the last one wins, like a re-send.
      const i = rows.findIndex((r) => r.metric === alias.metric && r.day === day);
      if (i >= 0) rows.splice(i, 1);
      rows.push({ metric: alias.metric, day, value });
    }
  }
  if (rows.length)
    await tx
      .insert(healthSamples)
      .values(rows.map((r) => ({ ...r, userId, source: "apple_health" as const })))
      .onConflictDoUpdate({
        target: [healthSamples.userId, healthSamples.metric, healthSamples.day],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
  return { saved: rows.length, days: new Set(rows.map((r) => r.day)).size, ignored: [...ignored] };
}

/** Per metric: the latest value, the average over the window, and the daily series. */
export async function healthSummary({ tx, userId }: UserScope, tz: string, days = 7, now = new Date()) {
  const today = todayIn(tz, now);
  const from = addDaysStr(today, -(days - 1));
  const rows = await tx
    .select({ metric: healthSamples.metric, day: healthSamples.day, value: healthSamples.value })
    .from(healthSamples)
    .where(and(eq(healthSamples.userId, userId), gte(healthSamples.day, from)))
    .orderBy(asc(healthSamples.day));
  const [last] = await tx
    .select({ at: healthSamples.updatedAt })
    .from(healthSamples)
    .where(eq(healthSamples.userId, userId))
    .orderBy(desc(healthSamples.updatedAt))
    .limit(1);
  const metrics = (Object.keys(HEALTH_METRICS) as HealthMetric[]).flatMap((metric) => {
    const series = rows.filter((r) => r.metric === metric).map((r) => ({ day: r.day, value: Number(r.value) }));
    if (!series.length) return [];
    const info = HEALTH_METRICS[metric];
    const avg = series.reduce((a, r) => a + r.value, 0) / series.length;
    const latest = series[series.length - 1];
    return [{ metric, label: info.label, unit: info.unit, latest, average: Number(avg.toFixed(info.decimals)), daysWithData: series.length, series }];
  });
  return { from, to: today, lastReceivedAt: last?.at ?? null, metrics };
}
