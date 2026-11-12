/**
 * The idea clouds' picture (owner's yes, 2026-11-10): a pixel cloud drawn in code, the way the skylings are. A rounded
 * body with puffs on top, an ink edge and a pale underside, made as a small tile whose corners hold the puffs and whose
 * middle stretches, so one drawing fits a sentence of any length (CSS border-image). Three shapes, by day and at night.
 */
type Shape = { puffs: [cx: number, cy: number, r: number][]; left: number; right: number };
/** The tile's size in drawn pixels: `top` and `bottom` are the slices that hold the puffs and the underside. */
type Grid = { w: number; h: number; top: number; bottom: number; corner: number };

const SMALL: Grid = { w: 48, h: 21, top: 9, bottom: 5, corner: 3.2 };
/** Screen pixels per drawn pixel. */
export const CLOUD_SCALE = 2;

const SHAPES: Shape[] = [
  {
    puffs: [
      [11, 8, 6.3],
      [19.5, 9, 4.2],
      [38, 9.5, 3.6],
    ],
    left: 26,
    right: 14,
  },
  {
    puffs: [
      [9, 9.5, 3.4],
      [29, 9, 4.4],
      [37, 8, 6.3],
    ],
    left: 13,
    right: 27,
  },
  {
    puffs: [
      [10, 9, 4.6],
      [20, 8, 6.2],
      [36, 9.5, 3.8],
    ],
    left: 29,
    right: 17,
  },
];

type Palette = { ink: string; body: string; shade: string };
export type CloudWeather = "tip" | "heads-up" | "storm";

/**
 * The weather (owner, 2026-11-12): a white cloud is a tip, a grey one a heads-up, a dark one with rain real trouble. Every
 * pair is measured, not eyed: tests/unit/cloud-contrast.test.ts checks text on body (4.5:1), the button's text and outline
 * (4.5:1 and 3:1), and each cloud's edge against the day and night sky (3:1), so a dark cloud can't vanish at night.
 * At night the dark cloud gets a light edge for that reason.
 */
export const CLOUD_PALETTES: Record<CloudWeather, { day: Palette; night: Palette }> = {
  tip: { day: { ink: "#262320", body: "#ffffff", shade: "#d6e4f7" }, night: { ink: "#0a1630", body: "#eef3ff", shade: "#bac9ea" } },
  "heads-up": { day: { ink: "#262320", body: "#c5cddb", shade: "#97a3b9" }, night: { ink: "#0a1630", body: "#b9c3d8", shade: "#8e9ab5" } },
  storm: { day: { ink: "#141b2c", body: "#3a4560", shade: "#283148" }, night: { ink: "#b4c5f2", body: "#3c496f", shade: "#2e3a60" } },
};
/** Text and button colours that sit on each cloud (day and night share them; only the body changes). */
export const CLOUD_TEXT: Record<CloudWeather, { text: string; muted: string; buttonBg: string; buttonText: string; buttonOutline: string }> = {
  tip: { text: "#13213d", muted: "#33415e", buttonBg: "#1b3a73", buttonText: "#ffffff", buttonOutline: "#13213d" },
  "heads-up": { text: "#13213d", muted: "#2a3856", buttonBg: "#1b3a73", buttonText: "#ffffff", buttonOutline: "#13213d" },
  storm: { text: "#ffffff", muted: "#e8edfd", buttonBg: "#ffd66b", buttonText: "#1a2236", buttonOutline: "#ffd66b" },
};
/** The sky behind the clouds: the app's day background and the night one, and a mid sky blue for the day wheel. */
export const SKY = { day: ["#f6f8fb", "#8fb6e8"], night: ["#152643", "#0a1630"] } as const;

/**
 * The skyling's own thought (owner, 2026-11-12: "a bigger cloud showing it as skylings insight"): a wide cumulus with
 * puffs all along its top, so a big cloud still reads as a cloud, not a card. Its left and right slices meet in a small
 * valley in the middle, the only part that stretches, so the puffs keep their shape at any width.
 */
const BIG: Grid = { w: 150, h: 34, top: 16, bottom: 6, corner: 6 };
/** Three cumulus shapes, so a row of them never looks stamped out. */
const THOUGHTS: Shape[] = [
  {
    puffs: [
      [15, 17, 8],
      [33, 12, 11],
      [53, 15, 9],
      [67, 16, 6],
      [83, 16, 6],
      [97, 13, 10],
      [117, 10, 9.5],
      [135, 16, 8],
    ],
    left: 74,
    right: 74,
  },
  {
    puffs: [
      [12, 18, 7],
      [28, 13, 10],
      [47, 11, 10.5],
      [64, 16, 7],
      [84, 16, 6],
      [101, 11.5, 11],
      [121, 14, 9],
      [138, 18, 6],
    ],
    left: 74,
    right: 74,
  },
  {
    puffs: [
      [16, 15, 9],
      [36, 11, 10],
      [54, 16, 7],
      [68, 16, 5],
      [82, 15, 7],
      [96, 14, 9],
      [114, 10, 9.5],
      [133, 15, 9],
    ],
    left: 74,
    right: 74,
  },
];

/** How many rows of shade the underside has: a heavy cloud (a heads-up, a storm) hangs low and dark. */
const BELLY: Record<CloudWeather, number> = { tip: 2, "heads-up": 4, storm: 4 };

function tile(shape: Shape, c: Palette, grid: Grid = SMALL, belly = 2): string {
  const { w: W, h: H } = grid;
  const inBody = (x: number, y: number) => {
    const x0 = 1;
    const x1 = W - 2;
    const y0 = grid.top;
    const y1 = H - 2;
    const r = grid.corner;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
    const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.6;
  };
  const filled = (x: number, y: number) => inBody(x, y) || shape.puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  const g: string[][] = [];
  for (let y = 0; y < H; y++) {
    g.push([]);
    for (let x = 0; x < W; x++) g[y].push(filled(x, y) ? "w" : ".");
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? "." : g[y][x]);
  // the underside: the body's lowest rows (two, or four on a heavy cloud)
  for (let x = 0; x < W; x++)
    for (let y = H - 2 - belly; y < H; y++)
      if (g[y][x] === "w" && Array.from({ length: belly }, (_, k) => at(x, y + k + 1)).includes(".")) g[y][x] = "s";
  const out = g.map((row) => [...row]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (g[y][x] === "." && [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((ch) => ch !== ".")) out[y][x] = "k";
  const fill: Record<string, string> = { k: c.ink, w: c.body, s: c.shade };
  let rects = "";
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const ch = out[y][x];
      if (ch === ".") {
        x++;
        continue;
      }
      let end = x;
      while (end < W && out[y][end] === ch) end++;
      rects += `<rect x='${x}' y='${y}' width='${end - x}' height='1' fill='${fill[ch]}'/>`;
      x = end;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/#/g, "%23")}")`;
}

export type CloudStyle = {
  "--cloud-day": string;
  "--cloud-night": string;
  "--cloud-slice": string;
  "--cloud-l": string;
  "--cloud-r": string;
  borderWidth: string;
};

const made = new Map<string, CloudStyle>();

/**
 * The style for cloud number `i` (the three shapes take turns) in a kind of weather. Made once per shape and weather.
 */
export function weatherCloudStyle(i: number, weather: CloudWeather): CloudStyle {
  const k = ((i % SHAPES.length) + SHAPES.length) % SHAPES.length;
  const id = `${k}:${weather}`;
  let s = made.get(id);
  if (!s) {
    const shape = SHAPES[k];
    s = {
      "--cloud-day": tile(shape, CLOUD_PALETTES[weather].day),
      "--cloud-night": tile(shape, CLOUD_PALETTES[weather].night),
      ...slices(shape, SMALL, CLOUD_SCALE),
    };
    made.set(id, s);
  }
  return s;
}

function slices(shape: Shape, grid: Grid, scale: number) {
  return {
    "--cloud-slice": `${grid.top} ${shape.right} ${grid.bottom} ${shape.left} fill`,
    "--cloud-l": `${shape.left * scale}px`,
    "--cloud-r": `${shape.right * scale}px`,
    borderWidth: `${grid.top * scale}px ${shape.right * scale}px ${grid.bottom * scale}px ${shape.left * scale}px`,
  };
}

/** The big cumulus (the skyling's thought, and every cloud on a phone's Today) number `i`, in a kind of weather. */
export function thoughtCloudStyle(weather: CloudWeather, i = 0): CloudStyle {
  const k = ((i % THOUGHTS.length) + THOUGHTS.length) % THOUGHTS.length;
  const id = `thought:${k}:${weather}`;
  let s = made.get(id);
  if (!s) {
    const shape = THOUGHTS[k];
    s = {
      "--cloud-day": tile(shape, CLOUD_PALETTES[weather].day, BIG, BELLY[weather]),
      "--cloud-night": tile(shape, CLOUD_PALETTES[weather].night, BIG, BELLY[weather]),
      ...slices(shape, BIG, CLOUD_SCALE),
    };
    made.set(id, s);
  }
  return s;
}

/** The white cloud (the default) for cloud number `i`. */
export const cloudStyle = (i: number): CloudStyle => weatherCloudStyle(i, "tip");
