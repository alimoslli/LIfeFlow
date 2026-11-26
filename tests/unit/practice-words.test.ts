import { describe, expect, it } from "vitest";
import { pushText } from "@/lib/jarvis-voice";

// The new cards' words (owner, 2026-11-26): plain, true, no guilt words, no em dashes.
describe("new card words", () => {
  const cards = [
    pushText("exam_eve", { what: "your BIO 101 exam", missedCount: 1 }),
    pushText("exam_eve", { what: "your BIO 101 exam", missedCount: 3 }),
    pushText("paper_pack", { assignment: "Essay 2", dueDay: "Friday" }),
    pushText("sunday_learned", { day: "Tuesday", workplace: "Target", long: 2, worked: 3, typicalMin: 35, endsAt: "10 PM" }),
  ];
  it("reads right", () => {
    expect(cards[0]?.body).toContain("1 practice question from your last round needs another go.");
    expect(cards[1]?.body).toContain("3 practice questions from your last round need another go.");
    expect(cards[2]?.body).toContain("Essay 2 is due Friday.");
    expect(cards[3]?.body).toContain("Your Tuesday shifts at Target ran about 35 minutes long 2 of the last 3 times.");
  });
  it("no guilt words or em dashes", () => {
    for (const c of cards) expect(`${c?.title} ${c?.body}`).not.toMatch(/—|slipping|you missed|behind|failed/i);
  });
});
