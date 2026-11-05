import { describe, expect, it } from "vitest";
import { composeMessage, KIND_LABELS, type JarvisTone } from "@/lib/jarvis-voice";

const TONES: JarvisTone[] = ["coach", "friend", "direct"];
const GUILT = /slipp|you missed|you failed|\bfailed\b/i;

describe("habit off track (owner, 2026-11-05)", () => {
  it("says plainly it's off track, with the numbers and one way back from the facts", () => {
    const withSlot = composeMessage("habit_struggle", { habit: "Gym", kept: 1, of: 5, unit: "days", slot: "Tomorrow 7 AM", smaller: null }, "direct");
    expect(withSlot.title).toBe("Gym is off track");
    expect(withSlot.body).toBe('"Gym": 1 of the last 5 days. That\'s off track this week. Tomorrow 7 AM is open to get back on track.');

    const smaller = composeMessage("habit_struggle", { habit: "Save $10 each payday", kept: 2, of: 5, unit: "weeks", slot: null, smaller: "$5" }, "direct");
    expect(smaller.body).toBe('"Save $10 each payday": 2 of the last 5 weeks. That\'s off track. Try $5 for two weeks to get back on track?');

    // No slot or smaller step in the facts: none is invented.
    const plain = composeMessage("habit_struggle", { habit: "No-spend weekend", kept: 1, of: 5, unit: "weekends", slot: null, smaller: null }, "direct");
    expect(plain.body).toBe('"No-spend weekend": 1 of the last 5 weekends. That\'s off track. Want to make it smaller for a while to get back on track?');
    expect(plain.body).not.toMatch(/\d+(:\d\d)? ?(AM|PM)/);
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
