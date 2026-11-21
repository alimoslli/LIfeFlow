/**
 * What the sky says on its own (owner, 2026-11-12: "what are we doing with it? It's not doing as much with it without us
 * asking"; docs/backlog/2026-11-12-useful-sky.md). One ranked list, read by Today's note and the idea clouds: facts from the
 * person's own records, each with one next step. Built by services/sky-insights.ts; ranked here (pure, tested).
 */

/** How it looks: an idea or a good moment, a heads-up, or real trouble (owner: "a darker cloud with a rainstorm"). */
export type Weather = "clear" | "grey" | "storm";

/** A one-tap booking of free time: the date, local "HH:mm" times and what it's for. Comes back with Undo. */
export type SkyBlock = { date: string; start: string; end: string; title: string };

export type SkyAction =
  /** A stored message's own step ("Block it", "Keep or cancel"): answered through the message, so Undo and learning work. */
  | { type: "message"; label: string; messageId: string; href?: string; prompt?: string }
  /** Book this free time now (with Undo). */
  | { type: "block"; label: string; block: SkyBlock }
  /** Ask the skyling, in the person's words. */
  | { type: "ask"; label: string; prompt: string }
  | { type: "open"; label: string; href: string };

export type SkyInsight = {
  /** Stable for the thing it's about (a message id, or the rule's own key). */
  id: string;
  kind: string;
  weather: Weather;
  /** A few words: what it is. */
  headline: string;
  /** One line: why it matters, with the facts. */
  why: string | null;
  action: SkyAction | null;
  /** About money (left out while the Money lock is on). */
  money: boolean;
  /** Higher is more important, within its weather. */
  score: number;
  /** A stored review's full breakdown (the Sunday review), for its sheet. */
  sections?: { heading: string; lines: string[] }[];
};

const ORDER: Record<Weather, number> = { storm: 0, grey: 1, clear: 2 };

/** Storms first, then heads-ups, then ideas; within each, the most important first. One per id. */
export function rankInsights(list: SkyInsight[]): SkyInsight[] {
  const seen = new Set<string>();
  return [...list].sort((a, b) => ORDER[a.weather] - ORDER[b.weather] || b.score - a.score).filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}
