import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { assistantProfile } from "@/lib/assistant";
import { todayIn } from "@/lib/dates";
import { adminFor } from "../auth/admin";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { checkCeilings } from "./ai-ceiling";
import { readBudgets, releaseBudget, reserveBudget, settleBudget, type BudgetLine } from "./ai-budget";
import {
  budgetLines,
  companyKey,
  companyLimits,
  companyMonth,
  companyDay,
  personLimits,
  refusalMessage,
  refusalOf,
  type AiRefusal,
  type AiSubject,
  type AiWork,
  type PersonLimits,
} from "./ai-limits";

/**
 * The one place every paid AI call passes before it starts (ADR 0035). It sets the estimate aside in one database step and
 * refuses work that would pass a limit; afterwards the caller settles it with what really happened.
 */

/** Thrown when work is refused. `message` is the plain wording to show the person (never a setting, model or token count). */
export class AiRefusedError extends Error {
  constructor(
    readonly refusal: AiRefusal,
    message: string,
  ) {
    super(message);
    this.name = "AiRefusedError";
  }
}

export type SubjectHint = {
  id: string;
  timezone: string;
  plan?: "free" | "pro";
  accountKind: "standard" | "demo";
  preferences?: Parameters<typeof assistantProfile>[0];
};

/** Who is asking, with the facts the limits need. A hint (a signed-in user) saves the lookup of their own row. */
export async function subjectFor(userId: string, hint?: SubjectHint): Promise<AiSubject> {
  const db = getDb();
  let u = hint;
  if (!u) {
    const [row] = await db
      .select({ id: users.id, timezone: users.timezone, plan: users.plan, accountKind: users.accountKind, preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new Error("Unknown user");
    u = row;
  }
  return {
    userId,
    tz: u.timezone,
    plan: u.plan,
    accountKind: u.accountKind,
    isAdmin: u.accountKind === "standard" ? !!(await adminFor(db, userId)) : false,
    name: assistantProfile(u.preferences, u.timezone).name,
  };
}

/** How long a hold lives if nobody settles it (a crash): then its estimate counts as used. */
export const HOLD_SECONDS = { turn: 330, other: 150, voiceExtra: 120 } as const;

export type AiHold = {
  holdId: string | null;
  /** Counts what really happened. Never throws: if it can't, the hold expires and its estimate counts. */
  settle(actual?: { micros?: number | null; seconds?: number | null }): Promise<void>;
  /** Gives it back uncounted (the provider refused before doing any work). */
  release(): Promise<void>;
};

const NOTHING: AiHold = { holdId: null, settle: async () => {}, release: async () => {} };

const quiet = async (what: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.error("[ai-budget]", what, e instanceof Error ? e.name : typeof e);
  }
};

/** Reserves, or throws AiRefusedError (nothing is changed then). */
export async function reserveAi(
  subject: AiSubject,
  work: AiWork,
  opts: { now?: Date; ttlSeconds?: number; holdId?: string; limits?: PersonLimits } = {},
): Promise<AiHold> {
  const now = opts.now ?? new Date();
  const lines = budgetLines(subject, work, now, opts.limits);
  const noMoney = !("estimateMicros" in work) || work.estimateMicros == null;
  if (noMoney) {
    const paused = await companyPaused(subject, now, opts.limits ?? personLimits(subject));
    if (paused) throw new AiRefusedError(paused, refusalMessage(paused, subject, now));
  }
  if (!lines.length) return NOTHING;
  const ttl =
    opts.ttlSeconds ??
    (work.feature === "voice"
      ? work.seconds + HOLD_SECONDS.voiceExtra
      : work.feature === "chat" || work.feature === "sms"
        ? HOLD_SECONDS.turn
        : HOLD_SECONDS.other);
  const r = await reserveBudget(lines, ttl, { holdId: opts.holdId ?? randomUUID() });
  if (!r.ok) {
    const refusal = refusalOf(r.key, lines);
    throw new AiRefusedError(refusal, refusalMessage(refusal, subject, now));
  }
  const holdId = r.holdId;
  const touchesCompany = lines.some((l) => l.key.startsWith("g:") && l.kind === "micros");
  return {
    holdId,
    settle: (actual) =>
      holdId
        ? quiet("settle", async () => {
            await settleBudget(holdId, actual);
            // Money that counted against the company's ceilings may have crossed 50%, 80% or 100%: warn once each.
            if (touchesCompany) await checkCeilings(now);
          })
        : Promise.resolve(),
    release: () => (holdId ? quiet("release", () => releaseBudget(holdId)) : Promise.resolve()),
  };
}

/**
 * Is the company's ceiling already reached? Work with no known cost (voice, or anything unpriced) sets nothing aside on the
 * company's dollar counters, but it still stops once they are full. Admins are never stopped by it.
 */
export async function companyPaused(subject: AiSubject, now: Date, limits: PersonLimits = personLimits(subject)): Promise<AiRefusal | null> {
  if (subject.isAdmin) return null;
  const c = companyLimits();
  const caps: BudgetLine[] = [
    // The person's own monthly dollar allowance too: work with no known cost can't add to it, but it still stops once it is full.
    ...(limits.microsPerMonth != null
      ? [{ key: `u:${subject.userId}:${todayIn(subject.tz, now).slice(0, 7)}:micros`, kind: "micros" as const, amount: 0, limit: limits.microsPerMonth }]
      : []),
    ...(limits.microsPerDay != null
      ? [{ key: `u:${subject.userId}:${todayIn(subject.tz, now)}:micros`, kind: "micros" as const, amount: 0, limit: limits.microsPerDay }]
      : []),
    { key: companyKey(companyMonth(now), "micros"), kind: "micros", amount: 0, limit: c.monthMicros },
    { key: companyKey(companyDay(now), "micros"), kind: "micros", amount: 0, limit: c.dayMicros },
    ...(c.monthCalls != null ? [{ key: companyKey(companyMonth(now), "calls"), kind: "count" as const, amount: 0, limit: c.monthCalls }] : []),
    ...(c.dayCalls != null ? [{ key: companyKey(companyDay(now), "calls"), kind: "count" as const, amount: 0, limit: c.dayCalls }] : []),
  ];
  const seen = await readBudgets(caps.map((l) => l.key));
  for (const l of caps) {
    const have = seen.get(l.key)!;
    if (have.used + have.held >= l.limit!) return refusalOf(l.key, caps);
  }
  return null;
}

/**
 * Looks without reserving: would this person's next piece of work be refused right now? For a friendly "no" before anything is
 * saved (the chat route and the voice session route); the reservation inside the work is the real check.
 */
export async function peekAi(subject: AiSubject, work: AiWork, now = new Date(), limits?: PersonLimits): Promise<AiRefusal | null> {
  const lines = budgetLines(subject, work, now, limits);
  const seen = await readBudgets(lines.map((l) => l.key));
  for (const l of lines) {
    const have = seen.get(l.key)!;
    if (l.limit != null && have.used + have.held + l.amount > l.limit) return refusalOf(l.key, lines);
  }
  return companyPaused(subject, now, limits ?? personLimits(subject));
}

/** peekAi that throws the person-facing error. */
export async function assertAllowed(subject: AiSubject, work: AiWork, now = new Date(), limits?: PersonLimits) {
  const r = await peekAi(subject, work, now, limits);
  if (r) throw new AiRefusedError(r, refusalMessage(r, subject, now));
}

/** True when a thrown provider error means it refused before doing any work (a 4xx or 5xx answer), so nothing was billed. */
export const providerRefusedBeforeWork = (e: unknown) => {
  const status = (e as { status?: number })?.status;
  return typeof status === "number" && status >= 400;
};
