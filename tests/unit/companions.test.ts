import { describe, expect, it } from "vitest";
import { FRAMES, formOf, GRID, pixels, type Pose } from "@/components/day-clock/companion";
import { COMPANION_KEYS, COMPANIONS, companionOf, DEFAULT_COMPANION, isCompanionKey } from "@/lib/companions";

const INK = "#262320";
const POSES = Object.keys(FRAMES) as Pose[];

describe("the cast (docs/design/companions/cast.md)", () => {
  it("has the five, each once, named for the sky (owner, 2026-11-11)", () => {
    expect(COMPANIONS.map((c) => c.key)).toEqual([...COMPANION_KEYS]);
    expect(COMPANIONS.map((c) => c.name)).toEqual(["Dawn", "Ray", "Goldie", "Star", "Moon"]);
  });

  it("never says Jarvis, never uses an em dash, and every tone is a real one", () => {
    for (const c of COMPANIONS) {
      const words = [c.name, c.moment, c.line, ...c.traits, c.skill, c.voiceNote, c.sample].join(" ");
      expect(words).not.toMatch(/jarvis/i);
      expect(words).not.toContain("—");
      expect(["friend", "coach", "direct"]).toContain(c.tone);
    }
  });

  it("falls back to the default until something real is picked", () => {
    expect(companionOf(undefined).key).toBe(DEFAULT_COMPANION);
    expect(companionOf("nobody").key).toBe(DEFAULT_COMPANION);
    expect(companionOf("star").name).toBe("Star");
    expect(isCompanionKey("goldie")).toBe(true);
    expect(isCompanionKey("Goldie")).toBe(false);
  });

  it("draws every companion in every pose and frame inside its 24 x 24 grid, outlined, with feet on the ground", () => {
    for (const c of COMPANIONS)
      for (const night of [false, true])
        for (const pose of POSES)
          FRAMES[pose].forEach((f, i) => {
            const px = pixels(c, pose, i, night);
            expect(px.length).toBeGreaterThan(80);
            for (const [x, y] of px) {
              expect(x).toBeGreaterThanOrEqual(0);
              expect(x).toBeLessThan(GRID);
              expect(y).toBeGreaterThanOrEqual(0);
              expect(y).toBeLessThan(GRID);
            }
            expect(px.some(([, , col]) => col === INK)).toBe(true);
            // standing (not asleep, not in the air): two boots on rows 21 and 22
            if (f.feet && !f.air) expect(px.filter(([, y, col]) => y === 22 && col === INK).length).toBe(4);
          });
  });

  it("has a night form that differs from its day form, and Star and Moon are the other way round", () => {
    for (const c of COMPANIONS) {
      const day = JSON.stringify(pixels(c, "idle", 0, false));
      const night = JSON.stringify(pixels(c, "idle", 0, true));
      expect(night).not.toEqual(day);
    }
    const star = companionOf("star");
    expect(formOf(star, true)).toMatchObject({ pin: false, squint: false, body: star.look.body });
    expect(formOf(star, false)).toMatchObject({ squint: true });
    const moon = companionOf("moon");
    expect(formOf(moon, true)).toMatchObject({ pin: false, body: moon.look.body });
    expect(formOf(companionOf("dawn"), true).pin).toBe(true);
  });

  it("Star can wear the sunset glow, and the moon shows its night side", () => {
    const star = companionOf("star");
    expect(pixels(star, "idle", 0, true, true)).not.toEqual(pixels(star, "idle", 0, true));
    expect(pixels(companionOf("moon"), "idle", 0, true).some(([, , col]) => col === "#33497c")).toBe(true);
  });

  it("walks in four frames and cheers in four, so a frame number past the end wraps", () => {
    expect(FRAMES.walk).toHaveLength(4);
    expect(FRAMES.celebrate).toHaveLength(4);
    const c = companionOf("ray");
    expect(pixels(c, "walk", 5, false)).toEqual(pixels(c, "walk", 1, false));
  });
});
