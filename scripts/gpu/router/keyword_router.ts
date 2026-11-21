/**
 * Scores the app's keyword router (routeSkills) on the two pilot test sets.
 * Run from the repo root: npx tsx scripts/gpu/router/keyword_router.ts
 * top1 = the first skill returned is the right one; any = the right skill is among the (up to 2) returned.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { routeSkills } from "../../../src/server/jarvis/skills/index";

const dir = "scripts/gpu/router/data";
const out: Record<string, unknown> = {};
for (const name of ["heldout", "fresh"]) {
  const rows: { text: string; skill: string }[] = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  const scored = rows.map((r) => {
    const got = routeSkills(r.text).map((s) => s.name);
    return { text: r.text, gold: r.skill, pred: got[0] ?? "none", all: got };
  });
  const top1 = scored.filter((r) => r.pred === r.gold).length;
  const any = scored.filter((r) => r.all.includes(r.gold)).length;
  const none = scored.filter((r) => r.all.length === 0).length;
  out[name] = { n: rows.length, top1: top1 / rows.length, any: any / rows.length, none: none / rows.length, rows: scored };
  console.log(name, "n", rows.length, "top1", top1, "any", any, "no match", none);
}
writeFileSync(`${dir}/../keyword_router_results.json`, JSON.stringify(out, null, 1));
