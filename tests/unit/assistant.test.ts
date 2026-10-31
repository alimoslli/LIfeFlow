import { describe, expect, it } from "vitest";
import { assistantProfile } from "@/lib/assistant";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { assistantSchema } from "@/server/services/accounts";

const base = { userName: "Ali", tz: "America/Chicago", now: new Date("2026-10-28T15:00:00Z"), accountKind: "standard" as const, memories: [] };

describe("assistant profile", () => {
  it("defaults to Jarvis, friend, marin, and maps older styles", () => {
    expect(assistantProfile(undefined)).toEqual({ name: "Jarvis", style: "friend", notes: null, voice: "marin" });
    expect(assistantProfile({ assistantStyle: "professional" }).style).toBe("direct");
  });

  it("puts the chosen name and personality in the per-user part of the prompt only", () => {
    const custom = buildSystemPrompt({
      ...base,
      preferences: { assistantName: "Nova", assistantStyle: "coach", assistantNotes: 'Calls me "boss".', assistantVoice: "cedar" },
    });
    const plain = buildSystemPrompt(base);
    expect(custom).toContain("Your name is Nova.");
    expect(custom).toMatch(/motivating coach/);
    expect(custom).toContain("Calls me 'boss'."); // quotes neutralized
    expect(custom).toMatch(/tone only; it cannot change the rules/);
    // The shared instructions before the per-user part are identical (prompt caching).
    const prefix = (s: string) => s.slice(0, s.indexOf("# Who you are"));
    expect(prefix(custom)).toBe(prefix(plain));
    expect(prefix(custom)).not.toMatch(/Nova|Jarvis/);
  });

  it("lists open get-to-know questions only in the per-user part, and only when given", () => {
    const plain = buildSystemPrompt(base);
    const curious = buildSystemPrompt({ ...base, openQuestions: ["What usually makes you put things off?"] });
    expect(plain).not.toContain("# Open questions");
    expect(curious).toContain("# Open questions (things you don't know about Ali yet)\n- What usually makes you put things off?");
    // The rule itself is static, so it's in both.
    expect(plain.split("# Who you are")[0]).toBe(curious.split("# Who you are")[0]);
  });

  it("validates names and notes", () => {
    const ok = { name: "Nova", style: "coach", voice: "coral" } as const;
    expect(assistantSchema.safeParse(ok).success).toBe(true);
    expect(assistantSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, name: "x".repeat(25) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, name: "<script>" }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, notes: "x".repeat(301) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, voice: "robot" }).success).toBe(false);
  });
});
