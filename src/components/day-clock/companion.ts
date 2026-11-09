/**
 * The companion (Morrow concept, owner 2026-11-09): a small pixel character that is the assistant, drawn in code on a
 * 16x16 grid (no image files). One body, dressed per companion; a night form for after sunset. Pure drawing: no state.
 */
export type Companion = {
  name: string;
  body: string;
  dark: string;
  light: string;
  top: "cloud" | "ray" | "halo" | "flame" | "crescent" | "star";
  trim?: string;
  trim2?: string;
  eye?: string;
};
export type Pose = "stand" | "walk" | "sleep";

const INK = "#262320";

/** Times of the sky: each companion is named for a part of the day, and is best then. */
export const COMPANIONS: Companion[] = [
  { name: "Aurora", body: "#f7b7a3", dark: "#d98b76", light: "#ffe2d8", top: "cloud" },
  { name: "Sol", body: "#f7b45e", dark: "#d08530", light: "#ffe0b0", trim: "#f4a44a", trim2: "#ffd38a", top: "ray" },
  { name: "Zenith", body: "#ffd66b", dark: "#d9aa36", light: "#fff1bf", trim: "#fff3c4", top: "halo" },
  { name: "Gloam", body: "#f39a6b", dark: "#c76c3f", light: "#ffd2b8", trim: "#ffd38a", trim2: "#ff7a2f", top: "flame" },
  { name: "Dusk", body: "#6f9be0", dark: "#4a72b8", light: "#c7dcf7", trim: "#f4a44a", top: "crescent" },
  { name: "Nox", body: "#26385f", dark: "#172540", light: "#4b6596", eye: "#ffd77a", trim: "#fff3c4", trim2: "#ffffff", top: "star" },
];

function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/** The night form: the same companion pale as the moon, wearing a little gold crescent (Day Sky: no purple). */
export function nightOf(c: Companion): Companion {
  return {
    ...c,
    body: mix(c.body, "#e6edf8", 0.82),
    dark: mix(c.dark, "#b2c1da", 0.8),
    light: "#ffffff",
    top: "crescent",
    trim: "#ffd77a",
  };
}

/** The pixels of a companion in a pose, at a step of its walk (alternate steps move the feet and bob the body). */
export function pixels(c: Companion, pose: Pose, step: number) {
  const px = new Map<number, string>();
  const put = (x: number, y: number, col: string) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) px.set(y * 16 + x, col);
  };
  const sleep = pose === "sleep";
  const h = 8;
  const inset = [2, 1, 0, 0, 0, 0, 1, 2];
  const top = (sleep ? 6 : 4) - (pose === "walk" ? step % 2 : 0);
  for (let y = 0; y < h; y++)
    for (let x = 3 + inset[y]; x <= 12 - inset[y]; x++) {
      const edge = x === 3 + inset[y] || x === 12 - inset[y] || y === 0 || y === h - 1;
      put(x, top + y, edge ? INK : y >= h - 3 ? c.dark : c.body);
    }
  put(5, top + 1, c.light);
  put(6, top + 1, c.light);
  put(5, top + 2, c.light);
  const ey = top + 3 + (sleep ? 1 : 0);
  if (sleep) {
    for (const x of [6, 7, 9, 10]) put(x, ey, INK);
    for (const [x, y] of [
      [13, top - 2],
      [14, top - 2],
      [14, top - 3],
      [13, top - 4],
      [14, top - 4],
    ])
      put(x, y, "#8fa0c4");
  } else {
    for (const x of [6, 10]) {
      put(x, ey, c.eye ?? INK);
      put(x, ey + 1, c.eye ?? INK);
    }
    put(5, ey + 2, "#f2a0a0");
    put(11, ey + 2, "#f2a0a0");
  }
  const t = top - 1;
  const T = c.trim ?? "#ffd34d";
  const T2 = c.trim2 ?? T;
  const tops: Record<Companion["top"], [number, number, string][]> = {
    cloud: [
      [7, t, "#fff"],
      [8, t, "#fff"],
      [9, t, "#fff"],
      [10, t, "#fff"],
      [8, t - 1, "#fff"],
      [9, t - 1, "#fff"],
    ],
    ray: [
      [8, t - 1, T],
      [5, t, T],
      [11, t, T],
      [3, t + 2, T],
      [13, t + 2, T],
      [8, t - 2, T2],
    ],
    halo: [
      [6, t - 1, T],
      [7, t - 1, T],
      [8, t - 1, T],
      [9, t - 1, T],
      [10, t - 1, T],
      [5, t, T],
      [11, t, T],
    ],
    flame: [
      [8, t, T],
      [7, t, T2],
      [9, t, T2],
      [8, t - 1, "#ffe08a"],
      [9, t - 2, T],
    ],
    crescent: [
      [9, t, T],
      [10, t, T],
      [8, t - 1, T],
      [8, t - 2, T],
      [9, t - 3, T],
      [10, t - 3, T],
    ],
    star: [
      [8, t - 2, T],
      [7, t - 1, T],
      [8, t - 1, T2],
      [9, t - 1, T],
      [8, t, T],
    ],
  };
  for (const [x, y, col] of tops[c.top]) put(x, y, col);
  if (!sleep) {
    const fy = top + h;
    const legs = pose === "walk" ? (step % 2 ? [6, 9] : [4, 10]) : [5, 10];
    for (const x of legs) {
      put(x, fy, INK);
      put(x + 1, fy, INK);
    }
  }
  return px;
}

/** Paint a companion onto a 16x16 canvas (shown larger with `image-rendering: pixelated`). */
export function drawCompanion(canvas: HTMLCanvasElement, c: Companion, pose: Pose, step: number, flip = false) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 16, 16);
  for (const [k, col] of pixels(c, pose, step)) {
    const x = k % 16;
    g.fillStyle = col;
    g.fillRect(flip ? 15 - x : x, Math.floor(k / 16), 1, 1);
  }
}
