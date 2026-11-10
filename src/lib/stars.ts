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

/** What ended, for a push: "Your Target shift", "Bio 101". */
const ended = (s: { title: string; kind: string }) => (s.kind === "work" ? `Your ${s.title} shift` : s.title);

/**
 * The note when something ends (owner, 2026-11-10: "a small dopamine effect"): what ended and that its star is waiting,
 * one line; the tap is the claim (it opens Today, where the stars come out). Things ending together are one note.
 */
export function starPush(name: string, ends: { title: string; kind: string }[]): { title: string; body: string } {
  const n = ends.length;
  const title = n === 1 ? `${name} has a star for you` : `${name} has ${n} stars for you`;
  if (n === 1) return { title, body: `${ended(ends[0])} is over. Tap to claim your star on your sky.` };
  const names = ends.map((e) => (e.kind === "work" ? `your ${e.title} shift` : e.title));
  const list = n === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${n - 2} more`;
  return { title, body: `${list.charAt(0).toUpperCase()}${list.slice(1)} are over. Tap to claim them on your sky.` };
}
