import type { CompanionInfo } from "@/lib/companions";

/**
 * The skyling engine (the cast, owner 2026-11-09; docs/design/companions/cast.md): every companion is drawn in code on
 * a 24 x 24 grid from its row in lib/companions.ts (one shape, one crown, one face), in four poses, by day and in its night
 * form. No image files and no state: a pose and a frame in, pixels out. Shown at whole multiples with
 * `image-rendering: pixelated`.
 */
export const GRID = 24;
export type Pose = "idle" | "walk" | "celebrate" | "sleep" | Activity;
/**
 * A skyling's little life (owner, 2026-11-11: "show some love and attention to the skylings"): it waves when you come,
 * stretches in the morning, reads through your class, sips coffee on your shift, thinks while it works on your answer and
 * looks surprised at a clash. Always from your real day, never random (skylings/activity.ts picks one).
 */
export type Activity = "wave" | "stretch" | "read" | "sip" | "think" | "surprised";
type Pixel = [x: number, y: number, col: string];

const INK = "#262320";
const MOON = { body: "#dde6f3", dark: "#9eb0cc", light: "#ffffff", pin: "#ffd77a" };
const BASE = 20;

/** Each row's inset from the body's left and right columns; the bottom row sits on row 20. */
const SHAPES: Record<CompanionInfo["look"]["shape"], { L: number; R: number; inset: number[] }> = {
  round: { L: 4, R: 19, inset: [5, 3, 2, 1, 1, 0, 0, 0, 0, 1, 1, 2, 3, 5] },
  tall: { L: 5, R: 18, inset: [5, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4] },
  pear: { L: 4, R: 19, inset: [6, 4, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 1, 3] },
  hood: { L: 4, R: 19, inset: [7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 1, 3] },
};

type Frame = {
  lift: number;
  feet: [number, number] | null;
  /** "wave" raises one arm with its hand high, "stretch" both, "mug" holds a mug, "book" a book, "chin" a hand to the chin */
  arms: number | "up" | "wave" | "stretch" | "mug" | "book" | "chin";
  eyes: "open" | "closed" | "happy" | "content" | "squeeze" | "focus" | "look" | "big";
  mouth?: "open" | "tiny" | "smile" | "line" | "o" | "yawn" | "hmm";
  /** brows: both raised (surprised) or the right one (thinking) */
  brows?: "up" | "one";
  crouch?: boolean;
  air?: boolean;
  sparkle?: boolean;
  zzz?: number;
  /** a book held in front (the frame turns a page) */
  book?: number;
  /** a cup by the face (the frame moves the steam) */
  cup?: number;
  /** "..." above the head, this many dots */
  dots?: number;
  /** a "!" above the head */
  bang?: boolean;
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
  wave: [
    { lift: 0, feet: [0, 0], arms: "wave", eyes: "happy", mouth: "open" },
    { lift: -1, feet: [0, 0], arms: "wave", eyes: "happy", mouth: "open" },
  ],
  stretch: [
    { lift: -1, feet: [0, 0], arms: "stretch", eyes: "squeeze", mouth: "yawn" },
    { lift: 0, feet: [0, 0], arms: "stretch", eyes: "content", mouth: "smile" },
  ],
  read: [
    { lift: 0, feet: [0, 0], arms: "book", eyes: "focus", book: 0 },
    { lift: 0, feet: [0, 0], arms: "book", eyes: "focus", book: 1 },
  ],
  sip: [
    { lift: 0, feet: [0, 0], arms: "mug", eyes: "open", mouth: "tiny", cup: 0 },
    { lift: 0, feet: [0, 0], arms: "mug", eyes: "content", mouth: "smile", cup: 1 },
  ],
  think: [
    { lift: 0, feet: [0, 0], arms: 0, eyes: "look", mouth: "hmm", brows: "one", dots: 1 },
    { lift: 0, feet: [0, 0], arms: 0, eyes: "look", mouth: "hmm", brows: "one", dots: 2 },
    { lift: 0, feet: [0, 0], arms: 0, eyes: "look", mouth: "hmm", brows: "one", dots: 3 },
  ],
  surprised: [
    { lift: -2, feet: [0, 0], arms: "up", eyes: "big", mouth: "o", brows: "up", bang: true },
    { lift: 0, feet: [0, 0], arms: 0, eyes: "big", mouth: "o", brows: "up", bang: true },
  ],
};

function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

type Form = CompanionInfo["look"] & { key: CompanionInfo["key"]; pin: boolean; squint: boolean };
/** By day a skyling's own colours; at night washed in moonlight with a gold crescent pin. Star is the other way round. */
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

/** The pixels of a skyling in a pose at a frame (frames wrap), by day or at night. */
export function pixels(info: CompanionInfo, pose: Pose, frame: number, night: boolean, glow = false): Pixel[] {
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
    // Goldie's scarf
    const i = S.inset[9];
    for (let x = S.L + i + 1; x <= S.R - i - 1; x++) put(x, t + 9, c.band);
    put(S.L + S.inset[10] + 1, t + 10, c.band);
    put(S.L + S.inset[11] + 1, t + 11, c.band);
  }
  put(S.L + S.inset[1] + 1, t + 1, c.light);
  put(S.L + S.inset[1] + 2, t + 1, c.light);
  put(S.L + S.inset[2] + 1, t + 2, c.light);
  if (c.key === "dawn" && !c.pin) for (let r = 2; r <= 8; r++) put(S.R - S.inset[r] - 1, t + r, c.trim2);
  // the moon's craters
  // the moon: its night side in deep blue down the right (a phase, so it reads as the moon at a glance), craters on the lit side
  if (c.key === "moon") {
    const K = [0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 0];
    for (let r = 1; r < H - 1; r++) {
      const right = S.R - S.inset[r] - 1;
      for (let k = 0; k < K[r]; k++)
        if (inside(right - k + 1, t + r) && inside(right - k, t + r + 1)) put(right - k, t + r, k === K[r] - 1 ? "#9fb0cf" : "#33497c");
    }
    for (const [x, y] of [
      [7, t + 2],
      [8, t + 2],
      [7, t + 3],
      [12, t + 2],
      [10, t + 10],
      [11, t + 10],
      [6, t + 9],
    ] as const)
      put(x, y, c.trim);
  }
  // Star in its first hour after sunset still wears the last of it low on its body (Dusk turning into Star)
  if (glow) {
    const interior = (x: number, y: number) => inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1);
    for (const [r, col] of [
      [H - 4, "#ffc08a"],
      [H - 3, "#ff9a6b"],
      [H - 2, "#f07a6a"],
    ] as const)
      for (let x = S.L; x <= S.R; x++) if (interior(x, t + r)) put(x, t + r, col);
  }
  if (c.key === "star" && !c.squint) {
    put(9, t + 9, c.trim2);
    put(12, t + 11, c.trim2);
    put(15, t + 8, c.trim2);
    put(7, t + 11, c.trim);
  }

  // the face
  const ey = t + 5;
  const eyes = f.eyes === "closed" || (c.squint && f.eyes === "open") ? "closed" : f.eyes;
  for (const x of [8, 13]) {
    const left = x === 8;
    if (eyes === "content") {
      // closed and pleased: a little "u"
      put(x, ey, INK);
      put(x + 1, ey + 1, INK);
      put(x + 2, ey, INK);
    } else if (eyes === "squeeze") {
      // a big yawn's squeezed eyes: > <
      put(left ? x : x + 1, ey - 1, INK);
      put(left ? x + 1 : x, ey, INK);
      put(left ? x : x + 1, ey + 1, INK);
    } else if (eyes === "focus") {
      // reading: lids low, eyes on the page
      put(x, ey, INK);
      put(x + 1, ey, INK);
      put(x, ey + 1, c.eye);
      put(x + 1, ey + 1, c.eye);
    } else if (eyes === "look") {
      // thinking: eyes up and to the side
      put(x + 1, ey - 1, c.eye);
      put(x + 1, ey, c.eye);
      put(x, ey - 1, c.eye);
    } else if (eyes === "big") {
      // surprised: tall round eyes with a shine
      put(x, ey - 1, c.eye);
      put(x + 1, ey - 1, "#ffffff");
      put(x, ey, c.eye);
      put(x + 1, ey, c.eye);
      put(x, ey + 1, c.eye);
      put(x + 1, ey + 1, c.eye);
    } else if (eyes === "happy") {
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
  if (f.brows === "up")
    for (const x of [8, 13]) {
      put(x, ey - 3, INK);
      put(x + 1, ey - 3, INK);
    }
  if (f.brows === "one") {
    put(13, ey - 3, INK);
    put(14, ey - 3, INK);
    put(8, ey - 2, INK);
    put(9, ey - 2, INK);
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
    yawn: [
      [11, ey + 2, INK],
      [12, ey + 2, INK],
      [10, ey + 3, INK],
      [11, ey + 3, "#7a2a2a"],
      [12, ey + 3, "#7a2a2a"],
      [13, ey + 3, INK],
      [10, ey + 4, INK],
      [11, ey + 4, "#e07a7a"],
      [12, ey + 4, "#e07a7a"],
      [13, ey + 4, INK],
      [11, ey + 5, INK],
      [12, ey + 5, INK],
    ],
    hmm: [
      [10, ey + 4, INK],
      [11, ey + 4, INK],
      [12, ey + 3, INK],
      [13, ey + 3, INK],
    ],
    o: [
      [11, ey + 3, INK],
      [12, ey + 3, INK],
      [10, ey + 4, INK],
      [13, ey + 4, INK],
      [11, ey + 4, "#e07a7a"],
      [12, ey + 4, "#e07a7a"],
      [11, ey + 5, INK],
      [12, ey + 5, INK],
    ],
    open: [
      [11, ey + 3, INK],
      [12, ey + 3, INK],
      [11, ey + 4, "#e07a7a"],
      [12, ey + 4, "#e07a7a"],
    ],
  };
  if (f.book == null) for (const [x, y, col] of mouths[f.mouth ?? c.mouth]) put(x, y, col);
  if (eyes !== "closed" || pose === "idle") {
    const i = S.inset[7];
    put(S.L + i + 2, t + 7, c.cheek);
    if (c.key !== "moon") put(S.R - i - 2, t + 7, c.cheek);
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
  } else if (typeof f.arms === "string") {
    // the arms that aren't at the sides: one or both up high, or holding something in front
    const mitten = (mx: number, my: number) => {
      for (let y = my; y <= my + 1; y++) for (let x = mx; x <= mx + 1; x++) put(x, y, c.body);
      for (const [x, y] of [
        [mx, my - 1],
        [mx + 1, my - 1],
        [mx - 1, my],
        [mx + 2, my],
        [mx - 1, my + 1],
        [mx + 2, my + 1],
        [mx, my + 2],
        [mx + 1, my + 2],
      ])
        put(x, y, INK);
    };
    const arm = (ax: number, from: number, to: number) => {
      for (let y = from; y <= to; y++) {
        put(ax, y, c.body);
        put(ax - 1, y, INK);
        put(ax + 1, y, INK);
      }
    };
    const xR = S.R - S.inset[3] + 1;
    const xL = S.L + S.inset[3] - 1;
    const side = (sideX: number, outer: number) => {
      for (const r of [7, 8]) {
        put(sideX, t + r, c.body);
        put(sideX + outer, t + r, INK);
      }
    };
    if (f.arms === "wave") {
      // the right arm up, a whole hand above the head, waving (it rocks with the frame)
      arm(xR, t - 1, t + 3);
      mitten(xR - 1 + (frame % 2), t - 4);
      put(xR + 3 - (frame % 2) * 6, t - 3, "#9fb6d8");
      put(xR + 3 - (frame % 2) * 6, t - 2, "#9fb6d8");
      side(S.L + S.inset[7] - 1, -1);
    } else if (f.arms === "stretch") {
      arm(xL, t - 2, t + 3);
      arm(xR, t - 2, t + 3);
      mitten(xL - 1, t - 5);
      mitten(xR - 1, t - 5);
    } else if (f.arms === "mug") {
      side(S.L + S.inset[7] - 1, -1);
      mitten(15, t + 8);
    } else if (f.arms === "chin") {
      // a hand to the chin, the other at its side
      mitten(8, ey + 4);
      side(S.R - S.inset[7] + 1, 1);
    } else if (f.arms === "book") {
      mitten(1, ey + 4);
      mitten(21, ey + 4);
    }
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
  // an open book held up in front, only the eyes over it; a page turns
  if (f.book != null) {
    const by = ey + 2;
    const cover = "#3a64a8";
    for (let x = 3; x <= 20; x++) {
      const spine = x === 11 || x === 12;
      const edge = x === 3 || x === 20;
      if (!spine) put(x, by, INK);
      for (let r = 1; r <= 4; r++) put(x, by + r, edge || spine ? INK : "#fff8e7");
      put(x, by + 5, edge ? INK : cover);
    }
    for (const r of [2, 4]) for (const x of [5, 6, 7, 8, 9, 14, 15, 16, 17, 18]) if (r === 2 || x % 5) put(x, by + r, "#b9c6dc");
    // a page lifting at the corner, one side then the other
    const px = f.book ? 18 : 5;
    put(px, by + 1, "#ffffff");
    put(px + (f.book ? 1 : -0), by, "#ffffff");
  }
  // a mug of coffee in its hand, steam curling up
  if (f.cup != null) {
    const mx = 17;
    const my = t + 6;
    for (let x = mx; x <= mx + 4; x++) {
      put(x, my, INK);
      put(x, my + 6, INK);
    }
    for (let y = my + 1; y <= my + 5; y++) {
      put(mx, y, INK);
      put(mx + 4, y, INK);
      for (let x = mx + 1; x <= mx + 3; x++) put(x, y, y === my + 1 ? "#7a4a24" : y === my + 3 ? c.trim : "#ffffff");
    }
    put(mx + 5, my + 2, INK);
    put(mx + 6, my + 3, INK);
    put(mx + 6, my + 4, INK);
    put(mx + 5, my + 5, INK);
    const steam = "#e3ebf7";
    const s1 = f.cup ? 1 : 0;
    put(mx + 1 + s1, my - 1, steam);
    put(mx + 2 - s1, my - 2, steam);
    put(mx + 1 + s1, my - 3, steam);
    put(mx + 3 - s1, my - 2, steam);
    put(mx + 3 + s1, my - 4, steam);
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
    lowsun: [
      ...[9, 10, 13, 14].map((x): Pixel => [x, t - 3, T]),
      [11, t - 3, T2],
      [12, t - 3, T2],
      ...[8, 9, 11, 12, 14, 15].map((x): Pixel => [x, t - 2, T]),
      [10, t - 2, T2],
      [13, t - 2, T2],
      ...[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((x): Pixel => [x, t - 1, T]),
    ],
    // two little stars beside the moon
    sparkles: [
      [20, t - 1, "#ffffff"],
      [19, t - 1, c.light],
      [21, t - 1, c.light],
      [20, t - 2, c.light],
      [20, t, c.light],
      [22, t + 3, c.trim2],
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
  // a thought growing: one small bubble, then two, then a big one
  if (f.dots) {
    const bubble = (bx: number, by: number, n: number) => {
      for (let y = by; y < by + n; y++) for (let x = bx; x < bx + n; x++) put(x, y, "#ffffff");
      for (let i = 0; i < n; i++) {
        put(bx + i, by - 1, INK);
        put(bx + i, by + n, INK);
        put(bx - 1, by + i, INK);
        put(bx + n, by + i, INK);
      }
    };
    // beside the head, up and out to the right, inside the picture
    if (f.dots >= 1) bubble(18, t + 2, 1);
    if (f.dots >= 2) bubble(19, t - 1, 2);
    if (f.dots >= 3) bubble(20, t - 5, 3);
  }
  if (f.bang)
    // a "!" just off the head's right side
    for (const [x, y, col] of [
      [21, t - 2, "#f5a524"],
      [21, t - 1, "#f5a524"],
      [21, t, "#f5a524"],
      [21, t + 1, "#f5a524"],
      [21, t + 3, "#f5a524"],
      [22, t - 2, INK],
      [22, t - 1, INK],
      [22, t, INK],
      [22, t + 1, INK],
      [22, t + 3, INK],
      [21, t - 3, INK],
      [21, t + 2, INK],
      [21, t + 4, INK],
    ] as Pixel[])
      put(x, y, col);
  return out;
}

/** Each drawn frame is kept, so the wheel's 24 x 24 sprite is copied in one call instead of painted pixel by pixel. */
const painted = new Map<string, ImageData>();

/** Paint a skyling onto a 24 x 24 canvas (facing right; `flip` faces it left). */
/** `float`: no boots and no ground shadow, hanging in the sky like the real moon (Moon on Today's wheel at night). */
export function drawCompanion(
  canvas: HTMLCanvasElement,
  c: CompanionInfo,
  pose: Pose,
  frame: number,
  night: boolean,
  flip = false,
  glow = false,
  float = false,
) {
  const g = canvas.getContext("2d");
  if (!g) return;
  if (canvas.width !== GRID) canvas.width = canvas.height = GRID;
  const n = FRAMES[pose].length;
  const key = `${c.key}|${pose}|${((frame % n) + n) % n}|${night}|${flip}|${glow}|${float}`;
  const kept = painted.get(key);
  if (kept) return g.putImageData(kept, 0, 0);
  g.clearRect(0, 0, GRID, GRID);
  const px = pixels(c, pose, frame, night, glow).filter(([, y]) => !float || y < 21);
  if (c.key === "star" && night) {
    // Star is the night's own colour: on the night sky a pale moonlit rim keeps it from disappearing (LF Marketing,
    // 2026-11-10: with "Changes with the sky" it's in front of everyone every night)
    const filled = new Set(px.filter(([, y]) => y < 23).map(([x, y]) => `${x},${y}`));
    g.fillStyle = "#86a8de";
    for (const key of filled) {
      const [x, y] = key.split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= 23 || filled.has(`${nx},${ny}`)) continue;
        g.fillRect(flip ? GRID - 1 - nx : nx, ny, 1, 1);
      }
    }
  }
  for (const [x, y, col] of px) {
    g.fillStyle = col;
    g.fillRect(flip ? GRID - 1 - x : x, y, 1, 1);
  }
  painted.set(key, g.getImageData(0, 0, GRID, GRID));
}
