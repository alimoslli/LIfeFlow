import type { IdeaCloud } from "./idea-clouds";

/**
 * The one shape every insight has (owner, 2026-11-12; shared by the insight clouds on Today and any new noticing): a fact, why
 * it matters, and at most one thing to do about it. Producers live in services (src/server/services/insights.ts lists them);
 * the clouds read only `listInsights` and word nothing themselves.
 *
 * - `key` is stable for dedupe (and is what a tap sends back to do the fix; the server finds the fix again itself).
 * - `rank` is higher for more urgent. A clash or a shortfall outranks a curiosity.
 * - `money: true` hides it under the Money lock (the producers also skip reading money then).
 * - `action.ask` fills the chat bar (never sent for them); `action.doIt` is a fix that runs through the same path as every
 *   "Do it" (respondToMessage) and has Undo. Its payload stays on the server.
 * - `tone` is the weather: a tip is a white cloud, a heads_up a grey one, a storm a dark one with rain (real trouble only,
 *   and it always carries the way out).
 * Optional extras for the clouds: `bolt` (a flicker of lightning, only the worst storms), `about` (topics, so two insights
 * about the same thing never show together) and `href` (open a page instead).
 */
export type InsightTone = "tip" | "heads_up" | "storm";
export type InsightAction = { label: string; ask?: string; doIt?: { kind: string; payload: Record<string, unknown> } };
export type Insight = {
  key: string;
  kind: string;
  tone: InsightTone;
  headline: string;
  why: string;
  action?: InsightAction;
  /** The detector or service it comes from. */
  source: string;
  rank: number;
  money?: boolean;
  bolt?: boolean;
  about?: string[];
  href?: string;
};

/** What the skyling's note on Today already says, as topics (the note's id comes from the briefing). */
export function noteTopics(noteId?: string | null): string[] {
  if (!noteId) return [];
  // the sky's own note (lib/sky-insights): what it is about, and its own key for the kinds without a topic
  const sky = [`sky:${noteId}`];
  if (noteId.startsWith("tonight-")) return [...sky, "tonight"];
  if (noteId.startsWith("gap-")) return [...sky, "free"];
  if (noteId.startsWith("due-")) return [...sky, "due"];
  if (noteId.startsWith("conflict")) return ["conflict"];
  if (noteId.startsWith("exam-")) return ["due"];
  if (noteId === "busy-tomorrow") return ["load"];
  if (noteId === "bills-soon") return ["bills"];
  if (noteId.startsWith("overdraft")) return ["shortfall", "bills"];
  if (noteId.startsWith("overdue")) return ["overdue"];
  return [];
}

/** Dedupe by key, most urgent first. */
export function rankInsights(list: Insight[]): Insight[] {
  const seen = new Set<string>();
  return [...list].sort((a, b) => b.rank - a.rank).filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/** At most `count` clouds: the most urgent first, never two about the same thing, none the note already says. */
export function cloudsFrom(list: Insight[], opts: { noteId?: string | null; count?: number } = {}): IdeaCloud[] {
  const taken = new Set(noteTopics(opts.noteId));
  const out: IdeaCloud[] = [];
  for (const i of rankInsights(list)) {
    if (out.length >= (opts.count ?? 3)) break;
    const about = i.about?.length ? i.about : [i.key];
    if (about.some((a) => taken.has(a))) continue;
    about.forEach((a) => taken.add(a));
    out.push({
      key: `insight:${i.kind}`,
      say: i.headline,
      why: i.why,
      cta: i.action?.label ?? "Ask",
      weather: i.tone === "heads_up" ? "heads-up" : i.tone,
      bolt: i.bolt,
      ask: i.action?.ask ?? "",
      act: i.action?.doIt ? { type: "do", ref: i.key } : i.href ? { type: "open", href: i.href } : undefined,
    });
  }
  return out;
}
