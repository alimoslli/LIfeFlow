/**
 * Day Sky (v3, owner 2026-11-09): what a clear sky looks like at any minute, from sunrise and sunset. Today draws it
 * full (components/day-clock/sky.ts); every other page wears a soft wash of it at the top (components/sky/sky-scene.tsx).
 * Blues and warm light only, never purple (owner: "no purple ... a real looking sky gradient depending on the time").
 *
 * Minutes are wall-clock minutes of the day (0..1439); rise and set come from sunTimes (lib/day-clock.ts).
 */
export type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c: RGB, alpha = 1) => `rgb(${c.map((v) => Math.round(v)).join(" ")}${alpha < 1 ? ` / ${alpha}` : ""})`;
export const luminance = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);

// [minutes from sunrise or sunset, which, top, middle, horizon]
type Key = [number, "rise" | "set" | "noon", string, string, string];
const KEYS: Key[] = [
  [-100, "rise", "#142451", "#233c6e", "#3a5a8f"], // night: moonlit, not black (owner, 2026-11-11: "very dark")
  [-55, "rise", "#182b55", "#2b4677", "#4a6699"], // first light
  [-22, "rise", "#13284f", "#3f5d8c", "#d98a62"], // dawn
  [4, "rise", "#2e5791", "#7d9cc7", "#ffb27a"], // sunrise
  [60, "rise", "#3f7fc8", "#9dc3e8", "#f8dcbc"], // morning
  [150, "rise", "#2f7cd2", "#76b1e8", "#cfe6f8"], // late morning
  [0, "noon", "#2a76d0", "#6aaae6", "#c8e3f8"], // midday
  [-110, "set", "#3479c9", "#7fb2e2", "#d6e7f3"], // afternoon
  [-45, "set", "#4a7fbf", "#a6bfd8", "#ffd391"], // golden hour
  [-5, "set", "#36578f", "#c98f78", "#ff8a45"], // sunset
  [22, "set", "#1b3263", "#6a5a7a", "#e2643f"], // after sunset
  [50, "set", "#1a2d5a", "#344c7c", "#5a6588"], // dusk
  [100, "set", "#142451", "#233c6e", "#3a5a8f"], // night
];

/** The sky's top, middle and horizon colours at a minute of the day. */
export function skyAt(minute: number, rise: number, set: number): [RGB, RGB, RGB] {
  const m = ((minute % 1440) + 1440) % 1440;
  const noon = (rise + set) / 2;
  const keys = KEYS.map(([d, from, a, b, c]) => [(from === "rise" ? rise : from === "set" ? set : noon) + d, hex(a), hex(b), hex(c)] as const).sort(
    (x, y) => x[0] - y[0],
  );
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (m <= first[0] || m >= last[0]) return [first[1], first[2], first[3]];
  for (let i = 1; i < keys.length; i++) {
    if (m <= keys[i][0]) {
      const A = keys[i - 1];
      const B = keys[i];
      const u = (m - A[0]) / (B[0] - A[0] || 1);
      return [mix(A[1], B[1], u), mix(A[2], B[2], u), mix(A[3], B[3], u)];
    }
  }
  return [first[1], first[2], first[3]];
}

/** How dark it is outside: 0 in daylight, 1 at night, eased through dawn and dusk. */
export function darkness(minute: number, rise: number, set: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  if (m >= rise + 15 && m <= set - 15) return 0;
  if (m > set + 70 || m < rise - 70) return 1;
  if (m > set - 15) return seg(m, set - 15, set + 70);
  return 1 - seg(m, rise - 70, rise + 15);
}

/**
 * The wash behind a page: the sky's colours pulled toward the page so text stays readable in either theme (pale by
 * day and at night in light, deep in dark).
 */
export function skyWash(minute: number, rise: number, set: number, dark: boolean): { a: string; b: string } {
  const [top, mid] = skyAt(minute, rise, set);
  const page: RGB = dark ? [21, 38, 67] : [246, 248, 251];
  const k = dark ? 0.45 : 0.62;
  return { a: css(mix(top, page, k)), b: css(mix(mid, page, k + 0.12)) };
}
