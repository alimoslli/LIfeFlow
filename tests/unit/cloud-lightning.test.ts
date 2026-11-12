import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The lightning flicker is CSS only and must never flash more than 3 times a second (owner, 2026-11-12). Read from the
 * stylesheet itself: the keyframes' "bright" spans, over the animation's period.
 */
describe("lightning", () => {
  const css = readFileSync("src/components/skylings/skylings.css", "utf8");
  const frames = css.match(/@keyframes lf-bolt \{([\s\S]*?)\n {2}\}/)![1];
  const period = Number(css.match(/animation: lf-bolt ([\d.]+)s/)![1]);
  const steps = [...frames.matchAll(/([\d.%,\s]+)\{\s*opacity: ([\d.]+);/g)].flatMap((m) =>
    m[1]
      .split(",")
      .map((p) => parseFloat(p))
      .filter((n) => !Number.isNaN(n))
      .map((at) => ({ at, opacity: Number(m[2]) })),
  );
  const onsets = steps
    .filter((s) => s.opacity === 1)
    .map((s) => s.at)
    .sort((a, b) => a - b)
    // only the first step of each bright span is an onset
    .filter((at, i, all) => i === 0 || at - all[i - 1] > 2);

  it("flashes a small, fixed number of times per cycle", () => {
    expect(onsets.length).toBeGreaterThanOrEqual(1);
    expect(onsets.length).toBeLessThanOrEqual(2);
  });

  it("never more than 3 flashes in any second, including across the loop", () => {
    const times = onsets.map((p) => (p / 100) * period);
    const all = [...times, ...times.map((t) => t + period)];
    for (const t of all) expect(all.filter((u) => u >= t && u < t + 1).length).toBeLessThanOrEqual(3);
  });

  it("is switched off under reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.lf-idea-bolt \{\s*animation: none;/);
  });
});
