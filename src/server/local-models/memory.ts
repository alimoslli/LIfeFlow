import type { MeaningScores, RetrievableMemory, RetrievalQuery } from "../jarvis/memory-retrieval";
import type { LocalModel } from "./models";
import { cosine, embed, isReady, localModelOn, warm } from "./embedder";

/**
 * How close in meaning a memory must be to count on its own, per model: the bar the comparison chose on the dev half of the
 * labelled cases (scripts/local-models/compare.mts; every existing case stays right and nothing wrong is added on dev).
 */
export const MEANING_MIN: Record<LocalModel["key"], number> = { minilm: 0.2, bge: 0.6 };

/**
 * Most memories whose meaning is checked in one request, the most recently updated first; the rest still go by their
 * words. 100 keeps it inside the 300 ms rule (about 160 ms measured; 200 took 322 ms).
 */
export const MAX_MEMORIES = 100;

/**
 * How close each memory's meaning is to the request, for `selectMemories` (`meaning`). Undefined when the switch is off,
 * the model isn't there, or it is still loading on a cold instance, so picking goes by words alone, as today. Worked out in this request's memory only and never
 * stored (the COO's rule 1, 2026-11-12): the vectors are dropped when this returns.
 */
export async function meaningScores(all: RetrievableMemory[], q: RetrievalQuery, on = localModelOn("memory")): Promise<MeaningScores | undefined> {
  if (!on || !q.text.trim()) return undefined;
  // a cold instance doesn't make this turn wait for the model: it starts loading, and this turn goes by words
  if (!isReady()) {
    warm();
    return undefined;
  }
  const mems = all
    .filter((m) => m.category !== "instruction")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, MAX_MEMORIES);
  if (!mems.length) return undefined;
  const vecs = await embed([q.text, ...mems.map((m) => m.content)]);
  if (!vecs) return undefined;
  const [query, ...rest] = vecs;
  return new Map(mems.map((m, i) => [m.id, cosine(query, rest[i])]));
}
