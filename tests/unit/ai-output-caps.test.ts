import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every call to the model carries a hard bound on what it may write (thinking included). Without one, a runaway answer is
 * billed in full; the chat had the bound, the one-shot calls (web search, reading a document or a schedule picture, tidying
 * transactions) did not. A new call site fails here until it has one.
 */
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** The text of the call's argument, from its opening bracket to the matching close. */
function argumentOf(source: string, at: number) {
  let depth = 0;
  for (let i = source.indexOf("(", at); i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")" && --depth === 0) return source.slice(at, i + 1);
  }
  return source.slice(at);
}

describe("model calls", () => {
  it("each carries an output cap", () => {
    const calls: { file: string; capped: boolean }[] = [];
    for (const file of walk("src/server")) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/\.responses\.(create|stream)\(/g)) {
        const arg = argumentOf(source, m.index);
        // written in place, the request itself must carry the cap; built elsewhere in the file (the chat's `bodyFor`), the file must
        const inPlace = /^\.responses\.(create|stream)\(\s*\{/.test(arg);
        calls.push({ file, capped: /max_output_tokens/.test(inPlace ? arg : source) });
      }
    }
    // the chat, web search, documents, schedule pictures and tidying
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.filter((c) => !c.capped).map((c) => c.file)).toEqual([]);
  });
});
