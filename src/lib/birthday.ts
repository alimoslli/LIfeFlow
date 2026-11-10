import { DATE_RE } from "./dates";

/** LifeFlow is for people 13 and older (Terms, section 2; Privacy, children). */
export const MIN_AGE = 13;
/** Said once, calmly, with no invitation to try another year (owner, 2026-11-10). */
export const AGE_LINE = `LifeFlow is for people ${MIN_AGE} and older.`;
/**
 * Below this a date is a slip, never an answer (a phone's date picker opens on today, and one tap saves it; the review of
 * 0c77531): it gets "Check the year." and can never lock an account.
 */
export const MIN_PLAUSIBLE_AGE = 5;
export const CHECK_YEAR = "Check the year.";
/** Said when setup can't finish without one. */
export const BIRTHDAY_NEEDED = "Add your birthday to finish setting up.";

/** Whole years from a "YYYY-MM-DD" birthday to a "YYYY-MM-DD" day. */
export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Why a birthday can't be saved, in plain words, or null when it's fine. */
export function birthDateProblem(birth: string, today: string): string | null {
  // a real day only: "2010-02-31" would roll over to March 3
  const parsed = new Date(`${birth}T00:00:00Z`);
  if (!DATE_RE.test(birth) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth) return "Pick your birthday.";
  if (birth > today) return "That day hasn't happened yet.";
  if (ageOn(birth, today) > 120 || ageOn(birth, today) < MIN_PLAUSIBLE_AGE) return CHECK_YEAR;
  if (ageOn(birth, today) < MIN_AGE) return AGE_LINE;
  return null;
}

/** A real birthday that makes them younger than 13 today (the welcome then stays locked for the account). */
export const isUnderAge = (birth: string, today: string) => birthDateProblem(birth, today) === AGE_LINE;
