/**
 * Step 0 and 1 of docs/backlog/2026-11-12-local-models.md: today's way against the local model, job by job, on made-up
 * data only (no paid call here; the one small-model run is scripts/local-models/tidy-ai-run.ts). Thresholds are tuned on
 * the "dev" half and reported on the "test" half, so the numbers aren't fitted to the cases they're scored on.
 *   npx tsx --conditions=react-server --env-file=.env scripts/local-models/compare.ts [minilm|bge]
 * Writes docs/backlog/2026-11-12-local-models-results.json (the report reads it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { selectMemories, type RetrievableMemory } from "../../src/server/jarvis/memory-retrieval";
import { selectToolGroups } from "../../src/server/jarvis/tool-select";
import { routeSkills, SKILLS } from "../../src/server/jarvis/skills";
import { GROUP_TOOLS, type ToolGroup } from "../../src/server/jarvis/tool-groups";
import { keywordCategory } from "../../src/server/services/finance/categorize";
import { DEFAULT_CATEGORIES } from "../../src/server/services/finance/categories";
import { embed, cosine } from "../../src/server/local-models/embedder";
import { localTidy } from "../../src/server/local-models/tidy";
import { meaningGroups } from "../../src/server/local-models/tools";
import type { LocalModel } from "../../src/server/local-models/models";
import { CASES, M } from "../../tests/fixtures/memory-cases";
import { MEANING_CASES, MEANING_MEMORIES } from "../../tests/fixtures/memory-meaning";
import { EVAL } from "../../tests/fixtures/jarvis-eval";

const key = (process.argv[2] === "bge" ? "bge" : "minilm") as LocalModel["key"];
process.env.LOCAL_MODEL = key;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const time = async <T>(f: () => Promise<T>) => {
  const t = performance.now();
  const v = await f();
  return { v, ms: performance.now() - t };
};

// ---------------------------------------------------------------- cold start and speed
const cold = await time(() => embed(["warm up"], key));
if (!cold.v) throw new Error("the local model isn't there: run scripts/fetch-local-models.ts first");
const warm: number[] = [];
for (let i = 0; i < 30; i++) warm.push((await time(() => embed([`a short request number ${i}`], key))).ms);
warm.sort((a, b) => a - b);

// ---------------------------------------------------------------- 1. memories
type MemCase = { q: string; recent?: string[]; must: string[]; never: string[]; split: "dev" | "test" | "existing" };
const memSets: { mems: RetrievableMemory[]; cases: MemCase[] }[] = [
  { mems: M, cases: CASES.map((c) => ({ ...c, split: "existing" as const })) },
  { mems: MEANING_MEMORIES, cases: MEANING_CASES },
];
// every request's meaning scores, worked out once
const scored: { set: number; c: MemCase; meaning: Map<string, number> }[] = [];
for (const [set, { mems, cases }] of memSets.entries()) {
  const others = mems.filter((m) => m.category !== "instruction");
  const mv = (await embed(others.map((m) => m.content), key))!;
  for (const c of cases) {
    const [qv] = (await embed([c.q], key))!;
    scored.push({ set, c, meaning: new Map(others.map((m, i) => [m.id, cosine(qv, mv[i])])) });
  }
}
function memScore(rows: typeof scored, min: number | null) {
  let need = 0,
    hit = 0,
    forb = 0,
    wrong = 0,
    sent = 0;
  const misses: string[] = [];
  for (const r of rows) {
    const ids = new Set(selectMemories(memSets[r.set].mems, { text: r.c.q, recent: r.c.recent }, min === null ? {} : { meaning: r.meaning, meaningMin: min }).map((m) => m.id));
    need += r.c.must.length;
    hit += r.c.must.filter((id) => ids.has(id)).length;
    forb += r.c.never.length;
    wrong += r.c.never.filter((id) => ids.has(id)).length;
    sent += ids.size - 1;
    for (const id of r.c.must) if (!ids.has(id)) misses.push(`missed "${id}" for "${r.c.q}"`);
    for (const id of r.c.never) if (ids.has(id)) misses.push(`sent "${id}" for "${r.c.q}"`);
  }
  return { recall: round(hit / need), falseRate: round(wrong / forb), avgSent: round(sent / rows.length, 1), misses };
}
const of = (split: MemCase["split"]) => scored.filter((r) => r.c.split === split);
// the bar: the lowest that keeps every existing case right and sends nothing it shouldn't on dev
let memMin = 1;
for (let m = 0.2; m <= 0.7; m += 0.01) {
  const ex = memScore(of("existing"), m);
  const dev = memScore(of("dev"), m);
  if (ex.recall === 1 && ex.falseRate === 0 && dev.falseRate === 0) {
    memMin = round(m, 2);
    break;
  }
}
const memories = {
  bar: memMin,
  today: { existing: memScore(of("existing"), null), dev: memScore(of("dev"), null), test: memScore(of("test"), null) },
  local: { existing: memScore(of("existing"), memMin), dev: memScore(of("dev"), memMin), test: memScore(of("test"), memMin) },
};

// ---------------------------------------------------------------- 2. tools
const groupOf = new Map(Object.entries(GROUP_TOOLS).flatMap(([g, ts]) => ts.map((t) => [t, g as ToolGroup] as const)));
type ToolCase = { q: string; need: ToolGroup[]; split: "dev" | "test" };
const toolCases: ToolCase[] = EVAL.map((e, i) => ({
  q: e.question,
  need: [...new Set(e.plan.map((p) => groupOf.get(p.tool)!).filter((g) => g && g !== "core"))],
  split: i % 2 ? ("test" as const) : ("dev" as const),
}));
for (const s of SKILLS) {
  const need = [...new Set(s.tools.map((t) => groupOf.get(t)).filter((g): g is ToolGroup => !!g && g !== "core"))];
  if (!need.length) continue;
  const evals = JSON.parse(readFileSync(`skills/${s.name}/evals.json`, "utf8")) as { prompt: string }[];
  evals.forEach((e, i) => toolCases.push({ q: e.prompt, need, split: i % 2 ? "test" : "dev" }));
}
async function groupsByMeaning(q: string, min: number) {
  return (await meaningGroups(q, min, true)) ?? [];
}
async function toolScore(cases: ToolCase[], mode: "today" | "words-only" | "today+local" | "local-only", min = 0) {
  let full = 0,
    extra = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const skills = mode === "words-only" || mode === "local-only" ? [] : routeSkills(c.q);
    let got = mode === "local-only" ? ["core" as ToolGroup] : selectToolGroups({ text: c.q, skills, history: [] });
    if (mode === "today+local" || mode === "local-only") got = [...new Set([...got, ...(await groupsByMeaning(c.q, min))])];
    const ok = c.need.every((g) => got.includes(g));
    if (ok) full++;
    else misses.push(`"${c.q}" needed ${c.need.filter((g) => !got.includes(g)).join(", ")}`);
    extra += got.filter((g) => g !== "core" && !c.need.includes(g)).length;
  }
  return { allNeeded: round(full / cases.length), avgExtraGroups: round(extra / cases.length, 2), misses: misses.slice(0, 12) };
}
const tDev = toolCases.filter((c) => c.split === "dev");
const tTest = toolCases.filter((c) => c.split === "test");
// the bar for "today + meaning": the one with the best coverage on dev for at most half a group extra over today
const todayDev = await toolScore(tDev, "today");
let toolMin = 0.6;
let bestCov = todayDev.allNeeded;
for (let m = 0.6; m >= 0.25; m -= 0.025) {
  const s = await toolScore(tDev, "today+local", m);
  if (s.avgExtraGroups <= todayDev.avgExtraGroups + 0.5 && s.allNeeded > bestCov) {
    bestCov = s.allNeeded;
    toolMin = round(m, 3);
  }
}
const tools = {
  cases: toolCases.length,
  bar: toolMin,
  today: await toolScore(tTest, "today"),
  wordsOnly: await toolScore(tTest, "words-only"),
  todayPlusLocal: await toolScore(tTest, "today+local", toolMin),
  dev: { today: todayDev, todayPlusLocal: await toolScore(tDev, "today+local", toolMin) },
};

// ---------------------------------------------------------------- 3. purchases
type P = { id: string; description: string; merchant: string | null; amountCents: number; label: string; accept: string[] };
const purchases = JSON.parse(readFileSync("tests/fixtures/purchases-labelled.json", "utf8")) as P[];
const names = DEFAULT_CATEGORIES.filter((c) => c.kind === "expense").flatMap((c) => [c.name, ...(c.children ?? [])]);
const split = (p: P, i: number) => (i % 2 ? "test" : "dev");
// today, without AI: the person's rules (none here) and the keyword list
const kw = purchases.map((p) => keywordCategory({ merchantName: p.merchant, description: p.description }, p.amountCents));
function tidyScore(idx: number[], guess: (i: number) => string | null) {
  let right = 0,
    wrong = 0,
    none = 0;
  const wrongs: string[] = [];
  for (const i of idx) {
    const g = guess(i);
    if (!g) none++;
    else if (purchases[i].accept.includes(g)) right++;
    else {
      wrong++;
      wrongs.push(`${purchases[i].description} → ${g} (is ${purchases[i].label})`);
    }
  }
  return { n: idx.length, right, wrong, unsorted: none, accuracy: round(right / idx.length), wrongs: wrongs.slice(0, 15) };
}
const idx = (s: "dev" | "test") => purchases.map((p, i) => [p, i] as const).filter(([p, i]) => split(p, i) === s).map(([, i]) => i);
const unknown = (s: "dev" | "test") => idx(s).filter((i) => !kw[i]);
async function localGuesses(t: { min: number; margin: number }) {
  const left = purchases.map((p, i) => [p, i] as const).filter(([, i]) => !kw[i]);
  const out = await localTidy(t)(
    left.map(([p, i]) => ({ key: String(i), text: p.merchant ? `${p.merchant} ${p.description}` : p.description, spent: true })),
    names,
  );
  return new Map(out.map((g) => [Number(g.key), g.category]));
}
let tidyBest = { min: 0.3, margin: 0.02, score: -1 };
for (let min = 0.2; min <= 0.6; min += 0.05)
  for (const margin of [0, 0.01, 0.02, 0.04, 0.06]) {
    const g = await localGuesses({ min, margin });
    const s = tidyScore(unknown("dev"), (i) => g.get(i) ?? null);
    // right minus wrong: a wrong category costs as much as a right one helps (the person has to fix it)
    const score = s.right - s.wrong;
    if (score > tidyBest.score) tidyBest = { min: round(min, 2), margin, score };
  }
const tg = await localGuesses(tidyBest);
const tidy = {
  purchases: purchases.length,
  bar: { min: tidyBest.min, margin: tidyBest.margin },
  keywordsAlone: { all: tidyScore([...purchases.keys()], (i) => kw[i]), unknownShare: round(kw.filter((k) => !k).length / purchases.length) },
  test: {
    today: tidyScore(idx("test"), (i) => kw[i]),
    todayPlusLocal: tidyScore(idx("test"), (i) => kw[i] ?? tg.get(i) ?? null),
    localOnTheUnknown: tidyScore(unknown("test"), (i) => tg.get(i) ?? null),
  },
};

// ---------------------------------------------------------------- write
const results = {
  model: key,
  when: new Date().toISOString().slice(0, 10),
  speed: { coldMs: Math.round(cold.ms), warmMedianMs: round(warm[15], 1), warmP95Ms: round(warm[28], 1) },
  memories,
  tools,
  tidy,
};
writeFileSync(`docs/backlog/2026-11-12-local-models-results-${key}.json`, `${JSON.stringify(results, null, 1)}\n`);
console.log(JSON.stringify({ ...results, memories: { bar: memories.bar, today: memories.today.test, local: memories.local.test }, tools: { bar: tools.bar, today: tools.today, plus: tools.todayPlusLocal }, tidy: tidy.test }, null, 1));
