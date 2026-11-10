/**
 * The stars you claim on coming back (owner, 2026-11-10): what the skyling passed on your sky while you were away,
 * one star each with what it was for, and the sun to finish when there were a few. Words only here; what counts is
 * decided in services/stars.ts.
 */

/** Stars shown one by one; anything past this is one more star that says how many. */
export const MAX_STARS = 8;
/** The sun finishes the run from this many. */
export const SUN_FROM = 3;

const DONE: Record<string, string> = {
  class: "class done",
  exam: "exam done",
  work: "shift done",
  study: "studied",
};

const short = (title: string) => {
  const t = title.trim().replace(/\s+/g, " ");
  return t.length > 24 ? `${t.slice(0, 23).trimEnd()}…` : t;
};

/** "Bio 101 · class done", "Target · shift done", "Gym · done". */
export function starLabel(title: string, kind: string): string {
  return `${short(title)} · ${DONE[kind] ?? "done"}`;
}

export const moreLabel = (n: number) => `+${n} more done`;

/** The sun's words, or none when there were only one or two. */
export const sunLabel = (n: number) => (n >= SUN_FROM ? `${n} done while you were away` : null);

/** One sentence for screen readers: what was claimed, in order. */
export function spokenStars(titles: string[]): string {
  if (!titles.length) return "";
  const list = titles.length > 3 ? `${titles.slice(0, 3).join(", ")} and ${titles.length - 3} more` : titles.join(", ");
  return `${titles.length} done while you were away: ${list}.`;
}
