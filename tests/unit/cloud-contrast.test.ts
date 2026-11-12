import { describe, expect, it } from "vitest";
import { CLOUD_PALETTES, CLOUD_TEXT, SKY, type CloudWeather } from "@/components/skylings/cloud-tile";

/**
 * Contrast, measured and not eyed (owner, 2026-11-12). WCAG 2.x ratios: text on its cloud 4.5:1 (also with the rain's
 * streaks at full strength over the body), the button's text on its fill 4.5:1, the button's outline against the cloud 3:1,
 * and each cloud's shape (its outline or its body, whichever stands out more) against the day and night sky 3:1, so a dark
 * cloud can't vanish on the night sky.
 */
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (top: string, bottom: string, alpha: number) =>
  "#" +
  rgb(top)
    .map((c, i) =>
      Math.round(c * alpha + rgb(bottom)[i] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const RAIN = "#b0c4f5";
const RAIN_ALPHA = 0.26;

const weathers = Object.keys(CLOUD_PALETTES) as CloudWeather[];
export const rows = weathers.flatMap((w) =>
  (["day", "night"] as const).map((theme) => {
    const p = CLOUD_PALETTES[w][theme];
    const t = CLOUD_TEXT[w];
    const bodyWithRain = w === "storm" ? mix(RAIN, p.body, RAIN_ALPHA) : p.body;
    return {
      cloud: `${w} ${theme}`,
      headline: ratio(t.text, p.body),
      headlineOnRain: ratio(t.text, bodyWithRain),
      why: ratio(t.muted, p.body),
      whyOnRain: ratio(t.muted, bodyWithRain),
      buttonText: ratio(t.buttonText, t.buttonBg),
      buttonOutline: ratio(t.buttonOutline, p.body),
      // the cloud's outline is its edge: the dark ink, or the body where the ink is close to the sky's own colour
      edgeVsSky: Math.min(...SKY[theme].map((sky) => Math.max(ratio(p.ink, sky), ratio(p.body, sky)))),
    };
  }),
);

describe("cloud contrast (measured)", () => {
  it("prints the numbers", () => {
    if (process.env.PRINT_CONTRAST)
      console.table(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? Number(v.toFixed(2)) : v]))));
  });
  for (const r of rows)
    it(`${r.cloud}: text 4.5:1, button text 4.5:1, button outline 3:1, edge against the sky 3:1`, () => {
      expect(r.headline).toBeGreaterThanOrEqual(4.5);
      expect(r.headlineOnRain).toBeGreaterThanOrEqual(4.5);
      expect(r.why).toBeGreaterThanOrEqual(4.5);
      expect(r.whyOnRain).toBeGreaterThanOrEqual(4.5);
      expect(r.buttonText).toBeGreaterThanOrEqual(4.5);
      expect(r.buttonOutline).toBeGreaterThanOrEqual(3);
      expect(r.edgeVsSky).toBeGreaterThanOrEqual(3);
    });
});
