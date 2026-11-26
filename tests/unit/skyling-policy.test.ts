import { describe, expect, it } from "vitest";
import { buildSystemPrompt, howYouMayAct, PROMPT_VERSION } from "@/server/jarvis/prompt";
import type { UserPreferences } from "@/server/db/schema";

// The five skyling policy decisions (owner, 2026-11-26; docs/research/2026-11-25-skyling-policy-proposals.md).
const prompt = (preferences?: UserPreferences) =>
  buildSystemPrompt({ userName: "Robin", tz: "America/New_York", now: new Date("2026-11-26T15:00:00Z"), accountKind: "standard", memories: [], preferences });
const fixed = (s: string) => s.split("# Who you are")[0];

describe("skyling policy (owner, 2026-11-26)", () => {
  it("1. real distress: stops everything else, no tools, glad they told, someone they trust, 988 and the emergency number, stays", () => {
    const p = prompt();
    const section = p.slice(p.indexOf("# When someone is struggling"), p.indexOf("# Health questions"));
    expect(section).toContain("comes before everything else");
    expect(section).toMatch(/stop everything else: no tools, no plans/);
    expect(section).toContain("glad they told you");
    expect(section).toContain("someone they trust");
    expect(section).toContain("call or text 988");
    expect(section).toMatch(/911 or their local emergency number/);
    expect(section).toContain("Stay with them");
    expect(section).not.toMatch(/—/);
  });

  it("2. health: never diagnoses or advises medicine, points to a professional", () => {
    const p = prompt();
    expect(p).toMatch(/Never diagnose anything/);
    expect(p).toMatch(/never suggest, change or comment on taking a medicine or a dose/);
    expect(p).toMatch(/a doctor or their campus health or counseling service/);
  });

  it("3. 'Are you an AI?': plainly yes, their skyling, never a model or provider, never an assistant", () => {
    const p = prompt();
    expect(p).toMatch(/say plainly that you're an AI: their skyling/);
    expect(p).toMatch(/Never name the model, company or provider behind you/);
    // the fixed instructions never name a model or a provider themselves
    expect(fixed(p)).not.toMatch(/\b(gpt|openai|chatgpt|claude|anthropic|gemini|llama)\b/i);
  });

  it("5. autonomy: the prompt says the person's own mode; the default stays offer first", () => {
    expect(howYouMayAct(undefined)).toBe("offer first.");
    expect(howYouMayAct({ jarvis: { autonomy: { tasks: false, calendar: false } } } as UserPreferences)).toBe("offer first.");
    expect(howYouMayAct({ jarvis: { autonomy: { tasks: true, calendar: true } } } as UserPreferences)).toMatch(/^you may book on your own/);
    expect(howYouMayAct({ jarvis: { autonomy: { tasks: true } } } as UserPreferences)).toMatch(/to-dos on your own.*calendar blocks, offer first/);
    expect(howYouMayAct({ jarvis: { autonomy: { calendar: true } } } as UserPreferences)).toMatch(/study blocks on your own.*to-dos, offer first/);
    expect(prompt()).toContain("How you may act: offer first.");
    const rule = prompt().slice(prompt().indexOf("# Booking on your own"), prompt().indexOf("# Safety"));
    expect(rule).toMatch(/never covers money, deleting anything, contacting anyone, or doing graded work/);
    expect(rule).toMatch(/at most 3/);
    expect(rule).toMatch(/can be undone/);
  });

  it("the new rules stay in the static part (cacheable), and the version moved", () => {
    const a = fixed(prompt());
    const b = fixed(prompt({ jarvis: { autonomy: { tasks: true, calendar: true } } } as UserPreferences));
    expect(a).toBe(b);
    for (const h of ["# When someone is struggling", "# Health questions", "# What you are", "# Booking on your own"]) expect(a).toContain(h);
    expect(PROMPT_VERSION).toBe("2026-11-26.1");
  });
});
