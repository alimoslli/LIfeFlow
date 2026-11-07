import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import { HQ_ROLES, hqChats, hqMissions, hqSettings } from "../db/schema";
import { addDaysStr, localDateOf, localToInstant } from "../../lib/dates";
import { deskLink, startStalled, type DeskLink } from "../hq/desk";
import { liveNow } from "../hq/state";
import type { Mission } from "../hq/types";
import { DESK_PROMPT_MAX, line, logActivity, logAdmin, parse, timed, type Tx } from "../hq/validate";
import { createMission, ownerTimeZone, toMission } from "./hq";

/**
 * The CEO's desk and Goodnight (ADR 0029). Desk files are missions with a first prompt; a click opens a Claude Code link
 * (hq/desk.ts). Goodnight only records the sign-off and dims the office until 5 AM in the owner's time zone: it starts no
 * round and drives no chat (owner, 2026-11-07: rounds run on their schedule only).
 */

export type DeskFile = { mission: Mission; link: DeskLink; status: string; /** Its chat is working right now (ADR 0030). */ live: boolean };
export type DeskView = { files: DeskFile[]; night: { on: boolean; since: Date | null; endsAt: Date | null } };

const OPEN = ["todo", "doing", "waiting", "blocked"] as const;
const RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** One plain line on where a desk task is. */
export function deskStatus(m: Pick<Mission, "status" | "sessionId" | "progress" | "blockedReason">): string {
  if (m.status === "blocked") return `Waiting on you: ${m.blockedReason ?? "something"}`;
  if (m.status === "waiting") return "Ready for your look";
  if (m.status === "doing") return m.progress?.trim() || "In its chat";
  return m.sessionId ? "Chat started" : "Not started";
}

/** The first 5:00 AM in tz after the goodnight. Night mode is on until then. */
export function nightEndsAt(goodnightAt: Date, tz: string): Date {
  const day = localDateOf(goodnightAt, tz);
  const five = localToInstant(day, "05:00", tz);
  return five.getTime() > goodnightAt.getTime() ? five : localToInstant(addDaysStr(day, 1), "05:00", tz);
}

async function settingsRow(tx: Tx) {
  await tx.insert(hqSettings).values({ id: "hq" }).onConflictDoNothing();
  const [r] = await tx.select().from(hqSettings).where(eq(hqSettings.id, "hq")).limit(1);
  return r;
}

/** The desk's open files (high priority first, then oldest; max 30) and whether the office is in night mode. */
export async function deskView(db: Database, now: Date = new Date()): Promise<DeskView> {
  return timed(db, async (tx) => {
    const rows = await tx
      .select()
      .from(hqMissions)
      .where(and(isNotNull(hqMissions.deskPrompt), inArray(hqMissions.status, [...OPEN])))
      .orderBy(asc(hqMissions.createdAt))
      .limit(30);
    // Live HQ (ADR 0030): a task whose chat is busy right now shows what that chat is doing.
    const ids = [...new Set(rows.map((r) => r.sessionId).filter((x): x is string => !!x))];
    const chats = ids.length ? await tx.select().from(hqChats).where(inArray(hqChats.id, ids)) : [];
    const liveOf = (id: string | null) => {
      const c = id ? chats.find((x) => x.id === id) : undefined;
      return c ? liveNow(c, now) : null;
    };
    const files = rows
      .map(toMission)
      .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => {
        const live = liveOf(m.sessionId);
        // A start from HQ whose chat never said a word: offer to start it again rather than a chat that did nothing.
        const stalled = !live && startStalled(m, m.sessionId ? chats.find((c) => c.id === m.sessionId) : null, now);
        if (stalled) return { mission: m, link: deskLink({ ...m, sessionId: null }), status: "Didn't start. Tap to start it again.", live: false };
        return { mission: m, link: deskLink(m), status: live ?? deskStatus(m), live: !!live };
      });
    const s = await settingsRow(tx);
    const tz = await ownerTimeZone(tx);
    const endsAt = s.goodnightAt ? nightEndsAt(s.goodnightAt, tz) : null;
    const on = !!endsAt && now.getTime() < endsAt.getTime();
    return { files, night: { on, since: on ? s.goodnightAt : null, endsAt: on ? endsAt : null } };
  });
}

const deskTaskSchema = z.object({
  role: z.enum(HQ_ROLES),
  title: line(1, 140),
  prompt: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "is required").max(DESK_PROMPT_MAX, `is too long (max ${DESK_PROMPT_MAX})`)),
});

/** "Add to my desk" (owner-only: the caller has checked requireAdmin). */
export async function addDeskTask(db: Database, admin: Admin, input: { role: string; title: string; prompt: string }): Promise<Mission> {
  const d = parse(deskTaskSchema, input);
  const m = await createMission(db, { kind: "owner", email: admin.email }, { role: d.role, title: d.title, deskPrompt: d.prompt, priority: "high" });
  await db.transaction((tx) => logAdmin(tx, admin, "hq.desk_added", { missionId: m.id }));
  return m;
}

/** Goodnight: records the sign-off and dims the office until 5 AM. Starts nothing. */
export async function sayGoodnight(db: Database, admin: Admin, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await settingsRow(tx);
    await tx.update(hqSettings).set({ goodnightAt: now, updatedByEmail: admin.email, updatedAt: now }).where(eq(hqSettings.id, "hq"));
    await logActivity(tx, { actor: "owner", role: "founder", kind: "goodnight", text: "You said goodnight. Rounds still run on their schedule." });
    await logAdmin(tx, admin, "hq.goodnight", {});
  });
}

/** Lights on: ends night mode early. */
export async function lightsOn(db: Database, admin: Admin): Promise<void> {
  await db.transaction(async (tx) => {
    const s = await settingsRow(tx);
    if (!s.goodnightAt) return;
    await tx
      .update(hqSettings)
      .set({ goodnightAt: null, updatedByEmail: admin.email, updatedAt: sql`now()` })
      .where(eq(hqSettings.id, "hq"));
    await logActivity(tx, { actor: "owner", role: "founder", kind: "lights_on", text: "Lights on." });
    await logAdmin(tx, admin, "hq.lights_on", {});
  });
}
