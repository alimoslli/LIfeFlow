import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { deriveInsights } from "@/server/briefing/rules";
import { PROMPT_VERSION, buildSystemPrompt } from "@/server/jarvis/prompt";
import type { LifeSnapshot } from "@/server/briefing/types";

const TZ = "America/New_York";

describe("short answers, short chips (owner, 2026-11-09)", () => {
  it("the catch-up chip never pastes the titles it can look up", () => {
    const titles = ["Anthropology Quiz 8", "GDP Quiz 1", "GDP Quiz 2", "Essay draft", "Lab report"];
    const overdue = titles.map((title, i) => ({
      id: String(i),
      title,
      context: null,
      dueAt: localToInstant("2026-10-26", "17:00", TZ),
      kind: "assignment" as const,
      href: "/",
    }));
    const snap = { now: localToInstant("2026-10-27", "09:00", TZ), tz: TZ, today: "2026-10-27", overdue, week: [], exams: [] } as unknown as LifeSnapshot;
    const chip = deriveInsights(snap).find((i) => i.id === "overdue")?.action?.prompt ?? "";
    expect(chip).toBe("Help me catch up on what's overdue this week.");
    for (const t of titles) expect(chip).not.toContain(t);
  });

  it("no chip or prompt template builds its text from a mapped or joined list", () => {
    for (const f of ["src/server/briefing/rules.ts", "src/server/services/proactive/detectors.ts", "src/server/services/ideas.ts"]) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (/prompt:\s*`/.test(line)) expect(line, `${f}: ${line}`).not.toMatch(/\.(map|join)\(/);
      }
    }
  });

  it("INSTRUCTIONS carry the length and plan rules, and the version moved", () => {
    const p = buildSystemPrompt({ userName: "Sam", tz: TZ, now: new Date("2026-11-09T15:00:00Z"), accountKind: "standard", memories: [] });
    expect(p).toContain("at most about 60 words");
    expect(p).toContain("Never write a day-by-day schedule");
    expect(p).toContain("belongs in the app");
    expect(p).toContain("show me the whole plan");
    expect(p).not.toContain("Use short lists or small tables");
    expect(PROMPT_VERSION).toBe("2026-11-09.1");
  });
});
