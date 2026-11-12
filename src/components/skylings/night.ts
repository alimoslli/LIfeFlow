import { GRID, pixels, type Pose } from "@/components/day-clock/companion";
import { companionOf, type CompanionKey, ownsNight } from "@/lib/companions";

/**
 * The skylings' night (owner, 2026-11-09: "all the characters ... together, interacting together in the sky at night"):
 * one pixel canvas, drawn small and scaled up crisp. Moon is the moon, big, and Star circles it lighting new stars, Ray
 * and Goldie toss a fallen star across the hill, Dawn naps on a cloud under a constellation drawing itself, and when a
 * shooting star crosses, everyone looks up and cheers. Tap the sky for a shooting star; tap a
 * skyling and it hops. The art comes from the same engine as Today's wheel (day-clock/companion.ts).
 * Real-sky colours only (no purple). Reduced motion gets one still frame.
 */

/** Where the cast stands, as fractions of the canvas: [x0, x1, y0, y1]. `wide` when the canvas is wider than tall. */
export type StageBox = { wide: [number, number, number, number]; narrow: [number, number, number, number] };
export type NightOptions = { box: StageBox; reduced: boolean; focus?: CompanionKey | null };
export type NightScene = { destroy(): void; cheer(): void; focus(k: CompanionKey | null): void };

/** The event every skyling on the page listens for to cheer: the nights, the sprites and the one on Today's sky. */
export const SKYLINGS_CHEER = "lf-skylings-cheer";
/** Ask every mounted skyling to cheer (a CTA hover, a finished step, a claimed star, a save from the bar). */
export const cheerSkylings = () => window.dispatchEvent(new Event(SKYLINGS_CHEER));

const SKY = ["#040a18", "#07132c", "#0b1d42", "#102c58", "#173f6e", "#245a86"];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MOON = { lit: "#fff3cf", rim: "#ffe7a6", crater: "#efdcaa", shade: "#203a63" };
const HILLS = {
  far: "#0a1a35",
  farRim: "#13294c",
  mid: "#0c2140",
  midRim: "#18345c",
  near: "#0f2849",
  nearRim: "#24497a",
  front: "#081a33",
  frontRim: "#163258",
};
const WINDOW = ["#ffd77a", "#ffbf5e", "#fff0b8"];
const HEART: [number, number][] = [
  [1, 0],
  [3, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [2, 3],
];

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far the big Moon's body reaches from its middle, in art pixels (its 24 px sprite drawn at twice the size). */
const BIG_R = 16;
/** How wide Star circles the Moon: wider on a wide canvas, always clear of the Moon. */
const orbitOf = (sw: number) => Math.round(Math.min(Math.max(sw * 0.22, BIG_R + 16), BIG_R + 26));
const bigMoons = new Map<string, HTMLCanvasElement>();
/** Moon as the moon in the sky: its sprite at twice the size, without boots or a shadow (it hangs there). */
function bigMoon(pose: Pose, frame: number) {
  const id = `${pose}|${frame}`;
  let c = bigMoons.get(id);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = GRID * 2;
  const g = c.getContext("2d")!;
  for (const [x, y, col] of pixels(companionOf("moon"), pose, frame, true)) {
    if (y >= 21) continue;
    g.fillStyle = col;
    g.fillRect(x * 2, y * 2, 2, 2);
  }
  bigMoons.set(id, c);
  return c;
}

const sprites = new Map<string, HTMLCanvasElement>();
/** A skyling as a 24 x 24 canvas, made once per look. Everyone wears their day colours on the night sky except Star, who is itself at night. */
function sprite(key: CompanionKey, pose: Pose, frame: number, flip: boolean) {
  const id = `${key}|${pose}|${frame}|${flip}`;
  let c = sprites.get(id);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = GRID;
  const g = c.getContext("2d")!;
  const px = pixels(companionOf(key), pose, frame, ownsNight(key)).filter(([, y]) => y !== 23); // no ground shadow in the sky
  if (key === "star") {
    // Star is the night's own colour, so the moon gives it a pale rim to stand out on the dark
    const filled = new Set(px.map(([x, y]) => `${x},${y}`));
    g.fillStyle = "#86a8de";
    for (const [x, y] of px)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (!filled.has(`${x + dx},${y + dy}`)) g.fillRect(flip ? GRID - 1 - (x + dx) : x + dx, y + dy, 1, 1);
  }
  for (const [x, y, col] of px) {
    g.fillStyle = col;
    g.fillRect(flip ? GRID - 1 - x : x, y, 1, 1);
  }
  sprites.set(id, c);
  return c;
}

type Actor = { key: CompanionKey; x: number; y: number; w: number; h: number };
type Shooter = { x: number; y: number; vx: number; vy: number; born: number };
type Lit = { x: number; y: number; born: number };
type Heart = { x: number; y: number; born: number };

export function mountNight(canvas: HTMLCanvasElement, opts: NightOptions): NightScene {
  const g = canvas.getContext("2d")!;
  const host = canvas.parentElement!;
  let W = 0;
  let H = 0;
  let P = 3;
  let sky: HTMLCanvasElement | null = null;
  let far: HTMLCanvasElement | null = null;
  let mid: HTMLCanvasElement | null = null;
  let near: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;
  let cloud: HTMLCanvasElement | null = null;
  let glow: HTMLCanvasElement | null = null;
  let twinkles: { x: number; y: number; p: number; s: number; big: boolean }[] = [];
  let windows: { x: number; y: number; c: string; p: number }[] = [];
  let L = {
    sx0: 0,
    sw: 0,
    sy0: 0,
    sh: 0,
    moon: { x: 0, y: 0, r: 0 },
    cloud: { x: 0, y: 0 },
    ray: 0,
    noon: 0,
    walk: [0, 0] as [number, number],
    frontY: 0,
    nearY: (x: number) => x * 0,
    stars: [] as [number, number][],
  };
  let focusKey: CompanionKey | null = opts.focus ?? null;

  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const shooters: Shooter[] = [];
  const lit: Lit[] = [];
  const hearts: Heart[] = [];
  const pokes = new Map<CompanionKey, number>();
  let wowUntil = -1;
  let nextShoot = 3.5;
  let nextLight = 2.2;
  let px = 0; // pointer parallax, -1..1
  let actors: Actor[] = [];

  function layout() {
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    if (!cw || !ch) return false;
    // one art pixel is 3 to 5 screen pixels, so the cast reads on a phone and fills a laptop
    P = clamp(Math.floor(Math.min(cw / 200, ch / 150)), ch < 260 ? 2 : 3, 5); // a short strip gets finer pixels, so the cast isn't crowded
    W = Math.ceil(cw / P);
    H = Math.ceil(ch / P);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * P}px`;
    canvas.style.height = `${H * P}px`;
    const [x0, x1, y0, y1] = cw > ch * 1.1 ? opts.box.wide : opts.box.narrow;
    const sx0 = Math.round(W * x0);
    const sw = Math.round(W * (x1 - x0));
    const sy0 = Math.round(H * y0);
    const sh = Math.round(H * (y1 - y0));
    const cx = sx0 + sw / 2;
    const groundBase = H - Math.max(10, Math.round(H * 0.1));
    const bump = Math.round(clamp(sh * 0.12, 6, 22));
    const nearY = (x: number) => Math.round(groundBase - bump * Math.exp(-(((x - cx) / (sw * 0.36)) ** 2)) - 2 * Math.sin(x / 23));
    const r = Math.round(clamp(Math.min(sw, sh) * 0.085, 9, 20));
    const d = Math.round(clamp(sw * 0.17, 28, 64));
    L = {
      sx0,
      sw,
      sy0,
      sh,
      // the big Moon with room for Star's circle inside the canvas on a narrow phone too
      moon: { x: Math.round(Math.min(sx0 + sw * 0.8, W - orbitOf(sw) - 13)), y: Math.round(Math.max(sy0 + 26 + r, orbitOf(sw) + 14)), r },
      // the cloud floats well clear of Ray and Goldie's heads, even on a short strip
      cloud: { x: Math.round(sx0 + sw * 0.06), y: Math.round(Math.max(sy0 + 20, Math.min(sy0 + sh * 0.42, groundBase - bump - 46))) },
      ray: Math.round(cx - d),
      noon: Math.round(cx + d),
      walk: [sx0 + 4, sx0 + sw - 28],
      frontY: H - 3,
      nearY,
      stars: [],
    };
    // Moon's constellation, above the cloud: a little heart of stars
    const ox = L.cloud.x + 12;
    const oy = Math.max(6, L.cloud.y - 34);
    L.stars = (
      [
        [0, 6],
        [6, 0],
        [13, 4],
        [20, 0],
        [26, 6],
        [13, 18],
      ] as [number, number][]
    ).map(([x, y]) => [ox + x, oy + y]);
    paint();
    return true;
  }

  /** Everything that doesn't move, made once per size. */
  function paint() {
    const rand = rng(20261109);
    // the sky: dithered bands like a pixel painting, the moon and its glow, the faint stars
    sky = document.createElement("canvas");
    sky.width = W + 8;
    sky.height = H;
    const sg = sky.getContext("2d")!;
    const img = sg.createImageData(W + 8, H);
    const d = img.data;
    const stops = SKY.map(hex);
    const n = stops.length - 1;
    for (let y = 0; y < H; y++) {
      const u = Math.min(1, y / (H * 0.94)) * n;
      const s = Math.min(n - 1, Math.floor(u));
      const f = clamp((u - s - 0.45) / 0.55, 0, 1);
      for (let x = 0; x < W + 8; x++) {
        const c = f > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? stops[s + 1] : stops[s];
        const i = (y * (W + 8) + x) * 4;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }
    const blend = (x: number, y: number, c: number[], a: number) => {
      if (x < 0 || y < 0 || x >= W + 8 || y >= H) return;
      const i = (y * (W + 8) + x) * 4;
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] + (c[k] - d[i + k]) * a);
    };
    // faint stars, more toward the top
    const count = Math.round((W * H) / 120);
    for (let k = 0; k < count; k++) {
      const x = Math.floor(rand() * (W + 8));
      const y = Math.floor(rand() ** 1.6 * H * 0.8);
      blend(x, y, hex(rand() < 0.2 ? "#ffe9b0" : "#cfe0ff"), 0.25 + rand() * 0.4);
    }
    // the moon's light on the sky (Moon, the skyling, is the moon itself: drawn big in front of it each frame)
    const m = L.moon;
    const lit = hex(MOON.lit);
    for (let y = m.y - BIG_R - 16; y <= m.y + BIG_R + 16; y++)
      for (let x = m.x - BIG_R - 16; x <= m.x + BIG_R + 16; x++) {
        const dist = Math.hypot(x - m.x, y - m.y);
        if (dist < BIG_R + 16) blend(x, y, lit, 0.24 * Math.min(1, (1 - dist / (BIG_R + 16)) * 1.6) ** 2);
      }
    sg.putImageData(img, 0, 0);

    // bright stars that twinkle (drawn each frame)
    twinkles = Array.from({ length: Math.round((W * H) / 900) + 8 }, () => ({
      x: Math.floor(rand() * W),
      y: Math.floor(rand() ** 1.4 * H * 0.7),
      p: rand() * 6.28,
      s: 0.8 + rand() * 2.2,
      big: rand() < 0.28,
    }));

    // three ridges: far, the town's, and the near hill the cast stands on, each with a moonlit rim
    const ridge = (fn: (x: number) => number, body: string, rim: string) => {
      const c = document.createElement("canvas");
      c.width = W + 8;
      c.height = H;
      const rg = c.getContext("2d")!;
      for (let x = 0; x < W + 8; x++) {
        const top = Math.round(fn(x - 4));
        rg.fillStyle = body;
        rg.fillRect(x, top, 1, H - top);
        rg.fillStyle = rim;
        rg.fillRect(x, top, 1, 1);
      }
      return c;
    };
    const base = H - Math.max(10, Math.round(H * 0.1));
    far = ridge((x) => base - H * 0.2 + 7 * Math.sin(x / 31) + 4 * Math.sin(x / 13 + 1), HILLS.far, HILLS.farRim);
    mid = ridge((x) => base - H * 0.1 + 5 * Math.sin(x / 41 + 2) + 2 * Math.sin(x / 9), HILLS.mid, HILLS.midRim);
    // the town on the middle ridge: a clock tower, a few houses, warm windows
    const mg = mid.getContext("2d")!;
    windows = [];
    const midY = (x: number) => Math.round(base - H * 0.1 + 5 * Math.sin(x / 41 + 2) + 2 * Math.sin(x / 9));
    const townX = L.sx0 + Math.round(L.sw * (W > H ? 0.46 : 0.5));
    const houses: [number, number, number][] = [
      [-30, 9, 8],
      [-19, 7, 11],
      [-9, 6, 27],
      [0, 11, 9],
      [14, 8, 13],
      [25, 10, 7],
    ];
    for (const [dx, w, h] of houses) {
      const x0 = townX + dx;
      const y0 = midY(x0) - h + 2;
      mg.fillStyle = HILLS.mid;
      mg.fillRect(x0 + 4, y0, w, h + 6);
      mg.fillStyle = HILLS.midRim;
      mg.fillRect(x0 + 4, y0, w, 1);
      if (h > 20) {
        // the clock tower: a pointed roof and a lit face
        for (let k = 0; k < 4; k++) {
          mg.fillStyle = HILLS.mid;
          mg.fillRect(x0 + 4 + k, y0 - 4 + k, w - 2 * k, 1);
        }
        windows.push({ x: x0 + 4 + Math.floor(w / 2) - 1, y: y0 + 3, c: "#fff0b8", p: -1 });
        windows.push({ x: x0 + 4 + Math.floor(w / 2), y: y0 + 3, c: "#fff0b8", p: -1 });
      }
      for (let wy = y0 + (h > 20 ? 8 : 3); wy < y0 + h - 2; wy += 4)
        for (let wx = x0 + 6; wx < x0 + 4 + w - 1; wx += 3) if (rand() < 0.6) windows.push({ x: wx, y: wy, c: WINDOW[Math.floor(rand() * 3)], p: rand() * 40 });
    }
    near = ridge((x) => L.nearY(x), HILLS.near, HILLS.nearRim);
    front = ridge((x) => L.frontY - 2 * Math.sin(x / 17) - (x % 29 === 0 ? 1 : 0), HILLS.front, HILLS.frontRim);

    // a night cloud for Dawn and Dusk, lit from above by the moon
    cloud = document.createElement("canvas");
    cloud.width = 56;
    cloud.height = 16;
    const cg = cloud.getContext("2d")!;
    const puffs: [number, number, number][] = [
      [10, 10, 6],
      [20, 7, 8],
      [32, 6, 9],
      [44, 9, 7],
      [27, 11, 8],
    ];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 56; x++) {
        const inside = puffs.some(([px2, py, pr]) => Math.hypot(x - px2, y - py) <= pr);
        if (!inside) continue;
        const above = puffs.some(([px2, py, pr]) => Math.hypot(x - px2, y - 1 - py) <= pr);
        const below = y > 11;
        cg.fillStyle = !above ? "#a9c2e6" : below ? "#36537f" : "#5878a8";
        cg.fillRect(x, y, 1, 1);
      }
    // the lantern's warm light
    glow = document.createElement("canvas");
    glow.width = glow.height = 25;
    const gg = glow.getContext("2d")!;
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < 25; x++) {
        const dist = Math.hypot(x - 12, y - 12);
        if (dist > 12) continue;
        const a = 0.34 * (1 - dist / 12) ** 1.5;
        if (a > (BAYER[(y & 3) * 4 + (x & 3)] / 16) * 0.3) {
          gg.fillStyle = `rgba(255,205,110,${a.toFixed(3)})`;
          gg.fillRect(x, y, 1, 1);
        }
      }
  }

  /** A pose for a skyling at time t: a hop when poked, everyone cheers at a shooting star. */
  function pose(key: CompanionKey, t: number, fallback: [Pose, number]): [Pose, number] {
    const poked = pokes.get(key);
    const cheering = t < wowUntil || (poked != null && t - poked < 0.9) || (focusKey === key && Math.floor(t / 2.4) % 2 === 0);
    if (cheering) {
      const since = t - (poked != null && t - poked < 0.9 ? poked : Math.max(0, wowUntil - 1.4));
      return ["celebrate", Math.min(3, Math.floor(since * 7)) === 3 ? 1 + (Math.floor(t * 6) % 3) : Math.min(3, Math.floor(since * 7))];
    }
    return fallback;
  }
  const blink = (t: number, phase: number): [Pose, number] => ["idle", (t + phase) % 3.4 < 0.14 ? 1 : 0];

  function put(key: CompanionKey, p: [Pose, number], x: number, y: number, flip = false) {
    g.drawImage(sprite(key, p[0], p[1], flip), Math.round(x), Math.round(y));
    actors.push({ key, x, y, w: GRID, h: GRID });
  }

  function dot(x: number, y: number, col: string, a = 1) {
    g.globalAlpha = a;
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    g.globalAlpha = 1;
  }

  function line(x0: number, y0: number, x1: number, y1: number, col: string, a: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i += 2) dot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col, a);
  }

  function frame() {
    if (!W) return;
    const t = now();
    actors = [];
    const sh = Math.round(px * 1);
    g.clearRect(0, 0, W, H);
    if (sky) g.drawImage(sky, -4 + sh, 0);

    // twinkling stars
    for (const s of twinkles) {
      const a = 0.45 + 0.55 * Math.sin(t * s.s + s.p);
      dot(s.x + sh, s.y, "#ffffff", clamp(a, 0.15, 1));
      if (s.big && a > 0.72)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          dot(s.x + sh + dx, s.y + dy, "#cfe0ff", (a - 0.6) * 1.6);
    }
    // stars Star has lit: a sparkle as they're born, then a steady twinkle
    for (let i = lit.length - 1; i >= 0; i--) {
      const s = lit[i];
      const age = t - s.born;
      if (age > 26) {
        lit.splice(i, 1);
        continue;
      }
      const a = age < 0.5 ? age * 2 : age > 24 ? (26 - age) / 2 : 0.7 + 0.3 * Math.sin(t * 2.4 + s.x);
      dot(s.x + sh, s.y, "#fff3c4", a);
      if (age < 0.7)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ] as const)
          dot(s.x + sh + dx, s.y + dy, "#ffd77a", 0.9 - age);
    }
    // Moon's constellation: drawn star by star, held, faded
    const cyc = (t % 13) / 13;
    if (cyc > 0.35) {
      const k = clamp((cyc - 0.35) / 0.15, 0, 1);
      const fade = cyc > 0.88 ? (1 - cyc) / 0.12 : 1;
      const pts = L.stars;
      const order = [0, 1, 2, 3, 4, 5, 0];
      const drawn = k * (order.length - 1);
      for (let i = 0; i < order.length - 1 && i < drawn; i++) {
        const [ax, ay] = pts[order[i]];
        const [bx, by] = pts[order[i + 1]];
        const part = clamp(drawn - i, 0, 1);
        line(ax + sh, ay, ax + (bx - ax) * part + sh, ay + (by - ay) * part, "#9fc0ec", 0.5 * fade);
      }
      for (const [x, y] of pts) {
        dot(x + sh, y, "#ffffff", fade);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          dot(x + sh + dx, y + dy, "#cfe0ff", 0.5 * fade);
      }
    }
    // shooting stars
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      const age = t - s.born;
      if (age > 1.1) {
        shooters.splice(i, 1);
        continue;
      }
      const hx = s.x + s.vx * age;
      const hy = s.y + s.vy * age;
      for (let k = 0; k < 18; k++) dot(hx - s.vx * 0.012 * k, hy - s.vy * 0.012 * k, k < 2 ? "#ffffff" : "#cfe0ff", (1 - k / 18) * (1 - age / 1.1));
    }

    if (far) g.drawImage(far, -4 + Math.round(px * 2), 0);
    if (mid) g.drawImage(mid, -4 + Math.round(px * 3), 0);
    // the town's windows, one going on or off now and then
    for (const w of windows) if (w.p < 0 || Math.sin(t * 0.21 + w.p) > -0.7) dot(w.x + Math.round(px * 3) - 4, w.y, w.c, 0.95);
    if (near) g.drawImage(near, -4 + Math.round(px * 4), 0);
    const nx = Math.round(px * 4);

    // Moon is the moon, big; Star circles it, smaller, lighting new stars with its antenna as it goes (owner, 2026-11-11)
    const m = L.moon;
    const lighting = t > nextLight - 0.5 && t < nextLight + 0.4;
    // over the top of the Moon and back, never across it (owner, 2026-11-11: "a bit crowded")
    const swing = 0.5 - 0.5 * Math.cos(t * 0.5);
    const over = Math.PI * (1 + swing);
    const ox = m.x + Math.cos(over) * orbitOf(L.sw) + sh;
    const oy = m.y + Math.sin(over) * orbitOf(L.sw);
    if (t > nextLight) {
      const a = Math.random() * 6.28;
      const dist = 6 + Math.random() * 18;
      lit.push({ x: Math.round(ox + Math.cos(a) * dist), y: Math.round(clamp(oy - 8 + Math.sin(a) * dist * 0.7, 3, m.y + 14)), born: t });
      nextLight = t + 3.2 + Math.random() * 2.4;
    }
    const starPose: [Pose, number] = lighting ? ["celebrate", 2] : pose("star", t, ["walk", Math.floor(t * 6) % 4]);
    const starFlip = Math.sin(t * 0.5) < 0;
    const mp = pose("moon", t, blink(t, 1.7));
    g.drawImage(bigMoon(mp[0], mp[1]), Math.round(m.x - 23 + sh), Math.round(m.y - 27));
    actors.push({ key: "moon", x: m.x - 23 + sh, y: m.y - 27, w: GRID * 2, h: GRID * 2 });
    put("star", starPose, ox - 11, oy - 14, starFlip);

    // Dawn naps on the cloud under the constellation (Moon turns into Dawn come morning)
    const cb = Math.round(Math.sin(t * 0.9) * 1.2);
    const cx0 = L.cloud.x + Math.round(px * 2);
    const cy0 = L.cloud.y + cb;
    put("dawn", pose("dawn", t, ["sleep", Math.floor(t * 1.1) % 2]), cx0 + 4, cy0 - 17);
    if (cloud) g.drawImage(cloud, cx0, cy0);

    // Ray and Goldie play catch with a fallen star over the hill
    const rayY = L.nearY(L.ray) - 21;
    const noonY = L.nearY(L.noon) - 21;
    const lap = 3.2;
    const phase = (t % (lap * 2)) / lap; // 0..2: Ray throws, Goldie throws
    const toNoon = phase < 1;
    const k = toNoon ? phase : phase - 1;
    const flying = k < 0.42;
    const fly = k / 0.42;
    const [ax, ay] = toNoon ? [L.ray + 18, rayY + 8] : [L.noon + 6, noonY + 8];
    const [bx, by] = toNoon ? [L.noon + 6, noonY + 8] : [L.ray + 18, rayY + 8];
    const arc = Math.max(18, Math.abs(bx - ax) * 0.5);
    const caught = (who: "ray" | "goldie"): [Pose, number] | null => {
      const catcher = toNoon ? "goldie" : "ray";
      if (who === catcher && !flying && k < 0.62) return ["celebrate", 1 + (Math.floor(t * 8) % 2)];
      if (who !== catcher && flying && fly < 0.25) return ["celebrate", 3];
      return null;
    };
    put("ray", pose("ray", t, caught("ray") ?? blink(t, 0.2)), L.ray + nx, rayY);
    put("goldie", pose("goldie", t, caught("goldie") ?? blink(t, 2.3)), L.noon + nx, noonY, true);
    if (flying) {
      const bxNow = ax + (bx - ax) * fly + nx;
      const byNow = ay + (by - ay) * fly - arc * 4 * fly * (1 - fly);
      for (let i = 1; i <= 5; i++) {
        const f2 = Math.max(0, fly - i * 0.035);
        dot(ax + (bx - ax) * f2 + nx, ay + (by - ay) * f2 - arc * 4 * f2 * (1 - f2), "#ffd77a", 0.5 - i * 0.09);
      }
      for (const [dx, dy, c] of [
        [0, 0, "#ffffff"],
        [1, 0, "#ffe08a"],
        [-1, 0, "#ffe08a"],
        [0, 1, "#ffe08a"],
        [0, -1, "#ffe08a"],
      ] as const)
        dot(bxNow + dx, byNow + dy, c);
    }

    if (front) g.drawImage(front, -4 + Math.round(px * 5), 0);
    // hearts from a poke
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      const age = t - h.born;
      if (age > 1) {
        hearts.splice(i, 1);
        continue;
      }
      for (const [dx, dy] of HEART) dot(h.x + dx, h.y - age * 14 + dy, "#ff8fa3", 1 - age);
    }

    // a shooting star now and then, and everyone looks up and cheers
    if (t > nextShoot) shoot(t);
  }

  function shoot(t: number, x?: number, y?: number) {
    const sx = x ?? W * (0.35 + Math.random() * 0.6);
    const sy = y ?? H * (0.04 + Math.random() * 0.18);
    shooters.push({ x: sx, y: sy, vx: -(60 + Math.random() * 40), vy: 30 + Math.random() * 18, born: t });
    wowUntil = t + 1.7;
    nextShoot = t + 9 + Math.random() * 7;
  }

  let raf = 0;
  let last = 0;
  let visible = true;
  const loop = (ms: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden || ms - last < 24) return;
    last = ms;
    frame();
  };

  const ro = new ResizeObserver(() => {
    if (layout()) frame();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);
  if (layout()) frame();
  if (!opts.reduced) raf = requestAnimationFrame(loop);

  const toArt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / P, (e.clientY - r.top) / P];
  };
  const onDown = (e: PointerEvent) => {
    if (opts.reduced) return;
    const [x, y] = toArt(e);
    const t = now();
    const hit = actors.find((a) => x >= a.x + 3 && x <= a.x + a.w - 3 && y >= a.y + 2 && y <= a.y + a.h);
    if (hit) {
      pokes.set(hit.key, t);
      hearts.push({ x: hit.x + 9, y: hit.y - 2, born: t });
    } else shoot(t, x + 20, Math.max(2, y - 14));
  };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    px = clamp(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -1, 1);
  };
  const onCheer = () => {
    if (!opts.reduced) wowUntil = now() + 1.5;
  };
  host.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("lf-skylings-cheer", onCheer);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("lf-skylings-cheer", onCheer);
    },
    cheer: onCheer,
    focus(k) {
      focusKey = k;
      if (opts.reduced) frame();
    },
  };
}
