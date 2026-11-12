import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { addDaysStr, dayOfWeek, localTimeOf, todayIn } from "@/lib/dates";
import { composeMessage, hasAmount, KIND_LABELS, LOCKED_MONEY_PUSH, pushText, type JarvisTone } from "@/lib/jarvis-voice";
import { assistantProfile } from "@/lib/assistant";
import { jarvisMessages, notificationLog, type JarvisSettings, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { DETECTORS, RUNS, type Candidate } from "./detectors";
import { aiAllowed } from "@/lib/ai-consent";
import { nextQuestion } from "./questions";
import { performAction } from "./respond";
import { fillRegularShifts } from "../work";
import { listActiveMemories } from "../memory";
import { attachWaitingReceiptsSafely, runInboxCleanupOnce } from "../inbox/cleanup";
import { emailFilingOn, fileFromGmail } from "../inbox/gmail";

export type Slot = "morning" | "midday" | "evening";
export type JarvisMessage = typeof jarvisMessages.$inferSelect;

const DAILY_CAP = { low: 2, normal: 4, high: 7 } as const;
/** Kinds that summarize the day/week; they don't count toward the daily cap. */
const REVIEW_KINDS = new Set(["morning_brief", "evening_wrap", "weekly_review", "monthly_review", "weekly_learned"]);
/** Outside the cap too: reviews, and the one-time consent question. */
const uncapped = (kind: string) => REVIEW_KINDS.has(kind) || kind === "consent" || kind.startsWith("promise_");

export function jarvisSettings(prefs: UserPreferences | undefined) {
  const j: JarvisSettings = prefs?.jarvis ?? {};
  return {
    frequency: j.frequency ?? "normal",
    quietStart: j.quietStart ?? "22:00",
    quietEnd: j.quietEnd ?? "07:00",
    topics: { money: true, school: true, work: true, health: true, habits: true, ...j.topics },
    autonomy: { tasks: false, calendar: false, ...j.autonomy },
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

type RunInput = {
  scope: UserScope;
  tz: string;
  prefs: UserPreferences | undefined;
  trigger: Slot | "transaction" | "shift" | "goal" | "task" | "promise" | "sunday";
  now?: Date;
};

/** Runs the detectors for a slot or event and saves what's worth saying. Returns the new messages. */
export async function runProactive({ scope, tz, prefs, trigger, now = new Date() }: RunInput): Promise<JarvisMessage[]> {
  const settings = jarvisSettings(prefs);
  const today = todayIn(tz, now);
  const ctx = { scope, tz, today, now };
  let candidates: Candidate[] = [];
  for (const name of RUNS[trigger] ?? []) {
    if (name === "savingsCheck" && !aiAllowed(prefs)) continue; // it searches the web with an AI model
    candidates.push(...(await DETECTORS[name](ctx)));
  }
  if (settings.learning === undefined && trigger === "morning")
    candidates.push({ kind: "consent", topic: "general", dedupeKey: "consent", facts: {}, action: { type: "consent", label: "Yes, learn" }, priority: 40 });

  if (settings.learning && trigger === "evening") {
    const q = await nextQuestion(scope, now, prefs, await listActiveMemories(scope, now));
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
  let room = DAILY_CAP[settings.frequency] - sentToday.filter((m) => !uncapped(m.kind) && !m.urgent).length;
  const saved: JarvisMessage[] = [];
  for (const c of candidates) {
    const counts = !uncapped(c.kind) && !c.urgent;
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

/**
 * When the scheduler may start a slot for someone who hasn't opened the app. The scheduler runs every few minutes, so
 * without this the morning look would run at 12:01 AM (stale by breakfast) and the evening wrap at 5:00 PM. The morning
 * waits for the end of their quiet hours (never later than 9), the midday look runs at noon, and the evening one at 8.
 * Opening Today runs the current slot straight away, as it always has.
 */
export function scheduledFrom(slot: Slot, quietEnd: string): string {
  if (slot === "midday") return "12:00";
  if (slot === "evening") return "20:00";
  return quietEnd >= "05:00" && quietEnd <= "09:00" ? quietEnd : "07:00";
}

/** Runs the current slot once per day (morning, midday, evening). Cheap when already done. */
export async function runDueSlot(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now = new Date(), opts: { scheduled?: boolean } = {}) {
  const sunday = await runSundayLook(scope, tz, prefs, now);
  return [...sunday, ...(await runSlot(scope, tz, prefs, now, opts))];
}

/** The hour the Sunday look runs from (owner, 2026-11-12: "around 6 PM"). */
export const SUNDAY_LOOK_AT = "18:00";

/**
 * Sundays from 6 PM, once a Sunday: the weekly review (the week that ended and the one coming) and the week ahead. Its
 * push follows the usual rules (quiet hours, the push limit, the Money lock). Today shows it through Monday (sky-insights).
 */
export async function runSundayLook(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now = new Date()) {
  const today = todayIn(tz, now);
  if (dayOfWeek(today) !== 0 || localTimeOf(now, tz) < SUNDAY_LOOK_AT) return [];
  const [first] = await scope.tx
    .insert(notificationLog)
    .values({ userId: scope.userId, key: `slot:${today}:sunday`, title: "sunday" })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!first) return [];
  return runProactive({ scope, tz, prefs, trigger: "sunday", now });
}

async function runSlot(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now: Date, opts: { scheduled?: boolean }) {
  const localTime = localTimeOf(now, tz);
  const slot = slotOf(localTime);
  // from the scheduler: not before the slot's time has come (nothing is logged, so the next run tries again)
  if (opts.scheduled && localTime < scheduledFrom(slot, jarvisSettings(prefs).quietEnd)) return [];
  const [first] = await scope.tx
    .insert(notificationLog)
    .values({ userId: scope.userId, key: `slot:${todayIn(tz, now)}:${slot}`, title: slot })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!first) return [];
  // Keep regular work hours filled in ahead, so detectors and Today see them.
  await fillRegularShifts(scope, tz, todayIn(tz, now));
  // Once per account: collapse bills, to-dos and exams the inbox filed twice (bounded; never blocks the rest).
  await runInboxCleanupOnce(scope, todayIn(tz, now));
  // Receipts kept while their bank charge hadn't posted ride along on it once it has. Never blocks the rest.
  await attachWaitingReceiptsSafely(scope, todayIn(tz, now));
  // Mornings, if the user turned it on: file new school, bill and work emails from Gmail. Never blocks the rest.
  if (slot === "morning" && emailFilingOn(prefs, "gmail") && aiAllowed(prefs))
    await fileFromGmail(scope, tz, todayIn(tz, now)).catch((e) => console.error("[gmail filing]", e instanceof Error ? e.name : e));
  return runProactive({ scope, tz, prefs, trigger: slot, now });
}

// ------------------------------------------------------------------ reading

/** Kinds that are still sent. Messages of a retired kind (e.g. the old "log spending" reminder) are never shown or pushed. */
const currentKind = () => inArray(jarvisMessages.kind, Object.keys(KIND_LABELS));

/** The one message that matters most right now (Today's Jarvis card). */
export async function topMessage(scope: UserScope, now = new Date()) {
  const rows = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(
      and(
        eq(jarvisMessages.userId, scope.userId),
        currentKind(),
        inArray(jarvisMessages.status, ["new", "snoozed"]),
        gte(jarvisMessages.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    )
    .orderBy(desc(jarvisMessages.priority), desc(jarvisMessages.createdAt))
    .limit(20);
  return rows.find((r) => r.status === "new" || (r.snoozedUntil && r.snoozedUntil <= now)) ?? null;
}

/** New messages from the last 3 days (the dot on the Jarvis tab). */
export async function unreadCount(scope: UserScope, now = new Date()) {
  const [r] = await scope.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(jarvisMessages)
    .where(
      and(
        eq(jarvisMessages.userId, scope.userId),
        currentKind(),
        eq(jarvisMessages.status, "new"),
        gte(jarvisMessages.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    );
  return r?.n ?? 0;
}

export async function listMessages(scope: UserScope, limit = 100) {
  return scope.tx
    .select()
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), currentKind()))
    .orderBy(desc(jarvisMessages.createdAt))
    .limit(limit);
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

/**
 * Pushes the reviews (morning brief, evening wrap-up, weekly and monthly) and urgent or important messages
 * (priority 75+): never during quiet hours, never twice, at most `pushLimit` in 24 hours. Each push body is the
 * one line of what was noticed and why plus the next step (`pushText`), not just the headline.
 */
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
        currentKind(),
        eq(jarvisMessages.status, "new"),
        sql`${jarvisMessages.pushedAt} is null`,
        gte(jarvisMessages.createdAt, new Date(now.getTime() - 12 * 3600_000)),
      ),
    )
    .orderBy(desc(jarvisMessages.priority));
  let sent = 0;
  const moneyLocked = prefs?.moneyLock?.enabled === true;
  for (const m of due) {
    if (left <= 0) break;
    if (!m.urgent && m.priority < 75 && !REVIEW_KINDS.has(m.kind)) continue;
    // the Money lock keeps amounts and merchants off the lock screen (CLAUDE.md, notifications rule)
    const p = pushText(m.kind, m.facts, { moneyLocked, topic: m.topic });
    let title = moneyLocked ? (p?.title ?? m.title) : m.title;
    let body = p?.body || m.body;
    if (moneyLocked && (hasAmount(title) || hasAmount(body))) ({ title, body } = LOCKED_MONEY_PUSH);
    if (await push(`jarvis:${m.dedupeKey}`, { title, body, url: `/?jarvis=${m.id}`, tag: `jarvis-${m.kind}` })) {
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
