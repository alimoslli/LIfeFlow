/**
 * The idea clouds' picture (owner's yes, 2026-11-10): a pixel cloud drawn in code, the way the skylings are. A rounded
 * body with puffs on top, an ink edge and a pale underside, made as a small tile whose corners hold the puffs and whose
 * middle stretches, so one drawing fits a sentence of any length (CSS border-image). Three shapes, by day and at night.
 */
type Shape = { puffs: [cx: number, cy: number, r: number][]; left: number; right: number };

const W = 48;
const H = 21;
const TOP = 9;
const BOTTOM = 5;
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

const DAY = { ink: "#262320", body: "#ffffff", shade: "#d6e4f7" };
const NIGHT = { ink: "#0a1630", body: "#eef3ff", shade: "#bac9ea" };

function tile(shape: Shape, c: typeof DAY): string {
  const inBody = (x: number, y: number) => {
    const x0 = 1;
    const x1 = W - 2;
    const y0 = TOP;
    const y1 = H - 2;
    const r = 3.2;
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
  // the underside: the body's two lowest rows
  for (let x = 0; x < W; x++) for (let y = H - 4; y < H; y++) if (g[y][x] === "w" && (at(x, y + 1) === "." || at(x, y + 2) === ".")) g[y][x] = "s";
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

const made = new Map<number, CloudStyle>();

/** The style for cloud number `i` (the three shapes take turns). Made once per shape. */
export function cloudStyle(i: number): CloudStyle {
  const k = ((i % SHAPES.length) + SHAPES.length) % SHAPES.length;
  let s = made.get(k);
  if (!s) {
    const shape = SHAPES[k];
    s = {
      "--cloud-day": tile(shape, DAY),
      "--cloud-night": tile(shape, NIGHT),
      "--cloud-slice": `${TOP} ${shape.right} ${BOTTOM} ${shape.left} fill`,
      "--cloud-l": `${shape.left * CLOUD_SCALE}px`,
      "--cloud-r": `${shape.right * CLOUD_SCALE}px`,
      borderWidth: `${TOP * CLOUD_SCALE}px ${shape.right * CLOUD_SCALE}px ${BOTTOM * CLOUD_SCALE}px ${shape.left * CLOUD_SCALE}px`,
    };
    made.set(k, s);
  }
  return s;
}
