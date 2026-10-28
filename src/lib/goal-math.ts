import { addDaysStr, daysBetween } from "./dates";

/** Pure goal math, shared by the server and the goal trade-off slider. */

/** Months from today to a YYYY-MM-DD date, rounded, at least 0. */
export const monthsUntil = (today: string, date: string) => Math.max(0, Math.round(daysBetween(today, date) / 30.44));
const addMonths = (today: string, months: number) => addDaysStr(today, Math.round(months * 30.44));

/** When the goal finishes at a monthly pace, and how a change in pace moves it. Pure. */
export function goalProjection(g: { targetCents: number; savedCents: number; targetDate: string | null }, monthlyCents: number, today: string) {
  const remaining = Math.max(0, g.targetCents - g.savedCents);
  if (remaining === 0) return { remainingCents: 0, monthsToGo: 0, projectedDate: today, onTrack: true };
  if (monthlyCents <= 0) return { remainingCents: remaining, monthsToGo: null, projectedDate: null, onTrack: g.targetDate ? false : null };
  const months = Math.ceil(remaining / monthlyCents);
  const projectedDate = addMonths(today, months);
  return { remainingCents: remaining, monthsToGo: months, projectedDate, onTrack: g.targetDate ? projectedDate <= g.targetDate : null };
}

/** "Cutting $60 a month gets you there N months sooner." Pure. */
export function goalTradeoff(g: { targetCents: number; savedCents: number }, monthlyCents: number, extraMonthlyCents: number) {
  const remaining = Math.max(0, g.targetCents - g.savedCents);
  const before = monthlyCents > 0 ? Math.ceil(remaining / monthlyCents) : null;
  const after = monthlyCents + extraMonthlyCents > 0 ? Math.ceil(remaining / (monthlyCents + extraMonthlyCents)) : null;
  return { monthsBefore: before, monthsAfter: after, monthsSooner: before != null && after != null ? before - after : null };
}
