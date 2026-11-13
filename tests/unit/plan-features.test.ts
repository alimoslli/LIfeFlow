import { describe, expect, it } from "vitest";
import { AI_COST_WORDS, FREE_FEATURES, FREE_MESSAGES_PER_DAY, PAID_FEATURES, STANDARD_FEATURES, STUDENT_FEATURES, UNSURE } from "@/lib/plan-features";
import { FREE_JARVIS_PER_DAY } from "@/server/billing";

describe("what each plan card shows", () => {
  it("the free list keeps only the 15 messages and what costs nothing per use", () => {
    expect(FREE_MESSAGES_PER_DAY).toBe(FREE_JARVIS_PER_DAY);
    expect(FREE_FEATURES[0]).toBe(`${FREE_JARVIS_PER_DAY} messages with your skyling a day`); // the number on the card is the chat limit
    expect(FREE_FEATURES).toEqual(["15 messages with your skyling a day", "Everything you add yourself: to-dos, calendar, shifts and notes"]);
    // no per-use cost item: nothing but the daily messages mentions the skyling's model, voice, texts, connections or reading files
    for (const f of FREE_FEATURES.filter((f) => !f.startsWith(`${FREE_MESSAGES_PER_DAY} messages`))) expect(f).not.toMatch(AI_COST_WORDS);
  });
  it("the student and standard cards show the paid features, and the free list shares none of them", () => {
    expect(STUDENT_FEATURES).toEqual(PAID_FEATURES);
    expect(STANDARD_FEATURES).toEqual(PAID_FEATURES);
    for (const f of FREE_FEATURES) expect(PAID_FEATURES).not.toContain(f);
  });
  it("every per-use feature is paid, and an unsure one is on the paid cards only", () => {
    for (const f of ["Bank and card sync", "Talk to your skyling by voice", "Text your skyling from your phone", "Canvas sync"])
      expect(PAID_FEATURES).toContain(f);
    for (const f of UNSURE) {
      expect(PAID_FEATURES).toContain(f);
      expect(FREE_FEATURES).not.toContain(f);
    }
  });
  it("uses skyling wording", () => {
    expect(JSON.stringify([...FREE_FEATURES, ...PAID_FEATURES])).not.toMatch(/assistant|companion|jarvis|—/i);
  });
});
