import { describe, expect, it } from "vitest";
import { composeMessage, KIND_LABELS, LOCKED_MONEY_PUSH, pushSummary, pushText, type JarvisTone } from "@/lib/jarvis-voice";
import { jarvisSettings } from "@/server/services/proactive/engine";

const TONES: JarvisTone[] = ["coach", "friend", "direct"];
const GUILT = /slipp|you missed|you failed|\bfailed\b/i;

describe("habit off track (owner, 2026-11-05)", () => {
  it("says plainly it's off track, with the numbers and one way back from the facts", () => {
    const withSlot = composeMessage(
      "habit_struggle",
      { habit: "Gym", kept: 1, of: 5, unit: "days", thisWeek: true, slotDate: "2026-11-11", slotTime: "09:30", smaller: null },
      "direct",
    );
    expect(withSlot.title).toBe("Gym is off track");
    // The slot's real weekday and time: the message may be read the next morning or later, so never "tomorrow".
    expect(withSlot.body).toBe('"Gym": 1 of the last 5 days. That\'s off track this week. Wednesday 9:30 AM is open to get back on track.');
    expect(
      composeMessage("habit_struggle", { habit: "Gym", kept: 1, of: 5, unit: "days", slotDate: "2026-11-12", slotTime: "14:00" }, "direct").body,
    ).toContain("Thursday 2 PM is open");

    const smaller = composeMessage("habit_struggle", { habit: "Save $10 each payday", kept: 2, of: 5, unit: "weeks", slotDate: null, smaller: "$5" }, "direct");
    expect(smaller.body).toBe('"Save $10 each payday": 2 of the last 5 weeks. That\'s off track. Try $5 for two weeks to get back on track?');

    // No slot or smaller step in the facts: none is invented.
    const plain = composeMessage("habit_struggle", { habit: "No-spend weekend", kept: 1, of: 5, unit: "weekends", slotDate: null, smaller: null }, "direct");
    expect(plain.body).toBe('"No-spend weekend": 1 of the last 5 weekends. That\'s off track. Want to make it smaller for a while to get back on track?');
    expect(plain.body).not.toMatch(/\d+(:\d\d)? ?(AM|PM)/);
  });

  it("says 'this week' only when the facts say the days are this week", () => {
    const facts = { habit: "Read", kept: 1, of: 5, unit: "days", slotDate: null, smaller: null };
    expect(composeMessage("habit_struggle", { ...facts, thisWeek: false }, "direct").body).toMatch(/^"Read": 1 of the last 5 days\. That's off track\. /);
    expect(composeMessage("habit_struggle", facts, "direct").body).not.toMatch(/this week/);
  });

  it("still words messages saved before the change (facts with only `missed`)", () => {
    const old = composeMessage("habit_struggle", { habit: "Study 25 minutes a day", missed: 3, smaller: "13 minutes" }, "direct");
    expect(old.body).toBe('"Study 25 minutes a day": 2 of the last 5 times. That\'s off track. Try 13 minutes for two weeks to get back on track?');
  });

  it("never uses guilt words in any kind, tone or label", () => {
    const facts = { habit: "Gym", missed: 3, kept: 2, of: 5, unit: "days", count: 2, slipped: 2, done: 3, left: 1, titles: '"Essay"', spentCents: 5000 };
    for (const kind of Object.keys(KIND_LABELS))
      for (const tone of TONES) {
        const m = composeMessage(kind, facts, tone);
        expect(`${m.title} ${m.body}`, `${kind} (${tone})`).not.toMatch(GUILT);
      }
    expect(Object.values(KIND_LABELS).join(" ")).not.toMatch(GUILT);
  });
});

describe("push text (owner, 2026-11-05: one line, what was noticed and why, and the next step)", () => {
  const SAMPLES: [string, Record<string, unknown>, string][] = [
    [
      "bill_short",
      { bill: "Rent", billCents: 62_000, dueIn: "in 3 days", shortCents: 12_000, options: "Two ways to cover it: move $120 from savings." },
      "Rent ($620) is due in 3 days",
    ],
    ["bill_due", { bill: "Phone", billCents: 4500, dueIn: "tomorrow", cashCents: 30_000 }, "Phone ($45) is due tomorrow. You have $300 in checking."],
    [
      "deadline_conflict",
      { assignment: "Essay", dueDay: "Friday", shiftWhen: "Thursday night", blockWhen: "2 hours on Wednesday at 15:00" },
      "Essay is due Friday and you work Thursday night.",
    ],
    ["morning_brief", { count: 3, money: "$420 available now", oneThing: "Essay draft" }, "3 things on today's list, $420 available now."],
    ["evening_wrap", { done: 2, left: 1 }, "You finished 2 to-dos today. 1 is still open."],
    ["evening_wrap", { done: 0, left: 3 }, "3 to-dos are still open."],
    [
      "spending_pace",
      { category: "Food", spentCents: 8600, overCents: 3000, fromCategory: null, moveCents: 3000 },
      "You spent $86 on food this week, $30 more than usual.",
    ],
    ["trial_ending", { name: "Spotify", daysLeft: 1, thenCents: 1199 }, "Your Spotify free trial turns into $11.99 in 1 day."],
    [
      "habit_struggle",
      { habit: "Gym", kept: 1, of: 5, unit: "days", slotDate: "2026-11-11", slotTime: "09:00", smaller: null },
      '"Gym": 1 of the last 5 days.',
    ],
    ["weekly_review", { done: 9, slipped: 1, spentCents: 21_000, budgetCents: 0, change: null }, "9 to-dos done, 1 still open, $210 spent."],
  ];

  it.each(SAMPLES)("%s leads with its fact, on one line, in any tone", (kind, facts, fact) => {
    const p = pushText(kind, facts)!;
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.startsWith(fact)).toBe(true);
    expect(p.body).not.toMatch(/\n/);
    // The message's own words minus the tone's opener ("Heads up:", "Hey!"), so the fact comes first.
    expect(composeMessage(kind, facts, "friend").body).toContain(p.body);
  });

  it("with the Money lock on, nothing about money reaches the lock screen (notifications rule 6)", () => {
    const money = pushText("bill_due", { bill: "Phone", billCents: 4500, dueIn: "tomorrow", cashCents: 30_000 }, { moneyLocked: true, topic: "money" })!;
    expect(money).toEqual(LOCKED_MONEY_PUSH);
    const morning = pushText("morning_brief", { count: 3, money: "$420 available now", oneThing: "Essay draft" }, { moneyLocked: true, topic: "general" })!;
    expect(morning.body).toBe("3 things on today's list. The one thing: Essay draft.");
    const week = pushText(
      "weekly_review",
      { done: 9, slipped: 1, spentCents: 21_000, budgetCents: 30_000, change: "Keep Food under $50 next week." },
      { moneyLocked: true, topic: "general" },
    )!;
    expect(week.body).toBe("9 to-dos done, 1 still open.");
    // unlocked, the same messages keep their numbers
    expect(pushText("morning_brief", { count: 3, money: "$420 available now", oneThing: "Essay draft" }, { topic: "general" })!.body).toContain("$420");
    expect(pushText("weekly_review", { done: 9, slipped: 1, spentCents: 21_000, budgetCents: 0, change: null })!.body).toContain("$210 spent");
  });

  it("has nothing to say for an unknown kind (the engine falls back to the saved text)", () => {
    expect(pushText("not_a_kind", { text: "x" })).toBeNull();
  });

  it("keeps the default limit of 3 notifications a day (owner, 2026-11-05)", () => {
    expect(jarvisSettings(undefined).pushLimit).toBe(3);
    expect(jarvisSettings({ jarvis: { pushLimit: 0 } }).pushLimit).toBe(0);
  });
});

describe("Settings says what pushImportant does (audit A8)", () => {
  it("states the real limit, what counts, and the quiet hours", () => {
    const text = pushSummary("Your skyling", jarvisSettings(undefined), true);
    expect(text).toBe(
      "Your skyling sends up to 3 notifications a day: your morning brief, evening wrap-up and weekly and monthly reviews, plus anything urgent or important it notices, like a bill your checking can't cover. Each one says in one line what it noticed and why, with the next step. None from 10 PM to 7 AM. To-do reminders don't count toward the limit.",
    );
    expect(text).not.toMatch(/only .*urgent/i);
    const own = pushSummary("Nova", jarvisSettings({ jarvis: { pushLimit: 1, quietStart: "23:30", quietEnd: "06:00" } }), true);
    expect(own).toMatch(/^Nova sends up to 1 notification a day: /);
    expect(own).toContain("None from 11:30 PM to 6 AM.");
    expect(pushSummary("Nova", jarvisSettings({ jarvis: { pushLimit: 2, quietStart: "00:00", quietEnd: "00:00" } }), true)).toContain("No quiet hours.");
    expect(pushSummary("Nova", jarvisSettings({ jarvis: { pushLimit: 0 } }), true)).toBe(
      "Nova keeps everything in the app and sends no notifications of its own. To-do reminders still come.",
    );
  });

  it("only mentions to-do reminders when that switch is on (review)", () => {
    const off = pushSummary("Nova", jarvisSettings({ jarvis: { pushLimit: 0 } }), false);
    expect(off).toBe("Nova keeps everything in the app and sends no notifications of its own.");
    expect(pushSummary("Nova", jarvisSettings(undefined), false)).not.toMatch(/reminder/i);
    expect(pushSummary("Nova", jarvisSettings(undefined), true)).toMatch(/To-do reminders don't count toward the limit\.$/);
  });
});
