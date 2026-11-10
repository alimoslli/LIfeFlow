/**
 * Checks the rule definitions on a tiny hand-made life, so a rule that drifts is caught. Run:
 *   NODE_OPTIONS=--conditions=react-server npx tsx docs/situations/eval/notice/rules.selftest.ts
 */
import assert from "node:assert/strict";
import { gradeWorld, type Life } from "./rules";
import type { Said } from "./replay";

const tz = "America/New_York";
const at = (d: string, t: string) => new Date(`${d}T${t}:00-05:00`); // November: standard time
const life: Life = {
  tz, firstDay: "2026-10-16", lastDay: "2026-11-05",
  shifts: [
    { id: "sh1", start: at("2026-10-27", "17:00"), end: at("2026-10-27", "23:00"), knownAt: at("2026-10-20", "09:00") }, // late
    { id: "sh2", start: at("2026-10-29", "10:00"), end: at("2026-10-29", "14:00"), knownAt: at("2026-10-29", "08:00") }, // posted the same morning
  ],
  blocks: [
    { id: "cl1", title: "ENG 102", kind: "class", start: at("2026-10-27", "18:00"), end: at("2026-10-27", "19:15"), knownAt: new Date(0) },
    { id: "ev2", title: "Dentist", kind: "appointment", start: at("2026-10-29", "11:00"), end: at("2026-10-29", "12:00"), knownAt: at("2026-10-29", "08:00") },
  ],
  assignments: [{ id: "a1", title: "Essay", kind: "assignment", points: 50, due: at("2026-10-28", "09:00"), knownAt: new Date(0) }],
  txns: [{ id: "t1", account: "acc-checking", day: "2026-10-01", amount: 20000, kind: "income", desc: "PAY", recurring: false }],
  openingChecking: 0, series: [], planted: new Set(["sh1"]), plantMeta: [],
};
const nothing: Said[] = [];
let g = gradeWorld(life, nothing, false);
const byRule = (r: string) => g.events.filter((e) => e.rule === r);
// two things at the same time: the shift and class overlap; known a week ahead, so graded, and missed when nothing is said
assert.equal(byRule("overlap").filter((e) => e.gradable).length, 1);
assert.equal(byRule("overlap")[0].result, "missed");
assert.equal(byRule("overlap")[0].planted, true);
// the shift/dentist overlap was learned the same morning: not gradable either way
assert.equal(byRule("overlap").filter((e) => !e.gradable).length, 1);
// a late shift (ends 11 PM) the day before an assignment is due
assert.equal(byRule("deadline").length, 1);
assert.equal(byRule("deadline")[0].result, "missed");

const said: Said[] = [
  { date: "2026-10-26", time: "20:30", surface: "today", kind: "conflict", urgent: true, facts: {}, refs: ["sh1", "cl1"], text: "ENG 102 overlaps Work" },
  { date: "2026-10-26", time: "07:00", surface: "message", kind: "deadline_conflict", urgent: false, facts: { assignment: "Essay", dueDay: "Wednesday" } },
];
g = gradeWorld(life, said, false);
assert.equal(byRule("overlap")[0].result, "caught");
assert.equal(byRule("deadline")[0].result, "caught");
assert.equal(g.falseAlarms.length, 0);

// same-day only is late, not caught
g = gradeWorld(life, [{ ...said[0], date: "2026-10-27" }], false);
assert.equal(byRule("overlap")[0].result, "late");

// a short early shift before a deadline is a false alarm when the app says it
g = gradeWorld({ ...life, shifts: [{ id: "sh3", start: at("2026-10-27", "09:00"), end: at("2026-10-27", "12:00"), knownAt: new Date(0) }] }, [said[1]], false);
assert.equal(g.falseAlarms.length, 1);
assert.equal(g.falseAlarms[0].rule, "deadline");
console.log("rules selftest ok");
