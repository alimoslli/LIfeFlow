import { describe, expect, it } from "vitest";
import { actingMode, buildSystemPrompt, MODE_HEAD, MODE_LINES, PROMPT_VERSION } from "@/server/jarvis/prompt";
import { REPLY_SHAPE } from "@/server/jarvis/prompt";
import { VOICE_RULES } from "@/server/jarvis/voice";
import type { UserPreferences } from "@/server/db/schema";

// The five skyling policy decisions (owner, 2026-11-26; docs/research/2026-11-25-skyling-policy-proposals.md).
const prompt = (preferences?: UserPreferences) =>
  buildSystemPrompt({ userName: "Robin", tz: "America/New_York", now: new Date("2026-11-26T15:00:00Z"), accountKind: "standard", memories: [], preferences });
const fixed = (s: string) => {
  expect(s).toContain("# Who you are");
  return s.split("# Who you are")[0];
};
const both = { jarvis: { autonomy: { tasks: true, calendar: true } } } as UserPreferences;

describe("skyling policy (owner, 2026-11-26)", () => {
  it("renders cleanly: no template leftovers anywhere in the prompt", () => {
    for (const p of [prompt(), prompt(both)]) expect(p).not.toContain("${");
  });

  it("1. real distress: overrides the rest, no tools, glad they told, someone they trust, 988 and the emergency number, stays", () => {
    const p = prompt();
    const section = p.slice(p.indexOf("# When someone is struggling"), p.indexOf("# Health questions"));
    expect(section).toMatch(/overrides every other rule here: saving things with tools, the reply length/);
    expect(section).toMatch(/stop everything else: no tools, no plans/);
    expect(section).toMatch(/wish they weren't here|have already hurt themselves|aren't safe at home/);
    expect(section).toContain("glad they told you");
    expect(section).toContain("someone they trust");
    expect(section).toContain("call or text 988");
    expect(section).toMatch(/911 or their local emergency number/);
    expect(section).toMatch(/never make up a number/);
    expect(section).toContain("Stay with them");
    // everyday stress is named so it isn't over-triggered
    expect(section).toMatch(/"this week is killing me", "I'm dying of boredom"/);
    expect(section).not.toMatch(/—/);
    // the save-with-tools rule steps aside for it
    expect(p).toMatch(/SAVE it with tools \(never in a "When someone is struggling" reply\)/);
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
    expect(fixed(p)).not.toMatch(/\b(gpt|openai|chatgpt|claude|anthropic|gemini|llama)\b/i);
  });

  it("1b. the rules that come after the distress section defer to it: voice rules and reply shape", () => {
    for (const later of [VOICE_RULES, REPLY_SHAPE]) {
      const first = later.trim().split("\n").slice(0, 3).join(" ");
      expect(first).toMatch(/When someone is struggling/);
      expect(first).toMatch(/no tools/i);
      expect(first).toMatch(/(don.t apply|do not apply|none of these rules apply)/i);
    }
    expect(prompt()).toContain(REPLY_SHAPE);
  });

  it("5. autonomy: the app's two lines are word for word the training examples' MODE_LINES", () => {
    // copied from scripts/gpu/chat-eval/responses_shim.py on claude/skill-router-pilot; change both together or neither
    expect(MODE_HEAD).toBe("# Acting on your own");
    expect(MODE_LINES.on).toBe(
      "Acting on your own: on. When they describe a problem (behind, stressed, a deadline), you may give study time or a to-do a place yourself: at most three, only in free time you looked up. Say what you saved and that it can be undone.",
    );
    expect(MODE_LINES.off).toBe(
      "Acting on your own: off. When they describe a problem, look, then offer the exact block or to-do with its day and time. Save to the calendar or to-dos only after they say yes.",
    );
  });

  it("5. autonomy: per person in buildContext, from their own setting; the default stays off", () => {
    expect(actingMode(undefined)).toBe("off");
    expect(actingMode({ jarvis: { autonomy: { tasks: true } } } as UserPreferences)).toBe("off");
    expect(actingMode({ jarvis: { autonomy: { calendar: true } } } as UserPreferences)).toBe("off");
    expect(actingMode(both)).toBe("on");
    expect(prompt()).toContain(`${MODE_HEAD}\n${MODE_LINES.off}\n\n# Reply shape`);
    expect(prompt(both)).toContain(`${MODE_HEAD}\n${MODE_LINES.on}\n\n# Reply shape`);
    // never in the static instructions
    for (const l of Object.values(MODE_LINES)) expect(fixed(prompt(both))).not.toContain(l);
    const rule = prompt().slice(prompt().indexOf("# Acting on your own: limits"), prompt().indexOf("# Safety"));
    expect(rule).toMatch(/never covers money, deleting anything, contacting anyone, or doing graded work/);
  });

  it("the new rules stay in the static part (cacheable), and the version moved", () => {
    const a = fixed(prompt());
    expect(a).toBe(fixed(prompt(both)));
    for (const h of ["# When someone is struggling", "# Health questions", "# What you are", "# Acting on your own: limits"]) expect(a).toContain(h);
    expect(PROMPT_VERSION).toBe("2026-11-26.2");
  });
});
