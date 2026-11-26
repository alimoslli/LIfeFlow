import { describe, expect, it } from "vitest";
import { coreMemories, CORE_DEFAULTS, memoriesForTurn, recallMemories, type RetrievableMemory } from "@/server/jarvis/memory-retrieval";

// Smart memory (owner, 2026-11-26: "strong on memories ... so its not costly ... smart enough to know if he needs all that info").
const now = new Date("2026-11-26T15:00:00Z");
const day = 86_400_000;
let n = 0;
const mem = (content: string, category: RetrievableMemory["category"], extra: Partial<RetrievableMemory> = {}): RetrievableMemory => ({
  id: `m${++n}`,
  content,
  category,
  basis: "stated",
  updatedAt: new Date(now.getTime() - 40 * day),
  lastUsedAt: null,
  ...extra,
});
const all = [
  mem("Keep answers short.", "instruction"),
  mem("Is a nursing student at Valencia College.", "fact"),
  mem("Works closing shifts at Target, usually Tue and Thu.", "routine"),
  mem("Wants to get a B in Anatomy this term.", "goal"),
  mem("Their manager at Target is Dana.", "fact", { updatedAt: new Date(now.getTime() - 200 * day) }),
  mem("Prefers studying in the morning before class.", "preference"),
  mem("Brother Sam's birthday is March 3.", "fact", { updatedAt: new Date(now.getTime() - 300 * day) }),
  mem("Is visiting family this weekend.", "temporary"),
  mem("Likes lo-fi music while studying.", "preference", { basis: "inferred" }),
  mem("Is saving for a used car by summer.", "goal"),
];

describe("smart memory", () => {
  it("the core is small, built from who they are, and never short-lived things", () => {
    const core = coreMemories(all, now);
    expect(core.length).toBeLessThanOrEqual(CORE_DEFAULTS.maxItems);
    expect(core.reduce((c, m) => c + m.content.length, 0)).toBeLessThanOrEqual(CORE_DEFAULTS.maxChars);
    expect(core.map((m) => m.content)).toContain("Is a nursing student at Valencia College.");
    expect(core.map((m) => m.content)).toContain("Works closing shifts at Target, usually Tue and Thu.");
    expect(core.some((m) => m.category === "temporary" || m.category === "instruction")).toBe(false);
  });

  it("a plain lookup gets only the instructions and the core (cheap)", () => {
    const lean = memoriesForTurn(all, { text: "when is my next shift?" }, { lean: true, now });
    expect(lean.some((m) => m.content === "Keep answers short.")).toBe(true);
    expect(lean.every((m) => m.why === "instruction" || m.why === "core")).toBe(true);
    expect(lean.length).toBeLessThan(all.length);
  });

  it("a real question also gets what bears on it, with no duplicates", () => {
    const full = memoriesForTurn(all, { text: "should I ask Dana to swap my Thursday shift for the Anatomy exam?" }, { now });
    const texts = full.map((m) => m.content);
    expect(texts).toContain("Their manager at Target is Dana.");
    expect(new Set(full.map((m) => m.id)).size).toBe(full.length);
  });

  it("recall finds the specific thing asked for, and nothing unrelated", () => {
    const found = recallMemories(all, "brother birthday").map((m) => m.content);
    expect(found[0]).toBe("Brother Sam's birthday is March 3.");
    expect(found).not.toContain("Keep answers short.");
    expect(recallMemories(all, "quantum chromodynamics")).toHaveLength(0);
  });
});
