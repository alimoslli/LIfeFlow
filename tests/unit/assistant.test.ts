import { describe, expect, it } from "vitest";
import { assistantProfile } from "@/lib/assistant";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { assistantSchema } from "@/server/services/accounts";

const base = { userName: "Ali", tz: "America/Chicago", now: new Date("2026-10-28T15:00:00Z"), accountKind: "standard" as const, memories: [] };

describe("assistant profile", () => {
  it("defaults to Jarvis, balanced, marin", () => {
    expect(assistantProfile(undefined)).toEqual({ name: "Jarvis", style: "balanced", notes: null, voice: "marin" });
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

  it("validates names and notes", () => {
    const ok = { name: "Nova", style: "warm", voice: "coral" } as const;
    expect(assistantSchema.safeParse(ok).success).toBe(true);
    expect(assistantSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, name: "x".repeat(25) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, name: "<script>" }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, notes: "x".repeat(301) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, voice: "robot" }).success).toBe(false);
  });
});
