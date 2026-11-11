/**
 * The skyling's cloud and what grows on it (owner, 2026-11-11, from the picture he said yes to), drawn in code on the
 * skylings' 4 px grid: rows of palette letters, "." empty. Stars unlock the lights, kite, Puff, swing, hammock and
 * rainbow slide; suns the balloon, cloud house, telescope, tiny planet and floating garden.
 */

export const PAL: Record<string, string> = {
  k: "#262320",
  w: "#ffffff",
  c: "#fff1d2",
  y: "#ffdc6e",
  Y: "#dcae35",
  o: "#f9a63a",
  O: "#c97a33",
  r: "#f08a78",
  R: "#c4542a",
  p: "#f7c1b0",
  b: "#8fb9ee",
  B: "#4f77b8",
  g: "#86d3a0",
  G: "#3f9a68",
  e: "#4b9a72",
  d: "#dba86b",
  D: "#8a5a3c",
  l: "#fbf6ea",
  L: "#e2d6bd",
  S: "#a9b9d3",
  X: "#ffffff",
};

const grid = (w: number, h: number) => Array.from({ length: h }, () => Array<string>(w).fill("."));
const put = (g: string[][], x: number, y: number, c: string) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
};
const rows = (g: string[][]) => g.map((r) => r.join(""));

const BULB = ["..k..", ".kyk.", "kywyk", ".kyk.", "..k.."];

/** Star lights: a garland of little outlined stars along the cloud's front, swagging between them. */
export function lights(w: number): string[] {
  const g = grid(w, 6);
  const gap = 9;
  for (let x = 0; x < w; x++) {
    const t = (((x - 2) % gap) + gap) % gap;
    put(g, x, 2 + Math.round(2.2 * Math.sin((Math.PI * t) / gap)), "D");
  }
  for (let x = 2; x <= w - 3; x += gap) BULB.forEach((r, y) => [...r].forEach((ch, i) => ch !== "." && put(g, x - 2 + i, y, ch)));
  return rows(g);
}

/** The cloud they live on, `w` cells wide. */
export function cloud(w: number): string[] {
  const span = (a: number, b: number, ch: string) => Array.from({ length: w }, (_, i) => (i >= a && i <= b ? ch : ".")).join("");
  const bumps = (pairs: [number, number][]) => Array.from({ length: w }, (_, i) => (pairs.some(([a, b]) => i >= a && i <= b) ? "X" : ".")).join("");
  return [
    bumps([
      [14, 21],
      [w - 32, w - 26],
    ]),
    bumps([
      [9, 27],
      [w - 38, w - 20],
    ]),
    span(3, w - 4, "X"),
    span(0, w - 1, "X"),
    span(0, w - 1, "X"),
    span(1, w - 2, "S"),
    span(4, w - 5, "S"),
  ];
}

const slide = (() => {
  const R = 15;
  const g = grid(R + 1, R + 1);
  const bands = ["r", "o", "y", "g", "b"];
  for (let y = 0; y <= R; y++)
    for (let x = 0; x <= R; x++) {
      const d = Math.hypot(x, y);
      const i = Math.floor(R - d);
      if (d <= R && i >= 0 && i < bands.length) put(g, R - x, y, bands[i]);
    }
  return rows(g);
})();

const house = (() => {
  const g = grid(17, 15);
  for (let y = 0; y < 6; y++) for (let x = 8 - y - 1; x <= 8 + y + 1; x++) put(g, x, y, x === 8 - y - 1 || x === 8 + y + 1 ? "k" : y === 5 ? "B" : "b");
  for (let x = 1; x < 16; x++) put(g, x, 6, "k");
  for (let y = 7; y < 14; y++) for (let x = 2; x <= 14; x++) put(g, x, y, x === 2 || x === 14 ? "k" : "l");
  for (let x = 2; x <= 14; x++) put(g, x, 14, "k");
  for (let y = 8; y <= 11; y++)
    for (let x = 4; x <= 7; x++) {
      const d = Math.hypot(x - 5.5, y - 9.5);
      if (d <= 2.2) put(g, x, y, d > 1.3 ? "k" : "y");
    }
  for (let y = 9; y <= 13; y++) for (let x = 10; x <= 12; x++) put(g, x, y, x === 10 || x === 12 || y === 9 ? "k" : "D");
  put(g, 11, 11, "y");
  return rows(g);
})();

const planet = (() => {
  const g = grid(17, 11);
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 17; x++) {
      const d = Math.hypot(x - 8, y - 5);
      if (d <= 4.4) put(g, x, y, d > 3.6 ? "k" : x + y < 11 ? "g" : "e");
    }
  for (let x = 0; x < 17; x++) {
    const y = Math.round(5 + (x - 8) * 0.28);
    if (Math.hypot(x - 8, y - 5) > 3.6 || y > 5) put(g, x, y, "y");
  }
  return rows(g);
})();

const garden = (() => {
  const g = grid(26, 14);
  const base = [
    "......XXXX....XXX.........",
    "...XXXXXXXXXXXXXXXXX......",
    ".XXXXXXXXXXXXXXXXXXXXXX...",
    "XXXXXXXXXXXXXXXXXXXXXXXX..",
    ".SSSSSSSSSSSSSSSSSSSSSS...",
    "...SSSSSSSSSSSSSSSSS......",
  ];
  base.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && put(g, x, 8 + y, ch)));
  const flower = (x: number, c: string) => {
    put(g, x, 5, c);
    put(g, x - 1, 6, c);
    put(g, x + 1, 6, c);
    put(g, x, 6, "y");
    put(g, x, 7, c);
    put(g, x, 8, "G");
  };
  flower(5, "r");
  flower(11, "p");
  flower(17, "b");
  for (const [x, y] of [
    [8, 6],
    [8, 7],
    [9, 5],
    [14, 7],
    [14, 6],
    [13, 5],
    [20, 7],
    [21, 6],
  ])
    put(g, x, y, "g");
  return rows(g);
})();

/** Each thing's picture, by its key in lib/sky-home.ts. */
export const ART: Record<string, string[]> = {
  lights: lights(30),
  kite: [
    "....k....",
    "...kyk...",
    "..kyyyk..",
    ".kyyoyyk.",
    "kyyoooyyk",
    ".kyyoyyk.",
    "..kyyyk..",
    "...kyk...",
    "....k....",
    "....k....",
    "...rk....",
    "....kr...",
    "....k....",
    "...bk....",
    "....k....",
    "....k....",
    "....k....",
  ],
  puff: ["....SSSS....", "..SSwwwwSS..", ".SwwwwwwwwS.", "SwwkwwwwkwwS", "SwwwwwwwwwwS", "SwpwwkkwwpwS", ".SwwwwwwwwS.", "..SSSSSSSS.."],
  swing: [
    "D..........D",
    "D..........D",
    "D..........D",
    "D..........D",
    "D..........D",
    "D..........D",
    "D..........D",
    "kddddddddddk",
    "kDDDDDDDDDDk",
    ".kkkkkkkkkk.",
  ],
  hammock: [
    "kk......................kk",
    "kDk....................kDk",
    "kDkk..................kkDk",
    "kDkrk................krkDk",
    "kDk.krrk..........krrk.kDk",
    "kDk..kprrrkk..kkrrrpk..kDk",
    "kDk...kkpprrrrrrppkk...kDk",
    "kDk.....kkkkkkkkkk.....kDk",
    "kDk....................kDk",
    "kDk....................kDk",
  ],
  slide,
  balloon: [
    "....kkkkk....",
    "..kkrrwrrkk..",
    ".krrrrwrrrrk.",
    ".krrrrwrrrrk.",
    "krrrrrwrrrrrk",
    "krrrrrwrrrrrk",
    "krRrrrwrrrRrk",
    ".krRrrwrrRrk.",
    ".kkrRrwrRrkk.",
    "..kkRRwRRkk..",
    "...kkkkkkk...",
    "....k...k....",
    "....k...k....",
    "....k...k....",
    "...kdddddk...",
    "...kdDDDdk...",
    "...kkkkkkk...",
  ],
  house,
  telescope: [
    ".........kk.",
    ".......kkbk.",
    ".....kkbbBk.",
    "...kkbbbBk..",
    ".kkbbbBkk...",
    "kbbBBkk.....",
    ".kkkk.......",
    "...kkk......",
    "...kDk......",
    "..kDkDk.....",
    ".kDk.kDk....",
    "kDk...kDk...",
  ],
  planet,
  garden,
};

/** The little star and sun beside the counts. */
export const STAR_ICON = ["...k...", "..kyk..", "kkkykkk", ".kyyyk.", "..kyk..", ".ky.yk.", ".kk.kk."];
export const SUN_ICON = [".....Y.....", ".Y..kkk..Y.", "...kyyyk...", "..kyccyyk..", "YYkyyyyykYY", "..kyyyyYk..", "...kyyYk...", ".Y..kkk..Y.", ".....Y....."];

/** One rect per run of a colour in a row, so a picture is a few dozen shapes. `ghost` draws it as a faint shape. */
export function runs(art: string[], ghost?: string): { x: number; y: number; n: number; fill: string }[] {
  const out: { x: number; y: number; n: number; fill: string }[] = [];
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (!ghost ? row[x + n] === ch : row[x + n] !== undefined && row[x + n] !== "." && ch !== ".") n++;
      if (ch !== "." && PAL[ch]) out.push({ x, y, n, fill: ghost ?? PAL[ch] });
      x += n;
    }
  });
  return out;
}

export const widthOf = (art: string[]) => Math.max(...art.map((r) => r.length));
