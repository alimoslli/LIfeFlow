import { describe, expect, it } from "vitest";
import { ATTITUDE_AT, promiseReply } from "@/lib/promise-voice";

const base = { text: "study for Bio", brokenRecent: 0, keptWeek: 0 };
const tones = ["coach", "friend", "direct"] as const;

describe("promise replies", () => {
  it("kept is warm in every tone and mentions the week once it is a run", () => {
    for (const t of tones) expect(promiseReply("kept", t, base).length).toBeGreaterThan(5);
    expect(promiseReply("kept", "friend", { ...base, keptWeek: 4 })).toMatch(/4 kept this week/);
  });
  it("one or two broken is gentle and offers a way back; three in two weeks gets the attitude", () => {
    for (const t of tones) {
      expect(promiseReply("broken", t, { ...base, brokenRecent: 1 })).not.toMatch(/\d+ (this fortnight|in two weeks|broken)/);
      expect(promiseReply("broken", t, { ...base, brokenRecent: ATTITUDE_AT })).toMatch(new RegExp(`${ATTITUDE_AT}`));
    }
  });
  it("never shames, and never uses an em dash", () => {
    const all: string[] = [];
    for (const t of tones)
      for (const o of ["kept", "broken", "moved"] as const)
        for (const n of [0, 1, 3, 5]) for (let seed = 0; seed < 3; seed++) all.push(promiseReply(o, t, { ...base, brokenRecent: n, keptWeek: n }, seed));
    for (const line of all) {
      expect(line).not.toMatch(/—|–/);
      expect(line).not.toMatch(/\b(failure|loser|lazy|pathetic|disappointed|you missed|slipping|ashamed)\b/i);
    }
  });
});
