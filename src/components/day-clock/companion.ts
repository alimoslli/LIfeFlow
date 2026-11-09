import type { CompanionInfo } from "@/lib/companions";

/**
 * The companion engine (the cast, owner 2026-11-09; docs/design/companions/cast.md): every companion is drawn in code on
 * a 24 x 24 grid from its row in lib/companions.ts (one shape, one crown, one face), in four poses, by day and in its night
 * form. No image files and no state: a pose and a frame in, pixels out. Shown at whole multiples with
 * `image-rendering: pixelated`.
 */
export const GRID = 24;
export type Pose = "idle" | "walk" | "celebrate" | "sleep";
type Pixel = [x: number, y: number, col: string];

const INK = "#262320";
const MOON = { body: "#dde6f3", dark: "#9eb0cc", light: "#ffffff", pin: "#ffd77a" };
const BASE = 20;

/** Each row's inset from the body's left and right columns; the bottom row sits on row 20. */
const SHAPES: Record<CompanionInfo["look"]["shape"], { L: number; R: number; inset: number[] }> = {
  round: { L: 4, R: 19, inset: [5, 3, 2, 1, 1, 0, 0, 0, 0, 1, 1, 2, 3, 5] },
  tall: { L: 5, R: 18, inset: [5, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4] },
  boxy: { L: 4, R: 19, inset: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2] },
  pear: { L: 4, R: 19, inset: [6, 4, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 1, 3] },
  drop: { L: 4, R: 19, inset: [7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 1, 3] },
  hood: { L: 4, R: 19, inset: [7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 1, 3] },
};

type Frame = {
  lift: number;
  feet: [number, number] | null;
  arms: number | "up";
  eyes: "open" | "closed" | "happy";
  mouth?: "open" | "tiny";
  crouch?: boolean;
  air?: boolean;
  sparkle?: boolean;
  zzz?: number;
};
/** idle 2 (the second a blink), walk 4, celebrate 4, sleep 2. */
export const FRAMES: Record<Pose, Frame[]> = {
  idle: [
    { lift: 0, feet: [0, 0], arms: 0, eyes: "open" },
    { lift: 0, feet: [0, 0], arms: 0, eyes: "closed" },
  ],
  walk: [
    { lift: 0, feet: [2, -2], arms: 1, eyes: "open" },
    { lift: -1, feet: [0, 0], arms: 0, eyes: "open" },
    { lift: 0, feet: [-2, 2], arms: -1, eyes: "open" },
    { lift: -1, feet: [0, 0], arms: 0, eyes: "open" },
  ],
  celebrate: [
    { lift: 1, feet: [0, 0], arms: 0, eyes: "open", crouch: true },
    { lift: -3, feet: [1, -1], arms: "up", eyes: "happy", mouth: "open", air: true },
    { lift: -3, feet: [1, -1], arms: "up", eyes: "happy", mouth: "open", air: true, sparkle: true },
    { lift: -1, feet: [0, 0], arms: 1, eyes: "happy", mouth: "open" },
  ],
  sleep: [
    { lift: 1, feet: null, arms: 0, eyes: "closed", mouth: "tiny", zzz: 0 },
    { lift: 1, feet: null, arms: 0, eyes: "closed", mouth: "tiny", zzz: 1 },
  ],
};

function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

type Form = CompanionInfo["look"] & { key: CompanionInfo["key"]; pin: boolean; squint: boolean };
/** By day a companion's own colours; at night washed in moonlight with a gold crescent pin. Star is the other way round. */
export function formOf(c: CompanionInfo, night: boolean): Form {
  const l = c.look;
  const moon = l.shy ? !night : night;
  if (!moon) return { ...l, key: c.key, pin: false, squint: false };
  return {
    ...l,
    key: c.key,
    body: mix(l.body, MOON.body, 0.72),
    dark: mix(l.dark, MOON.dark, 0.7),
    light: MOON.light,
    trim: mix(l.trim, "#ffe6a8", 0.55),
    trim2: mix(l.trim2, "#ffffff", 0.5),
    band: l.band ? mix(l.band, MOON.dark, 0.6) : undefined,
    cheek: mix(l.cheek, MOON.body, 0.5),
    eye: l.shy ? INK : l.eye,
    pin: !l.shy,
    squint: !!l.shy,
  };
}

/** The pixels of a companion in a pose at a frame (frames wrap), by day or at night. */
export function pixels(info: CompanionInfo, pose: Pose, frame: number, night: boolean): Pixel[] {
  const c = formOf(info, night);
  const list = FRAMES[pose];
  const f = list[((frame % list.length) + list.length) % list.length];
  const out: Pixel[] = [];
  const put = (x: number, y: number, col: string | undefined) => {
    if (col && x >= 0 && x < GRID && y >= 0 && y < GRID) out.push([x, y, col]);
  };
  const S = SHAPES[c.shape];
  const H = S.inset.length;
  const base = BASE + f.lift;
  const t = base - H + 1;
  const inside = (x: number, y: number) => {
    const r = y - t;
    if (r < 0 || r >= H) return false;
    return x >= S.L + S.inset[r] && x <= S.R - S.inset[r];
  };

  // a shadow on the ground, narrower in the air
  const sw = f.air ? 3 : 1;
  for (let x = S.L + 3 + sw; x <= S.R - 3 - sw; x++) put(x, 23, "rgba(20,30,50,0.22)");
  // two little boots, unless asleep
  if (f.feet) {
    const fy = f.air ? base + 1 : BASE + 1;
    const [dl, dr] = f.feet;
    for (const x of [8 + dl, 14 + dr])
      for (let i = 0; i < 2; i++) {
        put(x + i, fy, INK);
        put(x + i, fy + 1, INK);
      }
  }
  // the body: an ink edge, shaded low and down the right, a highlight top left
  for (let r = 0; r < H; r++) {
    const y = t + r;
    const i = S.inset[r];
    for (let x = S.L + i; x <= S.R - i; x++) {
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const col = r >= H - 3 || (r >= 3 && x === S.R - i - 1) ? c.dark : c.body;
      put(x, y, edge ? INK : col);
    }
  }
  if (c.band && !f.crouch) {
    // Goldie's scarf, Dusk's sunset stripe
    const rows = c.key === "goldie" ? [9] : [8, 9];
    for (const r of rows) {
      const i = S.inset[r];
      for (let x = S.L + i + 1; x <= S.R - i - 1; x++) put(x, t + r, c.key === "dusk" && r === 8 ? c.trim2 : c.band);
    }
    if (c.key === "goldie") {
      put(S.L + S.inset[10] + 1, t + 10, c.band);
      put(S.L + S.inset[11] + 1, t + 11, c.band);
    }
  }
  put(S.L + S.inset[1] + 1, t + 1, c.light);
  put(S.L + S.inset[1] + 2, t + 1, c.light);
  put(S.L + S.inset[2] + 1, t + 2, c.light);
  if (c.key === "dawn" && !c.pin) for (let r = 2; r <= 8; r++) put(S.R - S.inset[r] - 1, t + r, c.trim2);
  if (c.key === "star" && !c.squint) {
    put(9, t + 9, c.trim2);
    put(12, t + 11, c.trim2);
    put(15, t + 8, c.trim2);
    put(7, t + 11, c.trim);
  }

  // the face
  const ey = t + 5;
  const eyes = f.eyes === "closed" || (c.squint && f.eyes !== "happy") ? "closed" : f.eyes;
  for (const x of [8, 13]) {
    if (eyes === "happy") {
      put(x, ey + 1, INK);
      put(x + 1, ey, INK);
      put(x + 2, ey + 1, INK);
    } else if (eyes === "closed") {
      put(x, ey + 1, INK);
      put(x + 1, ey + 1, INK);
    } else if (c.eyes === "focused") {
      put(x, ey - 1, INK);
      put(x + 1, ey - 1, INK);
      put(x, ey + 1, c.eye);
      put(x + 1, ey + 1, c.eye);
    } else if (c.eyes === "lidded") {
      put(x, ey, c.dark);
      put(x + 1, ey, c.dark);
      put(x, ey + 1, c.eye);
      put(x + 1, ey + 1, c.eye);
    } else {
      put(x, ey, c.eye);
      put(x, ey + 1, c.eye);
      put(x + 1, ey + 1, c.eye);
      put(x + 1, ey, c.eyes === "glow" ? "#ffffff" : c.light);
    }
  }
  const mouths: Record<string, Pixel[]> = {
    smile: [
      [10, ey + 3, INK],
      [11, ey + 4, INK],
      [12, ey + 4, INK],
      [13, ey + 3, INK],
    ],
    grin: [
      [9, ey + 3, INK],
      [10, ey + 4, INK],
      [11, ey + 4, INK],
      [12, ey + 4, INK],
      [13, ey + 4, INK],
      [14, ey + 3, INK],
    ],
    line: [
      [11, ey + 3, INK],
      [12, ey + 3, INK],
    ],
    soft: [
      [11, ey + 4, INK],
      [12, ey + 4, INK],
    ],
    smirk: [
      [11, ey + 3, INK],
      [12, ey + 3, INK],
      [13, ey + 2, INK],
    ],
    tiny: [[12, ey + 3, INK]],
    open: [
      [11, ey + 3, INK],
      [12, ey + 3, INK],
      [11, ey + 4, "#e07a7a"],
      [12, ey + 4, "#e07a7a"],
    ],
  };
  for (const [x, y, col] of mouths[f.mouth ?? c.mouth]) put(x, y, col);
  if (eyes !== "closed" || pose === "idle") {
    const i = S.inset[7];
    put(S.L + i + 2, t + 7, c.cheek);
    put(S.R - i - 2, t + 7, c.cheek);
  }

  // little mittens, swinging as it walks, up when it cheers
  if (f.arms === "up") {
    for (const r of [1, 2]) {
      const i = S.inset[r];
      put(S.L + i - 1, t + r, c.body);
      put(S.L + i - 2, t + r, INK);
      put(S.R - i + 1, t + r, c.body);
      put(S.R - i + 2, t + r, INK);
    }
    put(S.L + S.inset[1] - 2, t, INK);
    put(S.R - S.inset[1] + 2, t, INK);
  } else {
    const d = f.arms === 1 ? -1 : f.arms === -1 ? 1 : 0;
    for (const r of [7, 8]) {
      const i = S.inset[r];
      put(S.L + i - 1, t + r + d, c.body);
      put(S.L + i - 2, t + r + d, INK);
      put(S.R - i + 1, t + r - d, c.body);
      put(S.R - i + 2, t + r - d, INK);
    }
  }

  // what sits above each head
  const [T, T2] = [c.trim, c.trim2];
  const crowns: Record<CompanionInfo["look"]["crown"], Pixel[]> = {
    wisp: [...[7, 8, 9, 10, 11, 12].map((x): Pixel => [x, t - 1, T]), ...[8, 9, 10].map((x): Pixel => [x, t - 2, T])],
    rays: [
      [11, t - 2, T],
      [12, t - 2, T],
      [11, t - 3, T2],
      [12, t - 3, T2],
      [7, t - 2, T],
      [6, t - 3, T2],
      [16, t - 2, T],
      [17, t - 3, T2],
      [3, t + 2, T],
      [2, t + 2, T2],
      [20, t + 2, T],
      [21, t + 2, T2],
    ],
    halo: [...[9, 10, 13, 14].map((x): Pixel => [x, t - 3, T]), [11, t - 3, T2], [12, t - 3, T2], ...[7, 8, 15, 16].map((x): Pixel => [x, t - 2, T])],
    lowsun: [
      ...[9, 10, 13, 14].map((x): Pixel => [x, t - 3, T]),
      [11, t - 3, T2],
      [12, t - 3, T2],
      ...[8, 9, 11, 12, 14, 15].map((x): Pixel => [x, t - 2, T]),
      [10, t - 2, T2],
      [13, t - 2, T2],
      ...[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((x): Pixel => [x, t - 1, T]),
    ],
    firststar: [
      [17, t - 3, "#ffffff"],
      [16, t - 3, c.light],
      [18, t - 3, c.light],
      [17, t - 4, c.light],
      [17, t - 2, c.light],
    ],
    antenna: [
      [12, t - 1, INK],
      [12, t - 2, T],
      [11, t - 3, T],
      [13, t - 3, T],
      [12, t - 3, T2],
      [12, t - 4, T],
    ],
  };
  for (const [x, y, col] of crowns[c.crown]) put(x, y, col);
  // the night pin: a little gold crescent by the head
  if (c.pin)
    for (const [x, y, col] of [
      [4, t - 1, MOON.pin],
      [3, t, MOON.pin],
      [3, t + 1, MOON.pin],
      [4, t + 2, MOON.pin],
      [5, t - 1, "#fff3c4"],
    ] as Pixel[])
      put(x, y, col);

  if (f.sparkle)
    for (const [x, y, col] of [
      [2, t - 1, T2],
      [21, t - 2, T2],
      [1, t + 5, "#ffffff"],
      [22, t + 6, T],
      [20, t - 4, "#ffffff"],
      [19, t - 4, T2],
      [21, t - 4, T2],
      [20, t - 5, T2],
      [20, t - 3, T2],
    ] as Pixel[])
      put(x, y, col);
  if (f.zzz != null) {
    const z = "#9fb6d8";
    const zy = t - 4 - f.zzz;
    for (const x of [17, 18, 19]) {
      put(x, zy, z);
      put(x, zy + 2, z);
    }
    put(18, zy + 1, z);
    if (f.zzz) {
      put(21, zy - 3, z);
      put(22, zy - 3, z);
      put(22, zy - 2, z);
    }
  }
  return out;
}

/** Paint a companion onto a 24 x 24 canvas (facing right; `flip` faces it left). */
export function drawCompanion(canvas: HTMLCanvasElement, c: CompanionInfo, pose: Pose, frame: number, night: boolean, flip = false) {
  const g = canvas.getContext("2d");
  if (!g) return;
  if (canvas.width !== GRID) canvas.width = canvas.height = GRID;
  g.clearRect(0, 0, GRID, GRID);
  for (const [x, y, col] of pixels(c, pose, frame, night)) {
    g.fillStyle = col;
    g.fillRect(flip ? GRID - 1 - x : x, y, 1, 1);
  }
}
