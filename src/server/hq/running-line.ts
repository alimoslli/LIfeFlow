/** One calm line on how the app is running, from real counts only. A part that failed to load is simply left out. */
export type RunningFacts = {
  errors?: { kinds: number; hits: number } | null;
  signups?: { new24h: number; new7d: number } | null;
  notSetUp?: string[] | null;
};

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

export function runningLine(f: RunningFacts): string | null {
  const parts: string[] = [];
  if (f.errors)
    parts.push(
      f.errors.hits === 0
        ? "No errors in the last 24 hours."
        : `${n(f.errors.hits, "error", "errors")} in the last 24 hours (${n(f.errors.kinds, "kind", "kinds")}).`,
    );
  if (f.signups) parts.push(`${n(f.signups.new24h, "sign-up", "sign-ups")} in the last 24 hours, ${f.signups.new7d} in 7 days.`);
  // One or two are named; more is a count (the list is one tap deeper, on App › Health), so the line stays one line.
  if (f.notSetUp?.length)
    parts.push(f.notSetUp.length <= 2 ? `Not set up yet: ${f.notSetUp.join(" and ")}.` : `${f.notSetUp.length} services aren't set up yet.`);
  return parts.length ? parts.join(" ") : null;
}
