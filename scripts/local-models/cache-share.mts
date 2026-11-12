/**
 * How much of each request a provider's prompt cache could serve (COO review of the long-chat trim, 2026-11-12: "show the
 * cache-hit share on the eval, not just total tokens"). Free: it reads request bodies written by
 * tests/integration/request-size.test.ts (on claude/long-chat-trim) and counts with OpenAI's public tokenizer.
 *
 * The cache rule modelled is OpenAI's documented one: a request reuses the longest start it shares with an earlier request
 * (tools first, then the instructions, then the conversation), counted in steps of 128 tokens and only from 1,024 tokens.
 * Prices are passed in (never hard-coded): --in 5 --cached 0.5 per million.
 *
 *   npx tsx scripts/local-models/cache-share.mts <tokenizer dir> --in 5 --cached 0.5 name=file.json [name=file.json ...]
 */
import { readFileSync } from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";

const argv = process.argv.slice(2);
const TOK = argv[0];
const num = (k: string) => Number(argv[argv.indexOf(`--${k}`) + 1]);
const priceIn = num("in");
const priceCached = num("cached");
const runs = argv.filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]);
const tok = new Tokenizer(JSON.parse(readFileSync(`${TOK}/tokenizer.json`, "utf8")), JSON.parse(readFileSync(`${TOK}/tokenizer_config.json`, "utf8")));
const count = (s: string) => tok.encode(s, { add_special_tokens: false }).ids.length;

type Step = { text: { instructions: string; tools: string; input: string } };
for (const [name, file] of runs) {
  const data = JSON.parse(readFileSync(file, "utf8")) as { id: string; mode: string; steps: Step[] }[];
  const prompts = data.filter((d) => d.mode === "one-chat").flatMap((d) => d.steps.map((s) => s.text.tools + s.text.instructions + s.text.input));
  let total = 0;
  let cached = 0;
  prompts.forEach((p, i) => {
    let shared = 0;
    for (let j = 0; j < i; j++) {
      const q = prompts[j];
      let k = 0;
      const max = Math.min(p.length, q.length);
      while (k < max && p.charCodeAt(k) === q.charCodeAt(k)) k++;
      shared = Math.max(shared, k);
    }
    const all = count(p);
    const head = shared ? count(p.slice(0, shared)) : 0;
    const reused = head >= 1024 ? Math.floor(head / 128) * 128 : 0;
    total += all;
    cached += Math.min(reused, all);
  });
  const dollars = ((total - cached) * priceIn + cached * priceCached) / 1e6;
  console.log(
    `${name}: ${prompts.length} requests, ${total} input tokens, ${cached} cacheable (${((cached / total) * 100).toFixed(1)}%), input cost $${dollars.toFixed(4)} (${(dollars / 12).toFixed(4)} an answer)`,
  );
}
