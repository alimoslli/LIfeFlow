import { describe, expect, it } from "vitest";
import { offersToAct, OFFER_REPLIES } from "@/components/jarvis/suggestions";

describe("one tap to say yes when the skyling offers to do something (program item 8)", () => {
  it.each([
    "Your BIO lab overlaps your Thursday shift. Want me to move the study block to Wednesday at 3 PM?",
    "I found 2 free hours on Tuesday. Should I block them for the exam?",
    "That's 3 to-dos still open. Do you want me to move them to tomorrow?",
    "Would you like me to add it to your calendar?",
    "Shall I set a reminder for 8 PM?",
    "I can put it on Friday. Okay if I do that?",
  ])("offer: %s", (text) => expect(offersToAct(text)).toBe(true));

  it.each([
    "Which class is it for?",
    "Done. I moved it to Wednesday at 3 PM.",
    "Want me to? I can't, because the bank isn't connected yet.",
    "You have $842 available now. That covers it.",
    "What time do you usually start work?",
    "",
  ])("not an offer: %s", (text) => expect(offersToAct(text)).toBe(false));

  it("the first reply says yes in plain words, the second says no", () => {
    expect(OFFER_REPLIES).toEqual(["Do it", "Not now"]);
  });
});
