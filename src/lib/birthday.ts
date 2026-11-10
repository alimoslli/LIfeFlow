import { DATE_RE } from "./dates";

/** LifeFlow is for people 13 and older (Terms, section 2; Privacy, children). */
export const MIN_AGE = 13;

/** Whole years from a "YYYY-MM-DD" birthday to a "YYYY-MM-DD" day. */
export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Why a birthday can't be saved, in plain words, or null when it's fine. */
export function birthDateProblem(birth: string, today: string): string | null {
  if (!DATE_RE.test(birth) || Number.isNaN(new Date(`${birth}T12:00:00Z`).getTime())) return "Pick your birthday.";
  if (birth > today) return "That day hasn't happened yet.";
  if (ageOn(birth, today) > 120) return "Check the year.";
  if (ageOn(birth, today) < MIN_AGE) return `LifeFlow is for people ${MIN_AGE} and older.`;
  return null;
}
