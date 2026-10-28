import type { AgendaItem } from "../services/calendar";

/** Plain facts about the user's life right now, gathered once, then interpreted by pure rules. */
export type LifeSnapshot = {
  now: Date;
  tz: string;
  today: string;
  firstName: string;
  studyTime?: "morning" | "afternoon" | "evening" | "night";
  /** Next 7 days, starting today (events, shifts, deadlines, due tasks). */
  week: AgendaItem[];
  overdue: { id: string; title: string; context: string; dueAt: Date; kind: "assignment" | "task"; href: string }[];
  exams: { id: string; title: string; course: string; dueAt: Date; kind: string; href: string }[];
  /** Free blocks of 60+ min in the next 7 days between 08:00 and 22:00. */
  freeMinutesByDay: { date: string; minutes: number; longest: number; morningMinutes: number }[];
  money: MoneySnapshot | null;
};

/**
 * Money facts only, never projections: income counts once it has reached an
 * account, because take-home pay isn't known until then.
 */
export type MoneySnapshot = {
  /** Checking + cash accounts (savings excluded). */
  liquidCents: number;
  savingsCents: number;
  creditOwedCents: number;
  netWorthCents: number;
  /** When the oldest account balance was last updated (synced or entered). */
  asOf: Date | null;
  /** The range the month totals cover, e.g. "Oct 1 to 28, 2026". */
  periodLabel: string;
  spentThisMonthCents: number;
  incomeThisMonthCents: number;
  /** Spend over the same number of days last month. */
  lastMonthSameSpanSpendCents: number;
  billsNext30: { name: string; date: string; amountCents: number }[];
  overBudget: { category: string; spentCents: number; limitCents: number; topMerchant: string | null; topMerchantChangeCents: number | null }[];
  goals: { name: string; percent: number; monthlyNeededCents: number | null; targetDate: string | null }[];
  investments: { valueCents: number; returnPct: number | null; asOf: Date | null } | null;
  /** Budgets not over yet but on pace to be, with a specific fix. */
  headingOver?: { category: string; projectedCents: number; limitCents: number; fix: string | null }[];
  safeToSpend?: { todayCents: number; short: boolean } | null;
  /** First projected day checking goes below $0 in the next 14 days (with expected pay, or without it). */
  overdraft?: { date: string; evenWithPay: boolean } | null;
  hasDemoData: boolean;
};

export type InsightTone = "attention" | "heads-up" | "good";
export type InsightIcon = "clock" | "conflict" | "book" | "money" | "trend" | "calendar" | "goal" | "spark";

export type InsightAction = { label: string; href?: string; prompt?: string };

export type Insight = {
  id: string;
  tone: InsightTone;
  icon: InsightIcon;
  /** One plain sentence. */
  text: string;
  detail?: string;
  action?: InsightAction;
  /** Higher = more important. */
  score: number;
};

export type MoneyGlance = {
  liquidCents: number;
  spentCents: number;
  incomeCents: number;
  periodLabel: string;
  asOf: Date | null;
  safeTodayCents: number | null;
};

export type DayGlance = { date: string; label: string; busyMinutes: number; deadlines: number; exam: boolean; isToday: boolean };

export type Briefing = {
  headline: string;
  summary: string;
  next: AgendaItem | null;
  today: AgendaItem[];
  insights: Insight[];
  money: MoneyGlance | null;
  week: DayGlance[];
};
