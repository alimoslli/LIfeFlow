/**
 * Counts what one answer sends (docs/backlog/2026-11-12-model-costs.md), from the bodies tests/integration/request-size.test.ts
 * wrote. Free: no model is called. OpenAI's public tokenizer (o200k, the Xenova/gpt-4o copy on Hugging Face) does the counting:
 *
 *   mkdir -p .models/tok && curl -sSL -o .models/tok/tokenizer.json https://huggingface.co/Xenova/gpt-4o/resolve/main/tokenizer.json
 *   curl -sSL -o .models/tok/tokenizer_config.json https://huggingface.co/Xenova/gpt-4o/resolve/main/tokenizer_config.json
 *   MEASURE_OUT=/tmp/request-size.json npx vitest run tests/integration/request-size.test.ts
 *   npx tsx scripts/local-models/request-tokens.mts .models/tok /tmp/request-size.json
 */
import { readFileSync } from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
const TOK = process.argv[2];
const DATA = process.argv[3];
const tj = JSON.parse(readFileSync(`${TOK}/tokenizer.json`, "utf8"));
const tc = JSON.parse(readFileSync(`${TOK}/tokenizer_config.json`, "utf8"));
const tok = new Tokenizer(tj, tc);
const n = (s: string) => tok.encode(s, { add_special_tokens: false }).ids.length;
type Step = { model: string; toolCount: number; text: { instructions: string; tools: string; input: string } };
type Row = {
  id: string;
  mode: string;
  step: number;
  model: string;
  toolCount: number;
  staticTok: number;
  ctx: number;
  tools: number;
  input: number;
  total: number;
};
const data = JSON.parse(readFileSync(DATA, "utf8")) as { id: string; mode: string; steps: Step[] }[];
// static INSTRUCTIONS = the longest common prefix of every request's instructions
const all = data.flatMap((d) => d.steps.map((s) => s.text.instructions));
let p = all[0];
for (const s of all) {
  let i = 0;
  while (i < p.length && p[i] === s[i]) i++;
  p = p.slice(0, i);
}
const staticTok = n(p);
console.log("static instructions tokens", staticTok, "chars", p.length);
const rows: Row[] = [];
for (const d of data) {
  d.steps.forEach((s, i) => {
    const ctx = n(s.text.instructions.slice(p.length)),
      tools = n(s.text.tools),
      input = n(s.text.input);
    rows.push({
      id: d.id,
      mode: d.mode,
      step: i + 1,
      model: s.model,
      toolCount: s.toolCount,
      staticTok,
      ctx,
      tools,
      input,
      total: staticTok + ctx + tools + input,
    });
  });
}
for (const r of rows)
  console.log(
    [r.mode, r.id, "step" + r.step, r.model, "tools#" + r.toolCount, "ctx " + r.ctx, "tools " + r.tools, "input " + r.input, "TOTAL " + r.total].join("\t"),
  );
const per = (mode: string) => {
  const m = new Map<string, number>();
  for (const r of rows.filter((r) => r.mode === mode)) m.set(r.id, (m.get(r.id) ?? 0) + r.total);
  return [...m.values()];
};
for (const mode of ["fresh", "one-chat"]) {
  const v = per(mode).sort((a, b) => a - b);
  console.log(
    mode,
    "per answer (all steps) min",
    v[0],
    "median",
    v[Math.floor(v.length / 2)],
    "max",
    v.at(-1),
    "mean",
    Math.round(v.reduce((a, b) => a + b, 0) / v.length),
  );
}
const fs = rows
  .filter((r) => r.mode === "fresh" && r.step === 1)
  .map((r) => r.total)
  .sort((a, b) => a - b);
console.log("fresh first step min", fs[0], "median", fs[Math.floor(fs.length / 2)], "max", fs.at(-1));
