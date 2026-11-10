import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { getTool } from "@/server/jarvis/registry";

// "I'm going to do something": the skyling sorts it into a to-do, a promise or a goal, and asks only when it truly could be two.
const INSTRUCTIONS = buildSystemPrompt({
  userName: "Ali",
  tz: "America/Chicago",
  now: new Date("2026-10-28T15:00:00Z"),
  accountKind: "standard",
  memories: [],
});

describe("to-do, promise or goal", () => {
  it("the instructions give the three-way rule with the owner's examples and ask only when unclear", () => {
    expect(INSTRUCTIONS).toMatch(/To-do: a one-off errand/);
    expect(INSTRUCTIONS).toMatch(/Pick up my meds/);
    expect(INSTRUCTIONS).toMatch(/Promise: a commitment about their own follow-through/);
    expect(INSTRUCTIONS).toMatch(/not eating out tonight/);
    expect(INSTRUCTIONS).toMatch(/Goal: an outcome/);
    expect(INSTRUCTIONS).toMatch(/Never ask when it's obvious/);
    expect(INSTRUCTIONS).toMatch(/one record/i);
  });
  it("each tool says which kind it is for, so the model can pick without asking", () => {
    expect(getTool("create_tasks")?.description).toMatch(/errands/);
    expect(getTool("create_tasks")?.description).toMatch(/make_promise/);
    expect(getTool("make_promise")?.description).toMatch(/not eating out tonight/);
    expect(getTool("make_promise")?.description).toMatch(/to-do/);
    expect(getTool("create_personal_goal")?.description).toMatch(/weeks or months/);
    // A wrong sort can be undone: the prompt names a tool that really exists for removing a promise.
    expect(INSTRUCTIONS).toMatch(/cancel_promise/);
    expect(getTool("cancel_promise")?.mutates).toBe(true);
  });
});
