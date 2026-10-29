import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { addDaysStr, localTimeOf, todayIn } from "@/lib/dates";
import { composeMessage, type JarvisTone } from "@/lib/jarvis-voice";
import { assistantProfile } from "@/lib/assistant";
import { jarvisMessages, notificationLog, type JarvisSettings, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { DETECTORS, RUNS, type Candidate } from "./detectors";
import { nextQuestion } from "./questions";
import { performAction } from "./respond";

export type Slot = "morning" | "midday" | "evening";
export type JarvisMessage = typeof jarvisMessages.$inferSelect;

const DAILY_CAP = { low: 2, normal: 4, high: 7 } as const;
/** Kinds that summarize the day/week; they don't count toward the daily cap. */
const REVIEW_KINDS = new Set(["morning_brief", "evening_wrap", "weekly_review", "monthly_review", "weekly_learned"]);

export function jarvisSettings(prefs: UserPreferences | undefined) {
  const j: JarvisSettings = prefs?.jarvis ?? {};
  return {
    frequency: j.frequency ?? "normal",
    quietStart: j.quietStart ?? "22:00",
    quietEnd: j.quietEnd ?? "07:00",
    topics: { money: true, school: true, work: true, health: true, trips: true, habits: true, ...j.topics },
    autonomy: { tasks: false, calendar: false, ...j.autonomy },
    avatar: j.avatar ?? "spark",
    learning: j.learning,
    mutedKinds: j.mutedKinds ?? [],
    pushLimit: j.pushLimit ?? 3,
    learningResetAt: j.learningResetAt ? new Date(j.learningResetAt) : null,
    tone: toneOf(prefs),
  };
}
export type ResolvedJarvisSettings = ReturnType<typeof jarvisSettings>;

export function toneOf(prefs: UserPreferences | undefined): JarvisTone {
  const style = assistantProfile(prefs).style;
  return style === "coach" ? "coach" : style === "direct" ? "direct" : "friend";
}

export function slotOf(localTime: string): Slot {
  return localTime < "12:00" ? "morning" : localTime < "17:00" ? "midday" : "evening";
}

export function inQuietHours(localTime: string, start: string, end: string) {
  return start <= end ? localTime >= start && localTime < end : localTime >= start || localTime < end;
}

// ------------------------------------------------------------------ learning

/**
 * What the user's responses say about each kind of message (last 60 days).
 * Ignored = never touched after 2 days. Only used when the user agreed to learning.
 */
export async function learnedStats(scope: UserScope, now = new Date(), resetAt: Date | null = null) {
  const since = new Date(Math.max(now.getTime() - 60 * 86_400_000, resetAt?.getTime() ?? 0));
  const rows = await scope.tx
    .select({ kind: jarvisMessages.kind, status: jarvisMessages.status, rating: jarvisMessages.rating, createdAt: jarvisMessages.createdAt })
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), gte(jarvisMessages.createdAt, since)))
    .orderBy(desc(jarvisMessages.createdAt));
  const stale = now.getTime() - 2 * 86_400_000;
  const byKind = new Map<string, { shown: number; acted: number; negative: number; recent: ("acted" | "negative" | "open")[] }>();
  let ups = 0;
  let downs = 0;
  for (const r of rows) {
    const k = byKind.get(r.kind) ?? { shown: 0, acted: 0, negative: 0, recent: [] };
    const outcome =
      r.status === "done" || r.rating === 1
        ? "acted"
        : r.status === "dismissed" || r.rating === -1 || (r.status === "new" && r.createdAt.getTime() < stale)
          ? "negative"
          : "open";
    k.shown++;
    if (outcome === "acted") k.acted++;
    if (outcome === "negative") k.negative++;
    k.recent.push(outcome);
    byKind.set(r.kind, k);
    if (r.rating === 1) ups++;
    if (r.rating === -1) downs++;
  }
  const kinds = [...byKind.entries()].map(([kind, k]) => {
    const last3 = k.recent.filter((o) => o !== "open").slice(0, 3);
    return {
      kind,
      ...k,
      // Three ignored or turned down in a row, never acted on: stop sending it.
      suppressed: last3.length === 3 && last3.every((o) => o === "negative") && k.acted === 0,
      boost: k.acted >= 2 && k.acted / k.shown >= 0.5 ? 15 : k.negative / Math.max(1, k.shown) >= 0.6 ? -15 : 0,
    };
  });
  return { kinds, brief: downs >= 3 && downs >= ups };
}

// ------------------------------------------------------------------ running

type RunInput = { scope: UserScope; tz: string; prefs: UserPreferences | undefined; trigger: Slot | "transaction" | "shift" | "goal" | "task"; now?: Date };

/** Runs the detectors for a slot or event and saves what's worth saying. Returns the new messages. */
export async function runProactive({ scope, tz, prefs, trigger, now = new Date() }: RunInput): Promise<JarvisMessage[]> {
  const settings = jarvisSettings(prefs);
  const today = todayIn(tz, now);
  const ctx = { scope, tz, today, now };
  let candidates: Candidate[] = [];
  for (const name of RUNS[trigger] ?? []) candidates.push(...(await DETECTORS[name](ctx)));
  if (settings.learning === undefined && trigger === "morning")
    candidates.push({ kind: "consent", topic: "general", dedupeKey: "consent", facts: {}, action: { type: "consent", label: "Yes, learn" }, priority: 40 });

  if (settings.learning && trigger === "evening") {
    const q = await nextQuestion(scope, now);
    if (q) candidates.push(q);
  }

  const learned = settings.learning ? await learnedStats(scope, now, settings.learningResetAt) : { kinds: [], brief: false };
  const stat = new Map(learned.kinds.map((k) => [k.kind, k]));
  candidates = candidates
    .filter((c) => c.topic === "general" || settings.topics[c.topic] !== false)
    .filter((c) => !settings.mutedKinds.includes(c.kind) && !stat.get(c.kind)?.suppressed)
    .map((c) => ({ ...c, priority: c.priority + (stat.get(c.kind)?.boost ?? 0) }))
    .sort((a, b) => b.priority - a.priority);
  if (!candidates.length) return [];

  const sentToday = await scope.tx
    .select({ kind: jarvisMessages.kind, urgent: jarvisMessages.urgent })
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), gte(jarvisMessages.createdAt, new Date(now.getTime() - 24 * 3600_000))));
  let room = DAILY_CAP[settings.frequency] - sentToday.filter((m) => !REVIEW_KINDS.has(m.kind) && !m.urgent).length;
  const saved: JarvisMessage[] = [];
  for (const c of candidates) {
    const counts = !REVIEW_KINDS.has(c.kind) && !c.urgent;
    if (counts && room <= 0) continue;
    // Allowed without asking (never money): do it now and say so, with Undo.
    const auto =
      (c.action?.type === "block_time" && settings.autonomy.calendar) ||
      ((c.action?.type === "move_tasks" || c.action?.type === "create_task") && settings.autonomy.tasks);
    const row = await saveMessage(scope, auto ? { ...c, facts: { ...c.facts, done: true } } : c, settings.tone, learned.brief, trigger);
    if (!row) continue;
    if (auto && c.action) {
      const r = await performAction(scope, tz, c.action, today);
      await scope.tx
        .update(jarvisMessages)
        .set({ status: "done", actedAt: now, result: { text: r.text, undo: r.undo } })
        .where(eq(jarvisMessages.id, row.id));
      Object.assign(row, { status: "done", result: { text: r.text, undo: r.undo } });
    }
    saved.push(row);
    if (counts) room--;
  }
  return saved;
}

export async function saveMessage(scope: UserScope, c: Candidate, tone: JarvisTone, brief: boolean, slot: string) {
  const { title, body } = composeMessage(c.kind, c.facts, tone, { brief, seed: c.dedupeKey.length });
  const [row] = await scope.tx
    .insert(jarvisMessages)
    .values({
      userId: scope.userId,
      kind: c.kind,
      topic: c.topic,
      dedupeKey: c.dedupeKey,
      title,
      body,
      facts: c.facts,
      action: c.action ?? null,
      priority: Math.max(0, Math.min(100, c.priority)),
      urgent: !!c.urgent,
      slot,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Runs the current slot once per day (morning, midday, evening). Cheap when already done. */
export async function runDueSlot(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now = new Date()) {
  const slot = slotOf(localTimeOf(now, tz));
  const [first] = await scope.tx
    .insert(notificationLog)
    .values({ userId: scope.userId, key: `slot:${todayIn(tz, now)}:${slot}`, title: slot })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!first) return [];
  return runProactive({ scope, tz, prefs, trigger: slot, now });
}

// ------------------------------------------------------------------ reading

/** The one message that matters most right now (Today's Jarvis card). */
export async function topMessage(scope: UserScope, now = new Date()) {
  const rows = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(
      and(
        eq(jarvisMessages.userId, scope.userId),
        inArray(jarvisMessages.status, ["new", "snoozed"]),
        gte(jarvisMessages.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    )
    .orderBy(desc(jarvisMessages.priority), desc(jarvisMessages.createdAt))
    .limit(20);
  return rows.find((r) => r.status === "new" || (r.snoozedUntil && r.snoozedUntil <= now)) ?? null;
}

export async function listMessages(scope: UserScope, limit = 100) {
  return scope.tx.select().from(jarvisMessages).where(eq(jarvisMessages.userId, scope.userId)).orderBy(desc(jarvisMessages.createdAt)).limit(limit);
}

export async function getMessage(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.id, id), eq(jarvisMessages.userId, scope.userId)));
  return row ?? null;
}

// ------------------------------------------------------------------ pushes

export type PushFn = (key: string, msg: { title: string; body: string; url: string; tag?: string }) => Promise<boolean>;

/** Pushes only urgent or important messages: never during quiet hours, never twice, at most `pushLimit` a day. */
export async function pushImportant(scope: UserScope, tz: string, prefs: UserPreferences | undefined, push: PushFn, now = new Date()) {
  const s = jarvisSettings(prefs);
  if (inQuietHours(localTimeOf(now, tz), s.quietStart, s.quietEnd)) return 0;
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [{ pushed }] = await scope.tx
    .select({ pushed: sql<number>`count(*)::int` })
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), isNotNull(jarvisMessages.pushedAt), gte(jarvisMessages.pushedAt, dayAgo)));
  let left = s.pushLimit - pushed;
  if (left <= 0) return 0;
  const due = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(
      and(
        eq(jarvisMessages.userId, scope.userId),
        eq(jarvisMessages.status, "new"),
        sql`${jarvisMessages.pushedAt} is null`,
        gte(jarvisMessages.createdAt, new Date(now.getTime() - 12 * 3600_000)),
      ),
    )
    .orderBy(desc(jarvisMessages.priority));
  let sent = 0;
  for (const m of due) {
    if (left <= 0) break;
    if (!m.urgent && m.priority < 75 && !REVIEW_KINDS.has(m.kind)) continue;
    if (await push(`jarvis:${m.dedupeKey}`, { title: m.title, body: m.body, url: `/?jarvis=${m.id}`, tag: `jarvis-${m.kind}` })) {
      await scope.tx.update(jarvisMessages).set({ pushedAt: now }).where(eq(jarvisMessages.id, m.id));
      left--;
      sent++;
    }
  }
  return sent;
}

export const tomorrowMorning = (tz: string, now = new Date()) => {
  const d = addDaysStr(todayIn(tz, now), 1);
  return new Date(`${d}T08:00:00${offsetOf(tz, now)}`);
};
const offsetOf = (tz: string, at: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at);
  const off = parts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "+00:00";
  return off === "" ? "+00:00" : off;
};
