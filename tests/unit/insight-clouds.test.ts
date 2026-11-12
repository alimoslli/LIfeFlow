import { describe, expect, it } from "vitest";
import { describe as say, MAX_WORDS, noteTopics, pickInsights, type RawInsight } from "@/lib/insight-clouds";

const all: RawInsight[] = [
  {
    kind: "bill_short",
    bill: "Rent",
    billCents: 85_000,
    dueIn: "in 3 days",
    dueDate: "2026-11-13",
    cashCents: 62_000,
    shortCents: 23_000,
    canMoveFromSavings: true,
  },
  { kind: "bill_due", bill: "Rent", billCents: 85_000, dueIn: "in 3 days", dueDate: "2026-11-13", cashCents: 102_000 },
  { kind: "conflict", assignment: "Lab report", dueDay: "Friday", shiftWhen: "Thursday night" },
  {
    kind: "conflict",
    assignment: "Lab report",
    dueDay: "Friday",
    shiftWhen: "Thursday at 9 AM",
    blockWhen: "2 hours on Wednesday at 9 AM",
    blockDay: "Wednesday",
    action: { type: "block_time", label: "Block it", date: "2026-11-11", start: "09:00", end: "11:00", title: "Work on Lab report" },
  },
  { kind: "due_soon", titles: ["Lab 4", "Quiz 2"], due: "tomorrow 11:59 PM", today: false },
  { kind: "busy_day", weekday: "Thu", weekdayLong: "Thursday", date: "2026-11-12", dueCount: 2, titles: ["A", "B"], shift: { from: "5", to: "10 PM" } },
  { kind: "overdue_todos", total: 3, moved: 3, firstTitle: "Call bank" },
  { kind: "spending_pace", category: "Food", overCents: 4000, fromCategory: "Fun", moveCents: 4000 },
  { kind: "sub_overlap", names: "Netflix and Hulu", yearlyCents: 30_600 },
  { kind: "trial_ending", name: "Hulu", daysLeft: 2, thenCents: 1800 },
  { kind: "sub_price_up", name: "Netflix", fromCents: 1500, toCents: 1800 },
  { kind: "free_before_class", hours: 2, classTime: "2 PM" },
  { kind: "sleep", minutes: 310 },
  { kind: "todos_left", done: 2, total: 5 },
  { kind: "habits_left", left: 2 },
  { kind: "available", cashCents: 41_200 },
];

describe("insight clouds (owner, 2026-11-12)", () => {
  it("word every insight with its real names, days and amounts, in about eight words", () => {
    const said = all.map((f) => say(f).say);
    expect(said).toContain("Rent $850 Fri, you have $620");
    expect(said).toContain("Rent $850 Fri, you have $1,020");
    expect(said).toContain("Thu: 2 due, 5 to 10 PM shift");
    expect(said).toContain("Netflix and Hulu: about $306 a year");
    expect(said).toContain("2 free hours before your 2 PM class");
    expect(said).toContain("3 to-dos are past due");
    expect(said).toContain("You slept 5h 10m last night");
    expect(said).toContain("2 of 5 done today");
    expect(said).toContain("2 habits left today");
    expect(said).toContain("$412 available now");
    expect(said).toContain("Food is $40 over your usual this week");
    for (const f of all) {
      const d = say(f);
      expect(d.say.split(/\s+/).length, d.say).toBeLessThanOrEqual(MAX_WORDS + 1);
      expect(d.say + d.ask, d.say).not.toMatch(/—|assistant|\bAI\b|undefined|NaN|you missed|slipping|should have|behind|overspent|over budget/i);
      expect(d.ask.length).toBeGreaterThan(10);
    }
  });

  it("keeps long names to eight words or fewer", () => {
    const d = say({
      kind: "bill_short",
      bill: "Spotify Premium Family Plan",
      billCents: 1699,
      dueIn: "tomorrow",
      dueDate: "2026-11-13",
      cashCents: 500,
      shortCents: 1199,
      canMoveFromSavings: false,
    });
    expect(d.say.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
    expect(d.say).toContain("$16.99");
  });

  it("ranks a shortfall and a clash before a curiosity, shows at most three", () => {
    const keys = pickInsights(all).map((c) => c.key);
    expect(keys).toEqual(["insight:bill_short", "insight:trial_ending", "insight:conflict"]);
  });

  it("never two about the same thing", () => {
    const out = pickInsights(all, { count: 20 });
    const keys = out.map((c) => c.key);
    // one about bills, one about subscriptions, one about a due item, one about a lab report
    expect(keys.filter((k) => /bill|available/.test(k))).toHaveLength(1);
    expect(keys.filter((k) => /trial|price|overlap/.test(k))).toHaveLength(1);
    const same = pickInsights([all[2], { kind: "due_soon", titles: ["Lab report"], due: "tomorrow 11:59 PM", today: false }], { count: 5 });
    expect(same.map((c) => c.key)).toEqual(["insight:conflict"]);
    expect(new Set(out.map((c) => c.say)).size).toBe(out.length);
  });

  it("doesn't repeat what the skyling's note says", () => {
    expect(noteTopics("conflict-a-b")).toEqual(["conflict"]);
    expect(noteTopics("bills-soon")).toEqual(["bills"]);
    expect(noteTopics("goal-books")).toEqual([]);
    // a "bills soon" note says a bill is coming; a shortfall with its way out is more than that, so it stays
    const soon = pickInsights(all, { noteId: "bills-soon", count: 20 }).map((c) => c.key);
    expect(soon).toContain("insight:bill_short");
    expect(soon).not.toContain("insight:bill_due");
    expect(soon).not.toContain("insight:available");
    expect(soon).toContain("insight:trial_ending");
    // a note about the shortfall itself takes all of it
    const short = pickInsights(all, { noteId: "overdraft", count: 20 }).map((c) => c.key);
    expect(short.some((k) => /bill|available/.test(k))).toBe(false);
    expect(pickInsights(all, { noteId: "conflict-x" }).map((c) => c.key)).not.toContain("insight:conflict");
  });

  it("states a spending fact only with its fix, and never offers money moves without them", () => {
    const d = say({ kind: "spending_pace", category: "Food", overCents: 4000, fromCategory: "Fun", moveCents: 4000 });
    expect(d.ask).toBe("Move $40 from Fun to Food this month.");
  });

  it("the tap fills a precise question or the one fix", () => {
    expect(say(all[0]).ask).toBe("Rent is $850 on Fri and I have $620. Move $230 from savings to cover it.");
    expect(say(all[3]).ask).toBe("Block 2 hours on Wednesday at 9 AM to work on Lab report.");
    expect(say(all[6]).ask).toBe("Move my 3 past due to-dos to tomorrow.");
  });

  it("each cloud is a fact, one line of why and one button, with the weather that fits", () => {
    const by = (kind: string, i = 0) => say(all.filter((f) => f.kind === kind)[i]);
    // real trouble is a storm, and a storm always offers the way out
    for (const d of [by("bill_short"), by("conflict", 0), by("conflict", 1)]) {
      expect(d.weather).toBe("storm");
      expect(d.cta.length).toBeGreaterThan(3);
      expect(d.why).toBeTruthy();
    }
    // lightning only for the worst: a shortfall due within a day, or a clash with no free block
    expect(by("bill_short").bolt).toBe(false);
    expect(say({ ...(all[0] as Extract<RawInsight, { kind: "bill_short" }>), dueIn: "tomorrow" }).bolt).toBe(true);
    expect(by("conflict", 0).bolt).toBe(true);
    expect(by("conflict", 1).bolt).toBe(false);
    expect(by("overdue_todos").weather).toBe("heads-up");
    expect(by("free_before_class").weather).toBe("tip");
    expect(by("conflict", 1).cta).toBe("Block Wed 9 AM");
    expect(by("spending_pace").cta).toBe("Move $40 from Fun");
    for (const f of all) {
      const d = say(f);
      expect(d.why.split(/\s+/).length, d.why).toBeLessThanOrEqual(12);
      expect(d.cta.length, d.cta).toBeLessThanOrEqual(24);
      expect(d.why + d.cta, d.cta).not.toMatch(/—|assistant|\bAI\b|you missed|slipping|should have|behind|overspent|over budget|failed|late/i);
    }
  });

  it("the tap does the fix only when the detector offered one, and only fixes it can undo", () => {
    const fix = {
      ...(all[2] as Extract<RawInsight, { kind: "conflict" }>),
      blockWhen: "2 hours on Wednesday at 9 AM",
      ref: "deadline_conflict:a:b",
      source: { kind: "deadline_conflict", topic: "school", dedupeKey: "deadline_conflict:a:b", facts: {}, priority: 75 },
    };
    const none = pickInsights([fix], {})[0];
    expect(none.act).toBeUndefined();
    const withFix = pickInsights([
      { ...fix, action: { type: "block_time", label: "Block it", date: "2026-11-11", start: "09:00", end: "11:00", title: "Work on Lab report" } },
    ])[0];
    expect(withFix.act).toEqual({ type: "do", ref: "deadline_conflict:a:b" });
    // opening a page is a link, never an action; asking the skyling is the bar
    const open = pickInsights([{ ...(all[8] as RawInsight), action: { type: "open", label: "x", href: "/finances/bills" } }])[0];
    expect(open.act).toEqual({ type: "open", href: "/finances/bills" });
    const ask = pickInsights([{ ...fix, action: { type: "ask", label: "x", prompt: "hi" } }])[0];
    expect(ask.act).toBeUndefined();
  });

  it("nothing in, nothing out", () => {
    expect(pickInsights([])).toEqual([]);
  });
});
