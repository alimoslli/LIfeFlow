/**
 * The celebration's pictures, drawn in code on small grids like the skylings and the logo (owner, 2026-11-10: "different
 * stars so it's not the same every single time", and for a milestone "a bigger sun that pops up, sticks out its tongue
 * and does a squiggly animation ... cute and cool"). star(look, face) is a 21 x 21 canvas, sun(frame) a 47 x 47 one.
 */

export type StarLook = { key: string; body: string; light: string; dark: string; ink: string; cheek: string };
export type StarFace = "wow" | "blink" | "happy" | "wink" | "blep" | "hearts" | "cool" | "proud";
export type SunFrame = {
  eyes: "open" | "wow" | "happy" | "wink" | "shut";
  mouth: "smile" | "open" | "tongue";
  hands?: -1 | 0 | 1;
  rays?: number;
  pulse?: number;
  wobble?: number;
  amp?: number;
};

export const STAR_LOOKS: StarLook[] = [
  { key: "gold", body: "#ffd77a", light: "#fff3c4", dark: "#f5a524", ink: "#3a2a14", cheek: "#f39a8b" },
  { key: "rose", body: "#ffb3c6", light: "#ffe5ec", dark: "#f77fa0", ink: "#4a1f2e", cheek: "#ff6f91" },
  { key: "mint", body: "#a8ecc0", light: "#e9fff0", dark: "#57c785", ink: "#173d2a", cheek: "#ff9f8f" },
  { key: "sky", body: "#a9d4ff", light: "#eaf4ff", dark: "#5c9fed", ink: "#172a4a", cheek: "#ff9db0" },
  { key: "lilac", body: "#d2c2ff", light: "#f3edff", dark: "#9d82ee", ink: "#2a1f4d", cheek: "#ff9db0" },
];
export const STAR_FACES: StarFace[] = ["happy", "wink", "blep", "hearts", "cool", "proud"];

const G = 21;
function inStar(x: number, y: number, fat = 5.6) {
  const cx = G / 2,
    cy = G / 2 + 0.9,
    R = 10.4;
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 ? fat : R;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i],
      [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** One star: its look (colours) and face. `wow` is the first surprised frame every star shares. */
export function star(look: StarLook, face: StarFace) {
  const c = document.createElement("canvas");
  c.width = c.height = G;
  const g = c.getContext("2d")!;
  const at = (x: number, y: number) => inStar(x + 0.5, y + 0.5);
  const put = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  const INK = look.ink;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const d = x + 0.5 - G / 2 + (y + 0.5 - G / 2 - 0.9);
      put(x, y, edge ? INK : d > 6 ? look.dark : d < -6 ? look.light : look.body);
    }
  // a glint on the upper arm
  put(8, 5, "#ffffff");
  put(9, 4, "#ffffff");
  const eye = (ex: number, kind: "open" | "arc" | "line" | "heart") => {
    if (kind === "open") {
      put(ex, 9, INK);
      put(ex, 10, INK);
      put(ex + 1, 9, INK);
      put(ex + 1, 10, INK);
      put(ex + 1, 9, "#ffffff");
    } else if (kind === "arc") {
      put(ex - 1, 10, INK);
      put(ex, 9, INK);
      put(ex + 1, 10, INK);
    } else if (kind === "line") {
      put(ex - 1, 10, INK);
      put(ex, 10, INK);
      put(ex + 1, 10, INK);
    } else if (kind === "heart") {
      const H = "#ff4d6d";
      put(ex - 1, 9, H);
      put(ex + 1, 9, H);
      put(ex - 1, 10, H);
      put(ex, 10, H);
      put(ex + 1, 10, H);
      put(ex, 11, H);
    }
  };
  const smile = (open: boolean) => {
    put(8, 12, INK);
    put(12, 12, INK);
    for (const mx of [9, 10, 11]) put(mx, 13, INK);
    if (open) for (const mx of [9, 10, 11]) put(mx, 12, "#e07a7a");
  };
  const cheeks = () => {
    put(5, 12, look.cheek);
    put(6, 12, look.cheek);
    put(15, 12, look.cheek);
    put(16, 12, look.cheek);
  };
  if (face === "wow") {
    eye(7, "open");
    eye(12, "open");
    cheeks();
    for (const [mx, my] of [
      [9, 12],
      [10, 12],
      [11, 12],
      [9, 13],
      [10, 13],
      [11, 13],
    ])
      put(mx, my, INK);
    put(10, 13, "#e07a7a");
  } else if (face === "happy") {
    eye(7, "arc");
    eye(13, "arc");
    cheeks();
    smile(true);
  } else if (face === "blink") {
    eye(7, "line");
    eye(13, "line");
    cheeks();
    smile(true);
  } else if (face === "wink") {
    eye(7, "open");
    eye(13, "arc");
    cheeks();
    smile(true);
  } else if (face === "blep") {
    eye(7, "arc");
    eye(13, "arc");
    cheeks();
    for (const mx of [8, 9, 10, 11, 12]) put(mx, 12, INK);
    const T = "#ff6b81";
    put(10, 13, T);
    put(11, 13, T);
    put(10, 14, T);
    put(11, 14, T);
    put(11, 14, "#e84a66");
  } else if (face === "hearts") {
    eye(7, "heart");
    eye(13, "heart");
    cheeks();
    smile(true);
  } else if (face === "cool") {
    // sunglasses: two dark lenses and a bridge, a glint on each
    for (const [x0] of [[5], [11]]) for (let x = x0; x < x0 + 4; x++) for (let y = 9; y < 11; y++) put(x, y, "#1b1b2a");
    put(9, 9, "#1b1b2a");
    put(10, 9, "#1b1b2a");
    put(4, 9, "#1b1b2a");
    put(15, 9, "#1b1b2a");
    put(6, 9, "#8fb6ff");
    put(12, 9, "#8fb6ff");
    put(9, 13, INK);
    put(10, 13, INK);
    put(11, 13, INK);
    put(12, 12, INK);
  } else if (face === "proud") {
    eye(7, "arc");
    eye(13, "arc");
    cheeks();
    put(9, 13, INK);
    put(10, 13, INK);
    put(11, 13, INK);
  }
  return c;
}

// ---------------------------------------------------------------- the milestone sun (the logo's sun, out to play)
export const SUN_SIZE = 47;
const O = 6; // the body is drawn in a 35 x 35 space, set in the middle of the rays' canvas
const SUN = {
  ink: "#3a2410",
  top: "#ffe680",
  mid: "#ffcc45",
  low: "#ffab2e",
  hi: "#fff6c9",
  cheek: "#ff7a59",
  tongue: "#ff5d73",
  tongue2: "#d93f5a",
  ray1: "#ffe680",
  ray2: "#ffa726",
};

/**
 * One frame of the sun. eyes: open | wow | happy | wink | shut; mouth: smile | open | tongue; hands: -1 | 0 | 1 (down,
 * level, up); rays: 0..1 (how far out they have burst) and pulse (0 | 1, they twinkle); wobble + amp: each row slides
 * sideways along a sine, which is the squiggle.
 */
export function sun(f: SunFrame) {
  const c = document.createElement("canvas");
  c.width = c.height = SUN_SIZE;
  const g = c.getContext("2d")!;
  const px = new Map<string, string>();
  const put = (x: number, y: number, col: string) => px.set(`${x},${y}`, col);
  const cx = 17,
    cy = 17,
    R = 11.6;
  for (let y = 0; y < 35; y++)
    for (let x = 0; x < 35; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r > R + 1.3) continue;
      if (r > R) {
        put(x, y, SUN.ink);
        continue;
      }
      const t = (y - (cy - R)) / (2 * R);
      // three bands with a dithered row between them, so it reads as a soft gradient
      const band =
        t < 0.34 ? SUN.top : t < 0.38 ? ((x + y) % 2 ? SUN.top : SUN.mid) : t < 0.66 ? SUN.mid : t < 0.7 ? ((x + y) % 2 ? SUN.mid : SUN.low) : SUN.low;
      put(x, y, band);
    }
  for (const [x, y] of [
    [11, 8],
    [12, 8],
    [10, 9],
    [11, 9],
    [9, 10],
    [10, 10],
    [9, 11],
    [8, 12],
    [8, 13],
    [13, 7],
    [14, 7],
  ])
    put(x, y, SUN.hi);
  const hy = 19 - (f.hands || 0) * 3;
  for (const hx of [2, 3, 31, 32]) for (const dy of [0, 1, 2]) put(hx, hy + dy, hx === 2 || hx === 32 ? SUN.ink : SUN.mid);
  for (const hx of [3, 31]) {
    put(hx, hy - 1, SUN.ink);
    put(hx, hy + 3, SUN.ink);
  }
  put(4, hy + 1, SUN.ink);
  put(30, hy + 1, SUN.ink);
  put(4, hy, SUN.mid);
  put(30, hy, SUN.mid);
  const eye = (ex: number, kind: SunFrame["eyes"]) => {
    if (kind === "open" || kind === "wow") {
      const top = kind === "wow" ? 12 : 13;
      for (let x = 0; x < 3; x++) for (let y = top; y < 16; y++) put(ex + x, y, SUN.ink);
      put(ex + 2, top, "#ffffff");
    } else if (kind === "happy") {
      put(ex, 15, SUN.ink);
      put(ex, 14, SUN.ink);
      put(ex + 1, 13, SUN.ink);
      put(ex + 2, 14, SUN.ink);
      put(ex + 2, 15, SUN.ink);
    } else if (kind === "shut") {
      for (let x = 0; x < 3; x++) put(ex + x, 15, SUN.ink);
    }
  };
  const [le, re]: SunFrame["eyes"][] = f.eyes === "wink" ? ["open", "happy"] : [f.eyes, f.eyes];
  eye(11, le);
  eye(21, re);
  for (const x0 of [7, 24]) for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) put(x0 + x, 18 + y, SUN.cheek);
  if (f.mouth === "smile") {
    for (const x of [16, 17, 18]) put(x, 20, SUN.ink);
    put(15, 19, SUN.ink);
    put(19, 19, SUN.ink);
  } else if (f.mouth === "open") {
    for (let x = 15; x <= 19; x++) for (let y = 19; y <= 21; y++) put(x, y, SUN.ink);
    for (let x = 16; x <= 18; x++) put(x, 21, SUN.tongue);
  } else if (f.mouth === "tongue") {
    for (let x = 14; x <= 20; x++) put(x, 19, SUN.ink);
    for (let x = 15; x <= 19; x++) for (let y = 20; y <= 24; y++) put(x, y, SUN.tongue);
    for (let y = 20; y <= 23; y++) put(17, y, SUN.tongue2);
    for (const [x, y] of [
      [14, 20],
      [14, 21],
      [14, 22],
      [14, 23],
      [20, 20],
      [20, 21],
      [20, 22],
      [20, 23],
      [15, 25],
      [16, 25],
      [17, 25],
      [18, 25],
      [19, 25],
      [14, 24],
      [20, 24],
    ])
      put(x, y, SUN.ink);
    put(16, 21, "#ff8da0");
  }
  // the rays: two blocks each, like the logo, stepping outward as they burst; they don't squiggle
  const rays = f.rays ?? 1;
  if (rays > 0) {
    const C = O + 17;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      const twinkle = f.pulse && k % 2 === 0 ? 1 : 0;
      for (const [i, col] of [
        [0, SUN.ray2],
        [1, SUN.ray1],
      ] as const) {
        const r = 15 + rays * (1.5 + i * 2.6) + twinkle;
        const bx = Math.round(C + Math.cos(a) * r - 1);
        const by = Math.round(C + Math.sin(a) * r - 1);
        g.fillStyle = col;
        g.fillRect(bx, by, 2, 2);
      }
    }
  }
  for (const [k, col] of px) {
    const [x, y] = k.split(",").map(Number);
    const dx = f.amp ? Math.round(Math.sin((f.wobble || 0) + y * 0.32) * f.amp) : 0;
    g.fillStyle = col;
    g.fillRect(O + x + dx, O + y, 1, 1);
  }
  return c;
}
