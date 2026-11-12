import type { MeaningScores, RetrievableMemory, RetrievalQuery } from "../jarvis/memory-retrieval";
import { cosine, embed, localModelOn } from "./embedder";

/** Most memories whose meaning is checked in one request (the rest still go by their words). */
const MAX_MEMORIES = 200;

/**
 * How close each memory's meaning is to the request, for `selectMemories` (`meaning`). Undefined when the switch is off
 * or the model isn't there, so picking goes by words alone, as today. Worked out in this request's memory only and never
 * stored (the COO's rule 1, 2026-11-12): the vectors are dropped when this returns.
 */
export async function meaningScores(all: RetrievableMemory[], q: RetrievalQuery, on = localModelOn("memory")): Promise<MeaningScores | undefined> {
  if (!on || !q.text.trim()) return undefined;
  const mems = all.filter((m) => m.category !== "instruction").slice(0, MAX_MEMORIES);
  if (!mems.length) return undefined;
  const vecs = await embed([q.text, ...mems.map((m) => m.content)]);
  if (!vecs) return undefined;
  const [query, ...rest] = vecs;
  return new Map(mems.map((m, i) => [m.id, cosine(query, rest[i])]));
}
