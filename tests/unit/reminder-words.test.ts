import { describe, expect, it } from "vitest";
import { headsUpPush } from "@/lib/heads-up";
import { todoGroup, todoReminder } from "@/lib/reminder-words";
import { starPush } from "@/lib/stars";

// Reminders that don't get tuned out (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 5)
const BAD = /—|should|hurry|late|missed|overdue|don't forget|again\b|still haven't|!/i;

describe("rotating reminder words", () => {
  const kinds: [string, (turn: number) => { title: string; body: string }, string[]][] = [
    ["timed to-do", (t) => todoReminder("Laundry", "at 3:00 PM", t), ["Laundry", "3:00 PM"]],
    ["to-do today", (t) => todoReminder("Laundry", "today", t), ["Laundry", "today"]],
    ["to-do with no date", (t) => todoReminder("Laundry", "", t), ["Laundry"]],
    ["several to-dos", (t) => todoGroup(["Laundry", "Email Prof Lee", "Call the bank"], t), ["3", "Laundry", "Email Prof Lee", "1 more"]],
    ["heads-up", (t) => headsUpPush({ title: "Bio 101", clock: "10:00 AM", location: "Hall 201" }, 15, t), ["Bio 101", "10:00 AM", "15 minutes", "Hall 201"]],
    ["star", (t) => starPush("Ray", [{ title: "Target", kind: "work" }], t), ["Ray", "Target shift", "star"]],
    [
      "stars",
      (t) =>
        starPush(
          "Ray",
          [
            { title: "Target", kind: "work" },
            { title: "Bio 101", kind: "class" },
          ],
          t,
        ),
      ["2 stars", "Target shift", "Bio 101"],
    ],
  ];
  for (const [name, words, facts] of kinds)
    it(`${name}: never the same twice in a row, the same facts every time, calm words`, () => {
      for (let turn = 0; turn < 12; turn++) {
        const a = words(turn);
        const b = words(turn + 1);
        expect(`${a.title} ${a.body}`).not.toBe(`${b.title} ${b.body}`);
        for (const f of facts) expect(`${a.title} ${a.body}`).toContain(f);
        expect(`${a.title} ${a.body}`).not.toMatch(BAD);
      }
    });

  it("the first wording stays the owner's own", () => {
    expect(starPush("Ray", [{ title: "Target", kind: "work" }]).body).toBe("Your Target shift is over. Tap to claim your star on your sky.");
    expect(todoReminder("Laundry", "at 3:00 PM", 0).body).toBe("Due at 3:00 PM");
  });
});
