import { describe, expect, it } from "vitest";
import { assistantLabel, assistantProfile, nameAtStart, UNNAMED_ASSISTANT } from "@/lib/assistant";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { assistantSchema } from "@/server/services/accounts";

const base = { userName: "Ali", tz: "America/Chicago", now: new Date("2026-10-28T15:00:00Z"), accountKind: "standard" as const, memories: [] };

describe("assistant profile", () => {
  it("has no name until the user picks one: 'your assistant', friend, marin, and maps older styles", () => {
    expect(assistantProfile(undefined)).toEqual({ name: "your assistant", named: false, style: "friend", notes: null, voice: "marin" });
    expect(assistantProfile({ assistantName: "   " }).named).toBe(false);
    expect(assistantProfile({ assistantStyle: "professional" }).style).toBe("direct");
    // A name the user already saved stays theirs, "Jarvis" included.
    expect(assistantProfile({ assistantName: "Jarvis" })).toMatchObject({ name: "Jarvis", named: true });
    expect(assistantProfile({ assistantName: " Nova " })).toMatchObject({ name: "Nova", named: true });
  });

  it("words the unnamed assistant for sentences and labels", () => {
    expect(UNNAMED_ASSISTANT).toBe("your assistant");
    expect(nameAtStart(UNNAMED_ASSISTANT)).toBe("Your assistant");
    expect(assistantLabel(UNNAMED_ASSISTANT)).toBe("Assistant");
    expect(nameAtStart("Nova")).toBe("Nova");
    expect(assistantLabel("nova")).toBe("nova");
  });

  it("never gives itself a name in the prompt before the user picks one", () => {
    const plain = buildSystemPrompt(base);
    const who = plain.slice(plain.indexOf("# Who you are"), plain.indexOf("# Right now"));
    expect(who).not.toMatch(/Your name is/);
    expect(who).toMatch(/hasn't named you yet/);
    expect(who).toMatch(/don't give yourself a name/i);
    // The shared instructions don't assume a name was chosen either.
    const shared = plain.slice(0, plain.indexOf("# Who you are"));
    expect(shared).not.toMatch(/chose your name/);
    expect(shared).toMatch(/The user may give you a name; use it if they did/);
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
    // Empty means "no name yet" (onboarding without a name, or clearing it in Settings).
    expect(assistantSchema.parse({ ...ok, name: "" }).name).toBeUndefined();
    expect(assistantSchema.parse({ ...ok, name: "  " }).name).toBeUndefined();
    expect(assistantSchema.parse({ ...ok, name: " Nova " }).name).toBe("Nova");
    expect(assistantSchema.safeParse({ ...ok, name: "x".repeat(25) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, name: "<script>" }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, notes: "x".repeat(301) }).success).toBe(false);
    expect(assistantSchema.safeParse({ ...ok, voice: "robot" }).success).toBe(false);
  });
});
