/**
 * The morning mark (owner, 2026-11-09: "the logo is going to be just the morning"): the sun rising on the morning
 * horizon, with its small face. One geometry in a 100 x 100 box, shared by the React component (brand-mark.tsx), the
 * app icons (scripts/brand-icons.ts) and the opening splash, so the mark never drifts between them.
 *
 * Colours come from the real sky (lib/sky.ts) and the brand tokens (globals.css): never purple.
 */
export const MARK = {
  /** The horizon's centre line, in viewBox units. */
  horizon: 66,
  cx: 50,
  sunR: 36,
  /** The eyes: this far to each side of the centre and this far above the horizon. */
  eyeDx: 10,
  eyeDy: 15,
  eyeR: 3.4,
  /** The horizon line: its left edge, width and thickness. */
  line: { x: 4, w: 92, h: 5.5 },
  /** How far the glow reaches above the horizon. */
  glowR: 50,
} as const;

export const MARK_COLORS = {
  /** --sun, the top of the disc a touch lighter so it reads as light, not paint. */
  sunTop: "#ffc247",
  sun: "#f5a524",
  sunLow: "#f29a1c",
  /** --night: the face. */
  ink: "#07101f",
  /** skyAt's late-morning blue: reads on white and on the night page alike (about 4.4:1 on both). */
  horizon: "#2f7cd2",
  /** skyAt's sunrise peach near the horizon. */
  glow: "#ffd7ad",
  glowDeep: "#ffb27a",
} as const;

/** The sky behind the app icon: the morning from lib/sky.ts, top to horizon, and the calm ground below it. */
export const ICON_SKY = {
  top: "#3f7fc8",
  mid: "#8fbbe6",
  low: "#ffd7ad",
  horizon: "#ffb27a",
  groundTop: "#1b3263",
  groundBottom: "#0b1a3a",
  /** Where the horizon sits on the tile, as a fraction of its height. */
  horizonAt: 0.64,
} as const;

const { horizon, cx, sunR, eyeDx, eyeDy, eyeR, line, glowR } = MARK;

/** The inner shapes of the mark as SVG markup (no <svg> wrapper), for scripts. `id` keeps gradients unique on a page. */
export function morningMarkInner(id: string, opts: { glow?: boolean } = {}): string {
  const glow = opts.glow ?? true;
  return [
    `<defs>`,
    `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${MARK_COLORS.sunTop}"/><stop offset="0.55" stop-color="${MARK_COLORS.sun}"/><stop offset="1" stop-color="${MARK_COLORS.sunLow}"/>`,
    `</linearGradient>`,
    `<radialGradient id="${id}g" cx="${cx}" cy="${horizon}" r="${glowR}" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${MARK_COLORS.glow}" stop-opacity="0.95"/><stop offset="0.5" stop-color="${MARK_COLORS.glowDeep}" stop-opacity="0.45"/><stop offset="1" stop-color="${MARK_COLORS.glowDeep}" stop-opacity="0"/>`,
    `</radialGradient>`,
    `<clipPath id="${id}c"><rect x="0" y="0" width="100" height="${horizon - line.h / 2}"/></clipPath>`,
    `</defs>`,
    `<g clip-path="url(#${id}c)">`,
    glow ? `<circle cx="${cx}" cy="${horizon}" r="${glowR}" fill="url(#${id}g)"/>` : "",
    `<circle cx="${cx}" cy="${horizon}" r="${sunR}" fill="url(#${id}s)"/>`,
    `<circle cx="${cx - eyeDx}" cy="${horizon - eyeDy}" r="${eyeR}" fill="${MARK_COLORS.ink}"/>`,
    `<circle cx="${cx + eyeDx}" cy="${horizon - eyeDy}" r="${eyeR}" fill="${MARK_COLORS.ink}"/>`,
    `</g>`,
    `<rect x="${line.x}" y="${horizon - line.h / 2}" width="${line.w}" height="${line.h}" rx="${line.h / 2}" fill="${MARK_COLORS.horizon}"/>`,
  ].join("");
}

/** A standalone SVG of the mark, `size` px square, transparent behind it. */
export function morningMarkSvg(size: number, id = "mm"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${morningMarkInner(id)}</svg>`;
}

/**
 * The app icon: the mark on a morning-sky tile. `corner` is the corner radius as a fraction of the size (0 for
 * full-bleed icons that the platform rounds itself); `safe` scales the mark toward the centre (maskable icons keep
 * everything inside the inner 80%).
 */
export function morningIconSvg(size: number, opts: { corner?: number; safe?: number; id?: string } = {}): string {
  const { corner = 0, safe = 1, id = "mi" } = opts;
  const hy = ICON_SKY.horizonAt * 100;
  // Scale the mark about its horizon so the line stays on the tile's horizon.
  const t = `translate(${50 - 50 * safe} ${hy - horizon * safe}) scale(${safe})`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
    `<defs>`,
    `<linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${ICON_SKY.top}"/><stop offset="${(hy / 100) * 0.55}" stop-color="${ICON_SKY.mid}"/>`,
    `<stop offset="${(hy / 100) * 0.86}" stop-color="${ICON_SKY.low}"/><stop offset="${hy / 100}" stop-color="${ICON_SKY.horizon}"/>`,
    `<stop offset="${hy / 100 + 0.001}" stop-color="${ICON_SKY.groundTop}"/><stop offset="1" stop-color="${ICON_SKY.groundBottom}"/>`,
    `</linearGradient>`,
    `<clipPath id="${id}tile"><rect x="0" y="0" width="100" height="100" rx="${corner * 100}"/></clipPath>`,
    `</defs>`,
    `<g clip-path="url(#${id}tile)">`,
    `<rect x="0" y="0" width="100" height="100" fill="url(#${id}sky)"/>`,
    `<g transform="${t}">${morningMarkInner(id)}</g>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
