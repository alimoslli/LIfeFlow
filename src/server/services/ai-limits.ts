import { addDaysStr, formatDateStr, startOfLocalDay, todayIn } from "@/lib/dates";
import { nameAtStart } from "@/lib/assistant";
import { billingConfig, inTestingPhase, isPro, monthlyLimitMessage, TESTING_LIMITS, testingLimitMessage, type BillingConfig } from "../billing";
import { env } from "../env";
import type { BudgetLine } from "./ai-budget";

/**
 * Who may use how much paid AI (ADR 0035, owner's answers 2026-11-12). Pure rules: the counters and the single-statement
 * reservation are in ai-budget.ts, the entrance checks in ai-gate.ts.
 *
 * - Per person, per calendar month in their own time zone (day limits per local day). Admins and the demo account skip the
 *   per-person limits but still count toward the company's.
 * - Dollar limits count only work whose cost is known from configured prices (never hard-coded); the counted limits always apply.
 * - Company ceilings (a month and a day, in UTC) with the owner's numbers unless settings say otherwise.
 */

export type PersonLimits = {
  msgsPerDay?: number;
  msgsPerMonth?: number;
  microsPerMonth?: number;
  /** A per-person dollar guard for one day (after launch, so one account can't use up the company's day alone). */
  microsPerDay?: number;
  voiceCallsPerDay?: number;
  voiceCallsPerMonth?: number;
  voiceSecondsPerMonth?: number;
  searchesPerMonth?: number;
  documentsPerMonth?: number;
  tidyRunsPerDay?: number;
};

export type AiSubject = {
  userId: string;
  tz: string;
  plan?: "free" | "pro";
  accountKind: "standard" | "demo";
  isAdmin: boolean;
  /** The skyling's own name, for messages. */
  name: string;
};

export type AiWork =
  | { feature: "chat" | "sms"; firstStep: boolean; estimateMicros: number | null }
  | { feature: "voice"; seconds: number }
  | { feature: "web_search" | "document" | "tidy"; estimateMicros: number | null };

const MICROS_PER_DOLLAR = 1_000_000;

/** What one person may use. Empty = no per-person limit (after launch, until the owner picks a Pro number). */
export function personLimits(
  subject: Pick<AiSubject, "plan" | "accountKind" | "isAdmin">,
  cfg: BillingConfig | null = billingConfig(),
  e = env(),
): PersonLimits {
  if (subject.isAdmin || subject.accountKind === "demo") return {};
  if (inTestingPhase(cfg)) {
    const L = TESTING_LIMITS;
    return {
      msgsPerDay: L.messagesPerDay,
      msgsPerMonth: L.messagesPerMonth,
      microsPerMonth: L.assistantDollarsPerMonth * MICROS_PER_DOLLAR,
      voiceCallsPerDay: L.voiceCallsPerDay,
      voiceCallsPerMonth: L.voiceCallsPerMonth,
      voiceSecondsPerMonth: L.voiceCallsPerMonth * L.voiceCallMinutes * 60,
      searchesPerMonth: L.webSearchesPerMonth,
      documentsPerMonth: L.documentsPerMonth,
      tidyRunsPerDay: L.tidyRunsPerDay,
    };
  }
  // After launch (decision 7): a Pro person keeps a monthly dollar allowance instead of no limit. The number is the owner's to pick and
  // is OFF (no per-person monthly limit) until AI_PRO_MONTH_DOLLARS is set. Meanwhile, and always after launch, one person may use at
  // most a fifth of the company's daily ceiling in a day, so a single account can't use up the day for everyone (counted only where priced).
  const guard = { microsPerDay: Math.round(companyLimits(e).dayMicros * PERSON_DAY_SHARE) };
  if (isPro(subject, cfg) && e.AI_PRO_MONTH_DOLLARS != null) return { ...guard, microsPerMonth: Math.round(e.AI_PRO_MONTH_DOLLARS * MICROS_PER_DOLLAR) };
  return guard;
}

export type CompanyLimits = { monthMicros: number; dayMicros: number; monthCalls: number | null; dayCalls: number | null };

/** One person's share of the company's daily dollar ceiling after launch (a guard I chose, not a price: 20%, so five people can reach the ceiling). */
export const PERSON_DAY_SHARE = 0.2;

/** Owner's numbers for the 10-student test (decision 5): $50 a month, $10 a day, unless settings say otherwise. */
export const COMPANY_DEFAULT_MONTH_DOLLARS = 50;
export const COMPANY_DEFAULT_DAY_DOLLARS = 10;

export function companyLimits(e = env()): CompanyLimits {
  return {
    monthMicros: Math.round((e.AI_GLOBAL_MONTH_DOLLARS ?? COMPANY_DEFAULT_MONTH_DOLLARS) * MICROS_PER_DOLLAR),
    dayMicros: Math.round((e.AI_GLOBAL_DAY_DOLLARS ?? COMPANY_DEFAULT_DAY_DOLLARS) * MICROS_PER_DOLLAR),
    monthCalls: e.AI_GLOBAL_MONTH_CALLS ?? null,
    dayCalls: e.AI_GLOBAL_DAY_CALLS ?? null,
  };
}

/** The company's periods are in UTC. */
export const companyMonth = (now: Date) => now.toISOString().slice(0, 7);
export const companyDay = (now: Date) => now.toISOString().slice(0, 10);
export const companyKey = (period: string, what: "micros" | "calls") => `g:${period}:${what}`;

const personKey = (userId: string, period: string, what: string) => `u:${userId}:${period}:${what}`;

/** The counters one piece of work must fit in. Empty means nothing is counted. */
export function budgetLines(
  subject: AiSubject,
  work: AiWork,
  now: Date,
  limits: PersonLimits = personLimits(subject),
  company: CompanyLimits = companyLimits(),
): BudgetLine[] {
  const day = todayIn(subject.tz, now);
  const month = day.slice(0, 7);
  const id = subject.userId;
  if (subject.isAdmin) limits = {};
  const lines: BudgetLine[] = [];
  const mine = (period: string, what: string, amount: number, limit: number | undefined, kind: BudgetLine["kind"] = "count") => {
    if (limit != null) lines.push({ key: personKey(id, period, what), kind, amount, limit });
  };
  const money = "estimateMicros" in work ? work.estimateMicros : null;
  switch (work.feature) {
    case "chat":
    case "sms":
      if (work.firstStep) {
        mine(day, "msgs", 1, limits.msgsPerDay);
        mine(month, "msgs", 1, limits.msgsPerMonth);
      }
      break;
    case "voice":
      mine(day, "vcalls", 1, limits.voiceCallsPerDay);
      mine(month, "vcalls", 1, limits.voiceCallsPerMonth);
      mine(month, "vsecs", work.seconds, limits.voiceSecondsPerMonth, "seconds");
      break;
    case "web_search":
      mine(month, "searches", 1, limits.searchesPerMonth);
      break;
    case "document":
      mine(month, "docs", 1, limits.documentsPerMonth);
      break;
    case "tidy":
      mine(day, "tidy", 1, limits.tidyRunsPerDay);
      break;
  }
  if (money != null) {
    mine(month, "micros", money, limits.microsPerMonth, "micros");
    mine(day, "micros", money, limits.microsPerDay, "micros");
  }
  // The company's counters. Admins are counted but never stopped by them.
  const stop = (limit: number | null) => (subject.isAdmin ? null : limit);
  if (money != null) {
    lines.push({ key: companyKey(companyMonth(now), "micros"), kind: "micros", amount: money, limit: stop(company.monthMicros) });
    lines.push({ key: companyKey(companyDay(now), "micros"), kind: "micros", amount: money, limit: stop(company.dayMicros) });
  }
  const startsUse = work.feature === "voice" || ("firstStep" in work ? work.firstStep : true);
  if (startsUse && (company.monthCalls != null || company.dayCalls != null)) {
    if (company.monthCalls != null) lines.push({ key: companyKey(companyMonth(now), "calls"), kind: "count", amount: 1, limit: stop(company.monthCalls) });
    if (company.dayCalls != null) lines.push({ key: companyKey(companyDay(now), "calls"), kind: "count", amount: 1, limit: stop(company.dayCalls) });
  }
  return lines;
}

export type AiRefusal = {
  scope: "company" | "person";
  /** msgs, micros, vcalls, vsecs, searches, docs, tidy; or micros / calls for the company. */
  what: string;
  period: "day" | "month";
  key: string;
  limit: number | null;
};

/** Which limit a refused counter key was. */
export function refusalOf(key: string, lines: BudgetLine[]): AiRefusal {
  const parts = key.split(":");
  const company = parts[0] === "g";
  const period = (company ? parts[1] : parts[2]).length === 7 ? "month" : "day";
  return { scope: company ? "company" : "person", what: company ? parts[2] : parts[3], period, key, limit: lines.find((l) => l.key === key)?.limit ?? null };
}

/** When a month's allowance opens again: the 1st, as "December 1". */
export function monthOpensOn(subject: Pick<AiSubject, "tz">, now: Date): string {
  const today = todayIn(subject.tz, now);
  const first = `${today.slice(0, 7)}-01`;
  return formatDateStr(addDaysStr(first, 31).slice(0, 7) + "-01", "MMMM d");
}

/** Seconds until the next local midnight. */
export function secondsToNextDay(subject: Pick<AiSubject, "tz">, now: Date): number {
  const next = startOfLocalDay(addDaysStr(todayIn(subject.tz, now), 1), subject.tz);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

/** What the person reads when work is refused. Never a setting, a model or a number of tokens. */
export function refusalMessage(r: AiRefusal, subject: Pick<AiSubject, "tz" | "name">, now: Date): string {
  if (r.scope === "company") return `${nameAtStart(subject.name)} isn't available right now. Try again later.`;
  const opens = monthOpensOn(subject, now);
  const limit = r.limit;
  if (r.what === "msgs" && limit != null)
    return testingLimitMessage("messages", limit, secondsToNextDay(subject, now), r.period, r.period === "month" ? opens : undefined);
  if (r.what === "vcalls" && limit != null)
    return testingLimitMessage("voice calls", limit, secondsToNextDay(subject, now), r.period, r.period === "month" ? opens : undefined);
  if (r.period === "day") return "You've reached today's limit for this. It opens up again tomorrow. Everything else in the app keeps working.";
  return monthlyLimitMessage(opens);
}
