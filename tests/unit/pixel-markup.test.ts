import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COLOR, MONO, PIXEL_PALETTE } from "@/components/pixel/art";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { CompanionGlyph } from "@/components/sky/companion-glyph";

// A page carries 50 to 60 pixel pictures; drawn as a rect per run they were most of its markup (Money 400 KB a load).
// One path per colour draws the same pixels (checked pixel for pixel against the rects, 86 of 86, 2026-11-10).
describe("pixel pictures stay light", () => {
  it("an icon is one path per colour, never rects", () => {
    for (const name of [...Object.keys(COLOR), ...Object.keys(MONO)]) {
      const html = renderToStaticMarkup(createElement(PixelIcon, { name: name as keyof typeof COLOR }));
      expect(html).not.toContain("<rect");
      const fills = new Set([...html.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]));
      expect(html.match(/<path/g)?.length).toBe(fills.size);
    }
  });

  it("a colour icon keeps its palette, a one-colour icon follows the text", () => {
    expect(renderToStaticMarkup(createElement(PixelIcon, { name: "trash" }))).toContain(`fill="${PIXEL_PALETTE.k}"`);
    expect(renderToStaticMarkup(createElement(PixelIcon, { name: "check" }))).toMatch(/^<svg[^>]*><path d="[^"]+" fill="currentColor"><\/path><\/svg>$/);
  });

  it("the skyling is one path per colour too, and small", () => {
    const html = renderToStaticMarkup(createElement(CompanionGlyph, { companion: "ray" }));
    expect(html).not.toContain("<rect");
    expect(html.length).toBeLessThan(6000);
  });
});
