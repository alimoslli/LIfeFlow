import type { JarvisModule, MemoryBasis, MemoryCategory } from "../db/schema";

/**
 * Chooses which of the user's approved memories go in front of the model for
 * one request, so Jarvis sees what's relevant instead of everything.
 *
 * Pure and deterministic (tested with labelled fixtures in
 * tests/unit/memory-retrieval.test.ts). Lexical scoring plus topic
 * ("intent") matching; replaceable by embeddings later behind the same
 * signature.
 */

export type RetrievableMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  basis: MemoryBasis;
  updatedAt: Date;
  lastUsedAt: Date | null;
};

export type RetrievalQuery = {
  /** The current user message. */
  text: string;
  /** The previous user messages in this conversation (most recent last), for follow-ups. */
  recent?: string[];
  module?: JarvisModule | null;
};

export type Scored<M> = M & { score: number; why: "instruction" | "relevant" };

export const RETRIEVAL_DEFAULTS = { limit: 12, maxChars: 2400, minScore: 0.35, maxInstructions: 15 };

const STOP = new Set(
  "a an the and or but if so to of in on at for by with from about into over under up down out off is am are was were be been being do does did have has had i me my mine we our you your yours he she it its they them their this that these those what which who whom whose when where why how can could would should will shall may might must just also very really any some all no not only than then there here too again more most much many few each every other such own same as like get got make made let know think want need please thanks thank hi hello hey ok okay yes yeah jarvis prefer prefers user".split(
    " ",
  ),
);

const DAY_ALIASES: Record<string, string> = {
  monday: "mon",
  tuesday: "tue",
  tues: "tue",
  wednesday: "wed",
  thursday: "thu",
  thurs: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

/** Crude English stemmer; good enough to match "studying"/"studied"/"study", "shifts"/"shift", "saving"/"save". */
export function stem(word: string): string {
  let w = word;
  if (DAY_ALIASES[w]) return DAY_ALIASES[w];
  if (w.endsWith("'s")) w = w.slice(0, -2);
  // plurals
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // verb endings
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1); // save/saving → sav
  if (w.length > 3 && w.endsWith("i")) w = `${w.slice(0, -1)}y`; // studi(ed) → study
  if (w.length > 3 && /([bdgmnprt])\1$/.test(w)) w = w.slice(0, -1); // plann(ing) → plan
  return DAY_ALIASES[w] ?? w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\$\s?\d/g, " money ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Topics a request or memory is about. Words are matched after stemming. */
const INTENTS: Record<string, string[]> = {
  schedule:
    "plan schedule week day today tomorrow tonight morning afternoon evening night weekend free time when calendar busy routine mon tue wed thu fri sat sun early late hour".split(
      " ",
    ),
  money:
    "money spend spent budget afford save saving buy cost price pay bill rent dollar income paycheck invest cash expensive cheap debt loan credit card subscription trip".split(
      " ",
    ),
  school: "class course exam quiz homework assignment study professor grade midterm final essay paper lecture lab semester campus".split(" "),
  work: "work job shift boss manager hour overtime paycheck coworker library employer".split(" "),
  food: "food eat dinner lunch breakfast meal recipe cook restaurant grocery diet calory vegetarian vegan allergy allergic takeout snack coffee".split(" "),
  health: "health sleep gym workout exercise run doctor sick stress stressed tired energy weight".split(" "),
  people: "family mom dad sister brother friend girlfriend boyfriend wife husband kid birthday".split(" "),
  transport: "car drive bus train bike commute uber parking".split(" "),
};
const INTENT_WORDS = Object.fromEntries(Object.entries(INTENTS).map(([k, ws]) => [k, new Set(ws.map(stem))]));

const MODULE_INTENTS: Partial<Record<JarvisModule, string[]>> = {
  finances: ["money"],
  wealth: ["money"],
  school: ["school", "schedule"],
  work: ["work", "schedule"],
  calendar: ["schedule"],
  tasks: ["schedule"],
};

function intentsOf(toks: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of toks) for (const [k, set] of Object.entries(INTENT_WORDS)) if (set.has(t)) out.add(k);
  return out;
}

/** Ranks memories for a request. Instructions (how to behave) are always included. */
export function selectMemories<M extends RetrievableMemory>(all: M[], q: RetrievalQuery, opts: Partial<typeof RETRIEVAL_DEFAULTS> = {}): Scored<M>[] {
  const o = { ...RETRIEVAL_DEFAULTS, ...opts };
  const instructions = all
    .filter((m) => m.category === "instruction")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, o.maxInstructions)
    .map((m) => ({ ...m, score: 1, why: "instruction" as const }));

  // Query terms: the current message counts fully, earlier messages half.
  const weights = new Map<string, number>();
  const add = (t: string, w: number) => weights.set(t, Math.max(weights.get(t) ?? 0, w));
  const current = tokens(q.text);
  for (const t of current) add(t, 1);
  for (const r of (q.recent ?? []).slice(-2)) for (const t of tokens(r)) add(t, 0.5);
  const queryIntents = intentsOf(current);
  // A follow-up ("what about next weekend?") inherits the previous message's topics.
  const recentIntents = intentsOf((q.recent ?? []).slice(-1).flatMap(tokens));
  const moduleIntents = new Set(MODULE_INTENTS[q.module ?? "home"] ?? []);

  // Rarer words matter more (idf over this user's memories).
  const others = all.filter((m) => m.category !== "instruction");
  const memTokens = new Map(others.map((m) => [m.id, new Set(tokens(m.content))]));
  const df = new Map<string, number>();
  for (const set of memTokens.values()) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + others.length / (df.get(t) ?? 1)) / Math.log(1 + others.length) || 1;

  const scored: Scored<M>[] = [];
  for (const m of others) {
    const mt = memTokens.get(m.id)!;
    if (!mt.size) continue;
    let lexical = 0;
    for (const [t, w] of weights) if (mt.has(t)) lexical += w * idf(t);
    lexical /= Math.sqrt(mt.size);
    const mi = intentsOf(mt);
    let topic = 0;
    for (const i of mi) {
      if (queryIntents.has(i)) topic = Math.max(topic, 0.5);
      else if (recentIntents.has(i)) topic = Math.max(topic, 0.4);
      else if (moduleIntents.has(i)) topic = Math.max(topic, 0.2); // where Jarvis was opened: a nudge, never enough alone
    }
    const score = lexical + topic + (m.category === "temporary" && (lexical > 0 || topic > 0) ? 0.1 : 0);
    if (score >= o.minScore) scored.push({ ...m, score, why: "relevant" });
  }
  scored.sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime());

  const out: Scored<M>[] = [...instructions];
  let chars = instructions.reduce((n, m) => n + m.content.length, 0);
  for (const m of scored) {
    if (out.length >= o.limit + instructions.length || chars + m.content.length > o.maxChars) break;
    out.push(m);
    chars += m.content.length;
  }
  return out;
}
