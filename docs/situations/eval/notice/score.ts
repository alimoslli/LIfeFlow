/**
 * The noticing grader. For each made-up life: replay the last 21 days through the app's own noticing code, grade what it said
 * against general rules (rules.ts), then write RESULTS.md.
 *
 *   NODE_OPTIONS=--conditions=react-server DATABASE_URL=<test db> npx tsx docs/situations/eval/notice/score.ts /tmp/grader-people [--only p18w1,p19w2] [--grade-only] [--out <folder for saved replays>]
 *
 * --grade-only reuses the saved replays in <out>/said/ (no database needed).
 * Nothing here calls an AI model. See README.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb } from "@/server/db/client";
import { blocked, replayWorld, type World } from "./replay";
import { gradeWorld, loadLife, type Ev, type FalseAlarm, type Grade } from "./rules";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const people = args[0];
const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = opt("--out") ?? "/tmp/grader-out"; // saved replays (not committed)
const only = opt("--only")?.split(",");

const RULES: { id: string; title: string; defn: string }[] = [
  { id: "overlap", title: "1. Two things at the same time", defn: "a shift overlaps a class, exam or event by 15+ minutes; flagged on Today by the day before" },
  { id: "deadline", title: "2. A deadline right after a long or late shift", defn: "any assignment, project, exam or quiz (not a reading) is due the day after a shift of 7+ hours or ending 9 PM or later; flagged by the day before the shift" },
  { id: "bill", title: "3. A bill bigger than the money before payday", defn: "a bill paid twice before comes due and checking, the day before, holds less than it and no pay lands first; flagged 1 to 3 days ahead" },
  { id: "price", title: "4a. Subscription price rise", defn: "a subscription charge is $1 and 5% more than the one before; flagged within 3 days of the first new charge (up to 14 days counts as late)" },
  { id: "duplicate", title: "4b. Duplicate subscription", defn: "two services doing the same job are both paid (video, music, cloud); said on its own within 3 days of becoming knowable" },
  { id: "unusual", title: "5a. Unusual charge at a known merchant", defn: "$50+ and 3x the person's usual at that merchant (3+ earlier visits); flagged within 2 days" },
  { id: "oneoff", title: "5b. Big one-off at a new merchant (informational)", defn: "$250+ at a merchant never seen before; flagged within 2 days" },
];

async function main() {
  mkdirSync(path.join(outDir, "said"), { recursive: true });
  const t0 = Date.now();
  const dirs = readdirSync(people).filter((d) => existsSync(path.join(people, d, "meta.json")) && (!only || only.includes(d))).sort();
  const worlds: { name: string; meta: World["meta"]; grade: Grade; ms: number }[] = [];
  for (const name of dirs) {
    const dir = path.join(people, name);
    const cache = path.join(outDir, "said", `${name}.json`);
    let w: World;
    if (flag("--grade-only") && existsSync(cache)) w = JSON.parse(readFileSync(cache, "utf8"));
    else {
      w = await replayWorld(dir);
      writeFileSync(cache, JSON.stringify(w));
    }
    const grade = gradeWorld(loadLife(dir), w.said, w.meta.quiet);
    worlds.push({ name, meta: w.meta, grade, ms: w.ms });
    console.log(name, `${Math.round(w.ms / 1000)}s`, `events ${grade.events.filter((e) => e.gradable).length}`, `false alarms ${grade.falseAlarms.length}`);
  }
  if (!flag("--grade-only")) {
    writeFileSync(path.join(outDir, "network.json"), JSON.stringify(blocked));
    await closeDb();
  }
  const net = flag("--grade-only") && existsSync(path.join(outDir, "network.json")) ? JSON.parse(readFileSync(path.join(outDir, "network.json"), "utf8")) : flag("--grade-only") ? null : blocked;
  const md = report(worlds, (Date.now() - t0) / 1000, net);
  const target = only ? path.join(outDir, "RESULTS.md") : path.join(here, "RESULTS.md"); // a full run updates the committed file
  writeFileSync(target, md);
  console.log("wrote", target);
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");

function report(worlds: { name: string; meta: World["meta"]; grade: Grade; ms: number }[], seconds: number, net: { calls: number; urls: string[] } | null) {
  const evs: (Ev & { world: string; person: number })[] = worlds.flatMap((w) => w.grade.events.map((e) => ({ ...e, world: w.name, person: w.meta.person })));
  const fas: (FalseAlarm & { world: string })[] = worlds.flatMap((w) => w.grade.falseAlarms.map((f) => ({ ...f, world: w.name })));
  const students = new Set(worlds.filter((w) => w.meta.kind === "student").map((w) => w.meta.person));
  const all = new Set(worlds.map((w) => w.meta.person));
  const lines: string[] = [];
  lines.push("# Noticing grader: results", "");
  lines.push(`Run: ${new Date().toISOString().slice(0, 10)}. ${all.size} made-up people (${students.size} students), ${worlds.length} lives (each person re-rolled over several seeds; the first of each is quiet, nothing planted), 21 replayed days each = ${worlds.length * 21} days, 5 looks a day.`);
  lines.push(`Run time: replaying the ${worlds.length} lives took ${Math.round(worlds.reduce((a, w) => a + w.ms, 0) / 1000)} s (about ${Math.round(worlds.reduce((a, w) => a + w.ms, 0) / worlds.length / 1000)} s a life); grading took ${Math.round(seconds)} s. ${net ? `Outside network calls attempted (all refused by a guard in replay.ts): ${net.calls}${net.calls ? ` (${[...new Set(net.urls)].join(", ")})` : ""}. The run also used OPENAI_API_KEY=sk-none and an unreachable OPENAI_BASE_URL.` : "Graded from saved replays."}`, "");
  lines.push("## Score per rule", "");
  lines.push("Caught = noticed in time. Late = noticed, but too late to plan (or only on the Money page when asked). Planted = events the grader planted; All = planted plus ones that happened naturally in the made-up life (same rule, from the data).", "");
  lines.push("| Rule | Planted: caught / planted | All: caught / events | Late | Missed | False alarms | Not gradable |", "|---|---|---|---|---|---|---|");
  for (const r of RULES) {
    const e = evs.filter((x) => x.rule === r.id && x.gradable);
    const pl = e.filter((x) => x.planted);
    const c = (a: typeof e) => a.filter((x) => x.result === "caught").length;
    const f = fas.filter((x) => x.rule === r.id).length;
    lines.push(`| ${r.title} | ${c(pl)} / ${pl.length} (${pct(c(pl), pl.length)}) | ${c(e)} / ${e.length} (${pct(c(e), e.length)}) | ${e.filter((x) => x.result === "late").length} | ${e.filter((x) => x.result === "missed").length} | ${f} | ${evs.filter((x) => x.rule === r.id && !x.gradable).length} |`);
  }
  const pe = evs.filter((x) => x.rule === "price" && x.gradable);
  const days = pe.filter((x) => x.result !== "missed").map((x) => Number(x.result === "caught" ? -(x.leadDays ?? 0) : /(\d+) days/.exec(x.via ?? "")?.[1] ?? 0)).sort((a, b) => a - b);
  lines.push("", `Price rises noticed within 3 days of the first changed charge (the ADR 0023 target): ${pe.filter((x) => x.result === "caught" && -(x.leadDays ?? 9) <= 3).length} of ${pe.length}. Days from the first changed charge to the line: ${days.length ? `median ${days[Math.floor(days.length / 2)]}, range ${days[0]} to ${days[days.length - 1]}` : "n/a"}.`);
  const qd = worlds.reduce((s, w) => s + w.grade.quiet.days, 0), qn = worlds.reduce((s, w) => s + w.grade.quiet.noisyDays, 0);
  const qw = worlds.filter((w) => w.meta.quiet);
  lines.push("", "## Quiet stretches", "");
  lines.push(`A quiet day has nothing real for any rule from 8 days before to 3 days after (21 before for a bill, 14 after for a price rise) (checked from the data, planted or not). Days like that: ${qd}. Days with an urgent or warning-type line anyway: ${qn} (${pct(qn, qd)}).`);
  lines.push(`In the ${qw.length} lives where nothing was planted: ${qw.reduce((s, w) => s + w.grade.quiet.noisyDays, 0)} noisy days of ${qw.reduce((s, w) => s + w.grade.quiet.days, 0)} quiet days.`);
  const kc = new Map<string, number>();
  for (const k of worlds.flatMap((w) => w.grade.quiet.kinds)) kc.set(k, (kc.get(k) ?? 0) + 1);
  if (kc.size) lines.push("", `What was said on those days: ${[...kc.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} x ${k}`).join("; ")}.`);
  const noisy = worlds.flatMap((w) => w.grade.quiet.noisy.map((n) => `${w.name}: ${n}`));
  if (noisy.length) lines.push("", "Examples:", ...noisy.slice(0, 8).map((n) => `- ${n}`));
  lines.push("", "## False alarms, by reason", "");
  const byWhy = new Map<string, number>();
  for (const f of fas) byWhy.set(`${f.rule}: ${f.why}`, (byWhy.get(`${f.rule}: ${f.why}`) ?? 0) + 1);
  if (!byWhy.size) lines.push("None.");
  for (const [k, n] of [...byWhy.entries()].sort((a, b) => b[1] - a[1])) lines.push(`- ${n} x ${k}`);
  for (const [k] of [...byWhy.entries()].slice(0, 0)) lines.push(k);
  lines.push("", "Examples:", ...fas.slice(0, 8).map((f) => `- ${f.world} ${f.day}: ${f.what} (${f.why})`));
  lines.push("", "## Top misses", "", "Misses and late catches, planted ones first, one per rule at a time so every rule shows. Seed = life name (person p, world w).", "");
  const missed = evs.filter((e) => e.gradable && e.result !== "caught");
  const order = [...RULES.map((r) => r.id)];
  const picked: typeof missed = [];
  for (let round = 0; round < 3; round++)
    for (const id of order) {
      const pool = missed.filter((m) => m.rule === id && !picked.includes(m)).sort((a, b) => Number(b.planted) - Number(a.planted));
      if (pool[0]) picked.push(pool[0]);
    }
  for (const m of picked.slice(0, 14)) lines.push(`- **${m.rule}** ${m.world}, ${m.day}${m.planted ? " (planted)" : " (natural)"}: ${m.desc}. ${m.result === "late" ? `Late: ${m.via}.` : `Not noticed${m.via ? ` (${m.via})` : ""}.`} The app said instead: ${m.instead.join(" / ")}`);
  const bm = missed.filter((m) => m.rule === "bill");
  if (bm.length) lines.push("", `Why bills were missed (${bm.length}): ` + [...new Set(bm.map((m) => m.via))].map((v) => `${bm.filter((m) => m.via === v).length} x ${v}`).join("; ") + ".");
  const ov = missed.filter((m) => m.rule === "overlap");
  if (ov.length) lines.push("", `Why overlaps were missed (${ov.length}): ` + [...new Set(ov.map((m) => m.via))].map((v) => `${ov.filter((m) => m.via === v).length} x ${v}`).join("; ") + ".");
  lines.push("", "## Per person", "", "| Person | Kind | Lives | Events graded | Caught | Missed | False alarms |", "|---|---|---|---|---|---|---|");
  for (const p of [...all].sort((a, b) => a - b)) {
    const ws = worlds.filter((w) => w.meta.person === p);
    const e = evs.filter((x) => x.person === p && x.gradable);
    lines.push(`| ${p}: ${ws[0].meta.summary.slice(0, 70)} | ${ws[0].meta.kind} | ${ws.length} | ${e.length} | ${e.filter((x) => x.result === "caught").length} | ${e.filter((x) => x.result === "missed").length} | ${fas.filter((f) => ws.some((w) => w.name === f.world)).length} |`);
  }
  return lines.join("\n") + "\n";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
