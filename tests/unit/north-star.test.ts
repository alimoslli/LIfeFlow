import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { getTool } from "@/server/jarvis/registry";
import { groupOf } from "@/server/jarvis/tool-groups";

const prompt = buildSystemPrompt({ userName: "Ali", tz: "America/Chicago", now: new Date("2026-10-28T15:00:00Z"), accountKind: "standard", memories: [] });

// The north star (ADR 0033): not a general chatbot; the small everyday decisions, with the connected facts, before they happen.
describe("the north star in the assistant", () => {
  it("the prompt says what the assistant is for, how it sounds, and never to invent numbers", () => {
    expect(prompt).toMatch(/not a general chatbot/);
    expect(prompt).toMatch(/before they make it/);
    expect(prompt).toMatch(/call `tonight` first/);
    expect(prompt).toMatch(/never invent a number/);
    expect(prompt).toMatch(/you don't lecture, scold or moralize/);
    expect(prompt).toMatch(/choice is always theirs/);
  });
  it("tonight is always available (core group) and only reads", () => {
    expect(groupOf("tonight")).toBe("core");
    expect(getTool("tonight")?.mutates).toBe(false);
    expect(getTool("tonight")?.description).toMatch(/BEFORE the user decides/);
  });
});
