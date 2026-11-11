/**
 * The skyling's cloud (owner, 2026-11-11: "5 unlocks this, 10 unlocks this ... more accurate numbers"; the items and
 * numbers he said yes to on the picture). Stars come from every class, shift and to-do you finish; suns only from the big
 * things, a goal reached or a milestone. Each list unlocks in order; what's earned is decided in services/sky-home.ts.
 */

export type HomeItem = { key: string; name: string; at: number };

export const STAR_ITEMS: HomeItem[] = [
  { key: "lights", name: "Star lights", at: 5 },
  { key: "kite", name: "Kite", at: 25 },
  { key: "puff", name: "Puff, a cloud pet", at: 60 },
  { key: "swing", name: "Swing", at: 120 },
  { key: "hammock", name: "Hammock", at: 250 },
  { key: "slide", name: "Rainbow slide", at: 400 },
];

export const SUN_ITEMS: HomeItem[] = [
  { key: "balloon", name: "Hot-air balloon", at: 1 },
  { key: "house", name: "Cloud house", at: 3 },
  { key: "telescope", name: "Telescope", at: 6 },
  { key: "planet", name: "Tiny planet", at: 10 },
  { key: "garden", name: "Floating garden", at: 15 },
];

export type SkyCounts = { stars: number; suns: number };

/** The keys of everything on the cloud for these counts. */
export function unlocked({ stars, suns }: SkyCounts): Set<string> {
  return new Set([...STAR_ITEMS.filter((i) => stars >= i.at), ...SUN_ITEMS.filter((i) => suns >= i.at)].map((i) => i.key));
}

/** "Next: Puff at 60", or null when all of that kind are there. */
export function nextLine(items: HomeItem[], n: number): string | null {
  const next = items.find((i) => n < i.at);
  if (!next) return null;
  const name = next.key === "puff" ? "Puff" : next.name.toLowerCase();
  return `Next: ${name} at ${next.at}`;
}

const plural = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;

/** "34 stars and 1 sun so far." */
export const countLine = ({ stars, suns }: SkyCounts) => `${plural(stars, "star")} and ${plural(suns, "sun")} so far.`;
