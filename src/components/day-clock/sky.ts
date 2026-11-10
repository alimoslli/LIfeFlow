/**
 * Today as the sky and "the mechanism" (owner, 2026-11-09: the wheel that turns into the timeline).
 *
 * Closed: the timeline's own window holds the real sky at the time on top of a wheel. One turn of the wheel is one day,
 * so the half above the horizon shows six hours behind and six ahead. The skyling runs in place on top; your things
 * ride the rim as tiles and roll back under it as the day goes by, rising on the right and setting on the left. Under the
 * horizon is the water (the same as the line's), with "Sun sets in about 2h 20m", or "Back to now" while it's turned away.
 * Under the window, in words: what's on at the time on top.
 *
 * Opening: the window stays where it is; the rim pours, like liquid, into its place on the line (a hill for every day, a
 * valley for every night) while the rest of the line runs out of its two ends, the tiles fly to their stops, and the one
 * sky spreads into the sky of every hour. The engine (engine.ts) owns the line, the gestures and the time on top, and
 * paints the window with `paintStrip`, so the two meet exactly as the motion lands.
 *
 * Drawing only; no app state but the skyling's step and which way it last ran. Reduced motion gets a calm crossfade.
 */
import { isExam, pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { css, darkness, mix, skyAt, type RGB } from "@/lib/sky";
import { companionOf, skylingAt, SKY_CHOICE, type CompanionKey } from "@/lib/companions";
import { drawCompanion, FRAMES, type Pose } from "./companion";
import { createVisitors, type VisitorKind } from "./visitors";
import { iconSvgInto, pixelize } from "./pixel-icons";

export type SkyFace = { tag: string; text: string; stats: string[]; icon?: string };
/** A stop on the open line, in the root's coordinates with the line at its home scroll. */
export type SkyNode = { ids: string[]; t: number; x: number; y: number; icon: string };
/** Where the open timeline is, for the pour. Null until the engine has laid it out. */
export type SkyGeo = {
  /** The timeline's window and its horizon (root coordinates). */
  win: { x: number; y: number; w: number; h: number; r: number };
  hor: number;
  /** A moment's place on the open line, and the moment at a place, at the line's home scroll (root coordinates). */
  lineAt: (t: number) => [number, number];
  tAtX: (x: number) => number;
  /** The stops in view at the home scroll. */
  nodes: SkyNode[];
  /** Inside the week the line rises and falls with the days; outside it, it's flat. */
  inWeek: (t: number) => boolean;
};
export type SkyState = {
  p: number;
  now: number;
  /** The time on top of the wheel (minutes from the start of today): now while it follows. */
  view: number;
  data: ClockData;
  items: ClockItem[];
  face: SkyFace;
  geo: SkyGeo | null;
};

const NS = "http://www.w3.org/2000/svg";
const DAY = 1440;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const E = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
const mod = (m: number) => ((m % DAY) + DAY) % DAY;
const dayOf = (t: number) => Math.floor(t / DAY);
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Minutes from the top of the wheel to each end of its horizon (one turn is one day), and how flat it is. */
const SPAN = DAY / 4;
const HF = 0.78;
/**
 * The sky's mood for a day (owner, 2026-11-09: "add clouds, but not in all the settings, sometimes"; "sometimes we will
 * add rain"; "a Christmas mode"). Decorative, never a forecast, and the same all day: most days clear, some with
 * clouds, now and then an overcast day with rain; in December a festive sky that snows some days (always on the 24th
 * and 25th), with lights along the horizon.
 */
export type Mood = { clouds: number; rain: boolean; snow: boolean; festive: boolean };
export function moodOf(date: string): Mood {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r1 = ((h >>> 0) % 1000) / 1000;
  const r2 = ((h >>> 11) % 1000) / 1000;
  const [month, day] = [Number(date.slice(5, 7)), Number(date.slice(8, 10))];
  const festive = month === 12 && day <= 26;
  const clouds = r1 < 0.42 ? 0 : r1 < 0.78 ? 0.5 : 1;
  return { clouds, rain: !festive && clouds === 1 && r2 < 0.4, snow: festive && (r2 < 0.55 || day === 24 || day === 25), festive };
}

/** The wheel's radius in a window this wide with this much sky above its horizon (the engine turns it by the same). */
export const wheelR = (w: number, room: number, max = 240) => Math.round(clamp(Math.min(w / 2 - 46, (room - 14) / HF - 40), 70, max));
/** A laptop's full sky is wide enough for two sides: the wheel on the left, and on the right what's now, next and the
 *  assistant, in words on the sky (owner, 2026-11-09: no boxes). The same width as the `today` container query in CSS. */
export const WIDE = 1000;
const WIDE_COL = 0.58;
function fmt(min: number) {
  const m = mod(Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const poly = (pts: number[][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
function el(tag: string, a: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(NS, tag);
  for (const k in a) e.setAttribute(k, String(a[k]));
  parent.appendChild(e);
  return e;
}
function txt(parent: Element, x: number, y: number, s: string, a: Record<string, string | number> = {}) {
  const e = el("text", { x: x.toFixed(1), y: y.toFixed(1), "text-anchor": "middle", ...a }, parent);
  e.textContent = s;
  return e;
}
/** A round-capped line through points. */
function stroke(parent: Element, pts: number[][], color: string, width: number, more: Record<string, string | number> = {}) {
  const a = { d: poly(pts), fill: "none", stroke: color, "stroke-width": width.toFixed(1), "stroke-linecap": "round", "stroke-linejoin": "round" };
  return el("path", { ...a, ...more }, parent);
}
function star(parent: Element, x: number, y: number, r: number, opacity = 1) {
  const q = r * 0.18;
  const d = `M${x} ${y - r}Q${x + q} ${y - q} ${x + r} ${y}Q${x + q} ${y + q} ${x} ${y + r}Q${x - q} ${y + q} ${x - r} ${y}Q${x - q} ${y - q} ${x} ${y - r}Z`;
  return el("path", { d, fill: "#ffd166", stroke: "#f2a93b", "stroke-width": 0.8, opacity: opacity.toFixed(3) }, parent);
}
/** Half a sun on the horizon with an arrow: rising or setting. */
function sunGlyph(p: Element, x: number, y: number, kind: "rise" | "set") {
  el("path", { d: `M${x - 5.5} ${y}A5.5 5.5 0 0 1 ${x + 5.5} ${y}Z`, fill: "#f5a524" }, p);
  el("rect", { x: x - 8, y: y - 0.8, width: 16, height: 1.6, rx: 0.8, fill: "#f5a524" }, p);
  const arrow = kind === "rise" ? `M${x - 2.6} ${y - 8.4}l2.6 -2.6l2.6 2.6` : `M${x - 2.6} ${y - 11}l2.6 2.6l2.6 -2.6`;
  el("path", { d: arrow, fill: "none", stroke: "#f5a524", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, p);
}

/** Each kind of thing has its colour on the sky: shifts amber, classes blue, deadlines red, the rest by where they came from. */
export function itemColor(it: Pick<ClockItem, "cat" | "origin">): string {
  if (it.cat === "work") return "#f59e0b";
  if (it.cat === "class") return "#2f80ed";
  if (it.cat === "due") return "#ef4444";
  if (it.origin === "reminder") return "#8fa3bf";
  if (it.origin === "goal" || it.origin === "money_goal") return "#22b866";
  if (it.origin === "milestone") return "#f06292";
  if (it.origin === "bill" || it.origin === "trial" || it.origin === "pay") return "#0f8f80";
  return "#06b0cc";
}
/** A to-do or an assignment still open after its time (or after its day, with no time): it's late, and sits at now. */
export const isLate = (it: ClockItem, now: number) =>
  (it.origin === "task" || it.origin === "assignment") && !it.done && !it.someday && (it.allDay ? dayOf(it.start) < dayOf(now) : (it.end ?? it.start) < now);
// Milestones and goals live on the timeline, not on Today's path; to-dos and assignments are done only when you say so.
const OFF_PATH = ["milestone", "goal", "money_goal"];
const STILL_TO_DO = ["task", "assignment", ...OFF_PATH];
/** Its time has passed and it isn't something still to do: it counts as done (a star). */
export const isFinished = (it: ClockItem, now: number) =>
  !!it.done || (!it.someday && !it.allDay && (it.end ?? it.start + 1) <= now && !STILL_TO_DO.includes(it.origin ?? ""));

/* ---------- the timeline's window (painted by the engine) ---------- */
export type StripOpts = {
  /** The x range to paint, the moment at an x and the x of a moment (all in the svg's own coordinates). */
  x0: number;
  x1: number;
  tAt: (x: number) => number;
  xOf: (t: number) => number;
  /** The line's y for a moment, and the window's sky top, horizon and water bottom. */
  yOf: (t: number) => number;
  top: number;
  hor: number;
  bottom: number;
  inWeek: (t: number) => boolean;
  now: number;
  rise: number;
  set: number;
  items: ClockItem[];
};
const FAR_TOP = hex("#355889");
const FAR_BOT = hex("#b9c9de");
const DEEP = hex("#06101f");
/** The sky above the line at a moment (top and horizon colours): the real sky in the week, a calm twilight beyond it. */
function stripSky(t: number, o: Pick<StripOpts, "inWeek" | "rise" | "set">): [RGB, RGB] {
  if (!o.inWeek(t)) return [FAR_TOP, FAR_BOT];
  const [a, , c] = skyAt(t, o.rise, o.set);
  return [a, c];
}
export const stripDark = (t: number, o: Pick<StripOpts, "inWeek" | "rise" | "set">) => (o.inWeek(t) ? darkness(t, o.rise, o.set) : 0.35);

/**
 * The window: each hour its own sky (averaged a little so dusk and dawn blend), the water under it reflecting it, stars
 * over the nights, a small sun where each day starts and a moon where it ends; then, in `.dc-strip-line` (which arrives
 * last as the window opens), the line itself, rising into a hill for every day and a valley for every night.
 */
export function paintStrip(g: Element, defs: Element, o: StripOpts) {
  const W = o.x1 - o.x0;
  const grad = (id: string, f: (t: number) => RGB) => {
    const gr = el("linearGradient", { id, x1: o.x0, y1: 0, x2: o.x1, y2: 0, gradientUnits: "userSpaceOnUse" }, defs);
    for (let x = o.x0; x <= o.x1 + 0.1; x += Math.max(6, W / 160)) {
      const c: RGB = [0, 0, 0];
      for (const dx of [-42, -21, 0, 21, 42]) f(o.tAt(x + dx)).forEach((v, i) => (c[i] += v / 5));
      el("stop", { offset: clamp((x - o.x0) / W, 0, 1).toFixed(4), "stop-color": css(c) }, gr);
    }
  };
  grad("dc-st-t", (t) => stripSky(t, o)[0]);
  grad("dc-st-b", (t) => stripSky(t, o)[1]);
  grad("dc-st-wt", (t) => mix(stripSky(t, o)[1], DEEP, 0.22));
  grad("dc-st-wb", (t) => mix(stripSky(t, o)[0], DEEP, 0.4));
  const fade = el("linearGradient", { id: "dc-st-v", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 }, fade);
  el("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 1 }, fade);
  // each band in two layers: one colour, and a second fading in toward its far edge (the water is the sky upside down)
  const band = (y: number, h: number, a: string, b: string, mask: string) => {
    const m = el("mask", { id: mask, maskUnits: "userSpaceOnUse", x: o.x0, y, width: W, height: h }, defs);
    el("rect", { x: o.x0, y, width: W, height: h, fill: "url(#dc-st-v)" }, m);
    el("rect", { x: o.x0, y, width: W, height: h, fill: `url(#${a})` }, g);
    el("rect", { x: o.x0, y, width: W, height: h, fill: `url(#${b})`, mask: `url(#${mask})` }, g);
  };
  band(o.top, o.hor - o.top, "dc-st-t", "dc-st-b", "dc-st-m1");
  band(o.hor, o.bottom - o.hor, "dc-st-wt", "dc-st-wb", "dc-st-m2");
  for (let d = dayOf(o.tAt(o.x0)) - 1; d <= dayOf(o.tAt(o.x1)) + 1; d++) {
    let s = (d + 5000) * 7919;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 12; i++) {
      const t = d * DAY + o.set + 50 + rnd() * (DAY - o.set + o.rise - 100);
      const [x, y, dk, r] = [o.xOf(t), o.top + 10 + rnd() * (o.hor - o.top - 26), stripDark(t, o), rnd() < 0.2 ? 1.3 : 0.8];
      if (x > o.x0 && x < o.x1 && dk > 0.5) el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r, fill: "#fff", opacity: (0.85 * dk).toFixed(2) }, g);
    }
    if (!o.inWeek(d * DAY + o.rise)) continue;
    const [xr, xs] = [o.xOf(d * DAY + o.rise), o.xOf(d * DAY + o.set)];
    if (xr > o.x0 - 10 && xr < o.x1 + 10) sunGlyph(g, xr, o.hor + 14, "rise");
    if (xs > o.x0 - 10 && xs < o.x1 + 10) el("path", { d: `M${xs + 2} ${o.hor + 7}a5 5 0 1 0 0 10a6.5 6.5 0 1 1 0 -10z`, fill: "#e6edf8" }, g);
  }
  for (let i = 0; i < 6; i++)
    for (let x = o.x0 - (o.x0 % 90) + ((i * 37) % 90); x < o.x1; x += 90 + i * 14) {
      const ripple = { x: x.toFixed(1), y: (o.hor + 10 + i * i * 2.8).toFixed(1), width: 24 + ((i * 47) % 30), height: 1.2, rx: 0.6 };
      el("rect", { ...ripple, fill: "#fff", opacity: (0.07 + 0.025 * (6 - i)).toFixed(3) }, g);
    }
  el("rect", { x: o.x0, y: o.hor - 1, width: W, height: 2, fill: "#ffffff", opacity: 0.55 }, g);

  // the line: behind you it glows; ahead it's a dotted path, quieter at night; how long each thing takes along it
  const line = el("g", { class: "dc-strip-line" }, g);
  const pts: number[][] = [];
  for (let x = o.x0 - 4; x <= o.x1 + 4; x += 4) {
    const t = o.tAt(x);
    pts.push([o.xOf(t), o.yOf(t), t]);
  }
  const past = pts.filter((p) => p[2] <= o.now);
  if (past.length > 1) {
    stroke(line, past, "#ffd77a", 11, { "stroke-opacity": 0.4 });
    stroke(line, past, "#ffb648", 4.5);
  }
  const dark = (p: number[]) => stripDark(p[2], o) > 0.5;
  let run: number[][] = [];
  const flush = () => run.length > 1 && stroke(line, run, "#ffffff", 4, { "stroke-opacity": dark(run[0]) ? 0.6 : 0.95, "stroke-dasharray": "0.1 8.5" });
  for (const p of pts.filter((q) => q[2] >= o.now)) {
    run.push(p);
    if (dark(p) !== dark(run[0])) {
      flush();
      run = [p];
    }
  }
  flush();
  for (const it of o.items) {
    const end = it.end;
    if (end == null || it.allDay || it.someday) continue;
    const span = pts.filter((p) => p[2] >= it.start && p[2] <= end);
    if (span.length > 1) stroke(line, span, itemColor(it), 7, { "stroke-opacity": end <= o.now ? 0.5 : 0.95 });
  }
}

/* ---------- Today (closed) and the pour ---------- */
/** A tile on Today's path; the rest of a pile point at the tile that leads it (`of`). */
/** `late`: the pile holds something late, so it keeps the red edge even when what leads it isn't. */
type Tile = { it: ClockItem; x: number; y: number; w: number; h: number; ax: number; ay: number; lane: number; count: number; of?: Tile; late?: boolean };
const overlaps = (a: Tile, x: number, y: number, w: number, h: number) => Math.abs(a.x - x) < (a.w + w) / 2 + 6 && Math.abs(a.y - y) < (a.h + h) / 2 + 6;

export function createSky(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  const bgQ = root.querySelector<HTMLElement>("[data-dc=skybg]");
  const wordsQ = root.querySelector<HTMLElement>("[data-dc=words]");
  if (!svgQ || !whoQ || !bgQ || !wordsQ) return { draw: () => {}, visit: () => {}, cheer: () => {}, destroy: () => {} };
  const [svg, who, bg, words]: [SVGSVGElement, HTMLCanvasElement, HTMLElement, HTMLElement] = [svgQ, whoQ, bgQ, wordsQ];
  const stars = bg.querySelector<SVGSVGElement>("[data-dc=stars]");
  const clouds = [...bg.querySelectorAll<HTMLElement>("[data-dc=cloud]")];
  // the day's mood: up to six clouds (the skeleton has two), rain and snow layers, built once
  for (const [l, t, w, hh] of [
    [30, 20, 170, 50],
    [78, 28, 130, 40],
    [42, 44, 110, 34],
    [4, 14, 120, 38],
  ]) {
    const c = document.createElement("span");
    c.className = "dc-cloud dc-cloud-b";
    Object.assign(c.style, { left: `${l}%`, top: `${t}%`, width: `${w}px`, height: `${hh}px`, opacity: "0" });
    bg.appendChild(c);
    clouds.push(c);
  }
  const rain = document.createElement("i");
  rain.className = "dc-rain";
  const snow = document.createElement("i");
  snow.className = "dc-snow";
  bg.append(rain, snow);
  let mood: { date: string; m: Mood } | null = null;

  // what stays in the svg between frames: the liquid, a soft shadow, the sun's and the moon's glow, the warm spill
  const defs = el("defs", {}, svg);
  const goo = el("filter", { id: "dc-goo", x: "-10%", y: "-10%", width: "120%", height: "120%", "color-interpolation-filters": "sRGB" }, defs);
  const blur = el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: 0, result: "b" }, goo);
  el("feColorMatrix", { in: "b", mode: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10", result: "g" }, goo);
  el("feComposite", { in: "SourceGraphic", in2: "g", operator: "atop" }, goo);
  const shadow = el("filter", { id: "dc-sh", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
  el("feDropShadow", { dx: 0, dy: 2.5, stdDeviation: 2.6, "flood-color": "#0b1426", "flood-opacity": 0.22 }, shadow);
  const GLOWS = {
    "dc-glow-day": [
      [0, "#fff8dc", 0.95],
      [0.35, "#ffe2a0", 0.45],
      [1, "#ffd27a", 0],
    ],
    "dc-glow-night": [
      [0, "#eef4ff", 0.5],
      [0.45, "#a9c1ec", 0.16],
      [1, "#a9c1ec", 0],
    ],
  } as const;
  for (const [id, stops] of Object.entries(GLOWS)) {
    const gr = el("radialGradient", { id }, defs);
    for (const [o, c, a] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, gr);
  }
  const spill = el("linearGradient", { id: "dc-spill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  const spillStops = [el("stop", { offset: 0, "stop-opacity": 0.5 }, spill), el("stop", { offset: 1, "stop-opacity": 0 }, spill)];
  const layer = el("g", {}, svg);

  // the stars twinkle on their own (CSS), built once
  if (stars) {
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    // pixel stars: squares, and now and then a bright one with four points
    for (let i = 0; i < 80; i++) {
      const [x, y] = [`${(rnd() * 100).toFixed(2)}%`, `${(rnd() * 100).toFixed(2)}%`];
      const big = rnd() < 0.12;
      const g = el("svg", { x, y, overflow: "visible", style: `animation-delay:${(-rnd() * 3.2).toFixed(2)}s`, class: "dc-px-star" }, stars);
      if (big)
        for (const [dx, dy] of [
          [0, 0],
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
        ])
          el("rect", { x: dx - 1, y: dy - 1, width: 2, height: 2 }, g);
      else el("rect", { x: -1, y: -1, width: rnd() < 0.3 ? 2 : 1.5, height: rnd() < 0.3 ? 2 : 1.5 }, g);
    }
  }

  let last: SkyState | null = null;
  let sun: { key: string; rise: number; set: number } | null = null;
  let night = false;
  let pose: Pose = "idle";
  let step = 0;
  // a cheer (something done, a visitor) plays the celebrate frames over whatever it was doing
  let cheerFrom = 0;
  let cheerUntil = 0;
  let fit = "";
  let shownH = 0;
  let wordsFit = true;
  let lastTs = 0;
  let sizes: { W: number; H: number; foot: number } | null = null;
  let liftAt = { key: "", y: 0 };
  // which way the skyling runs (it turns round when the wheel goes back in time), and when it last stepped
  let lastView: number | null = null;
  let dir = 1;
  let stepAt = 0;
  const back = root.querySelector<HTMLElement>("[data-dc=back]");
  const html = document.documentElement;
  let wordsH = { key: "", h: 110 };
  // where the skyling stands in the sky (for the visitors), and the visitors themselves
  let whoAt: { x: number; y: number } | null = null;
  const visitors = reduce
    ? null
    : createVisitors({
        sky: bg,
        isNight: () => night,
        canVisit: () => !!last && last.p === 0 && root.dataset.state === "clock",
        companionAt: () => whoAt,
        // it notices: turns to look, and jumps (a craft gets a bigger jump)
        onSeen: (kind: VisitorKind, x: number) => {
          if (!whoAt) return;
          dir = x < whoAt.x ? -1 : 1;
          if (last) draw(last);
          cheer(kind === "craft" ? 1800 : 1200);
          who.animate(
            [
              { transform: "translateY(0)" },
              { transform: `translateY(${kind === "craft" ? -26 : -12}px)`, offset: 0.4 },
              { transform: "translateY(0)", offset: 0.75 },
              { transform: "translateY(-3px)", offset: 0.88 },
              { transform: "translateY(0)" },
            ],
            { duration: 560, iterations: kind === "craft" ? 3 : 1, composite: "add" },
          );
        },
      });
  // the app's text size (Settings), read once and again on resize, never per frame
  let remK = parseFloat(getComputedStyle(html).fontSize) / 16 || 1;

  // the skyling (the person's pick, in its night form after sunset) on the wheel, and standing on the open line
  // "Changes with the sky": whoever's moment it is at the time on show (turn Today to tonight and Star is there)
  let viewKey: CompanionKey = "ray";
  const paintWho = () => {
    const choice = root.dataset.companion;
    const c = companionOf(choice === SKY_CHOICE ? viewKey : choice);
    if (root.dataset.skylingNow !== c.key) root.dataset.skylingNow = c.key;
    const cheering = performance.now() < cheerUntil;
    for (const cv of [who, ...root.querySelectorAll<HTMLCanvasElement>(".dc-now-who")])
      drawCompanion(cv, c, cheering ? "celebrate" : pose, cheering ? Math.floor((performance.now() - cheerFrom) / 150) : step, night);
  };
  // it jogs in place (a frame about every 180 ms, never with reduced motion); asleep it breathes slowly; at rest it blinks
  let tick = 0;
  const timer = reduce
    ? 0
    : window.setInterval(() => {
        if (document.hidden) return;
        tick++;
        const cheering = performance.now() < cheerUntil;
        if (!cheering && pose === "sleep" && tick % 6) return;
        if (!cheering && pose === "idle") {
          // a blink every few seconds
          const blink = tick % 19 === 0;
          if (blink === (step % 2 === 1)) return;
          step = blink ? 1 : 0;
        } else if (!cheering) step++;
        paintWho();
      }, 180);
  /** Something was done, or a visitor came: the skyling cheers (arms up, a jump) for a moment. */
  const cheer = (ms = 1200) => {
    if (reduce) return;
    cheerFrom = performance.now();
    cheerUntil = cheerFrom + ms;
    paintWho();
  };

  const dayWord = (t: number, data: ClockData) => {
    const d = dayOf(t);
    return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === -1 ? "Yesterday" : (data.days.find((x) => x.offset === d)?.short ?? "");
  };

  /** Under the window, in words: now or next, then, today's numbers, what comes after; turned away, what was or will be. */
  function fillWords(st: SkyState, follow: boolean, rise: number, set: number, timed: ClockItem[]) {
    const { now, view, data, face } = st;
    const named = (it: ClockItem) => esc(isExam(it) ? it.title : (pileOf(timed.filter((x) => x.start === it.start)) ?? it.title));
    let out: string;
    if (follow) {
      const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
      const nx = timed.filter((it) => it.start > now && it !== cur && it.origin !== "milestone").sort((a, b) => a.start - b.start)[0];
      const done = timed.filter((it) => dayOf(it.start) === dayOf(now) && isFinished(it, now)).length;
      const pills: string[] = [];
      if (data.steps != null) pills.push(`👟 ${data.steps.toLocaleString("en-US")}`);
      if (data.sleepHours != null) pills.push(`😴 ${Math.floor(data.sleepHours)}h ${String(Math.round((data.sleepHours % 1) * 60)).padStart(2, "0")}m`);
      if (data.spentTodayCents != null) pills.push(`💳 $${(data.spentTodayCents / 100).toFixed(2).replace(/\.00$/, "")}`);
      if (done) pills.push(`⭐ ${done}`);
      // what comes after this half of the day: after sunset by day, after sunrise at night
      const m = mod(now);
      const edge = night ? now - m + (m < rise ? rise : DAY + rise) : now - m + set;
      const after: string[] = [];
      for (const it of timed.filter((x) => x.start >= edge && x.start < edge + 600).sort((a, b) => a.start - b.start)) {
        const say = `${it.icon} ${named(it)}`;
        if (after.length < 2 && !after.includes(say)) after.push(say);
      }
      const asleep = night && (m >= 23 * 60 || m < rise);
      out = [
        `<span class="dc-w-tag">${esc(asleep ? "Sleep" : face.tag)}</span>`,
        `<span class="dc-w-now">${asleep ? "🌙 Rest well" : `${face.icon ? `${esc(face.icon)} ` : ""}${esc(face.text)}`}</span>`,
        cur && nx ? `<span class="dc-w-then">Then ${nx.icon} ${named(nx)} · ${fmt(nx.start)}</span>` : "",
        !pills.length && face.stats[0] ? `<span class="dc-w-then">${esc(face.stats[0])}</span>` : "",
        pills.length ? `<span class="dc-w-pills">${pills.map((x) => `<span>${esc(x)}</span>`).join("")}</span>` : "",
        after.length ? `<span class="dc-w-after">${night ? "After sunrise" : "After sunset"} · ${after.join(" · ")}</span>` : "",
      ].join("");
    } else {
      const on = timed.find((it) => it.end != null && it.start <= view && it.end > view);
      const nx = timed.filter((it) => it.start > view && it.start < view + 720).sort((a, b) => a.start - b.start)[0];
      const when = `${dayWord(view, data)} · ${fmt(view)}`;
      out = [
        `<span class="dc-w-tag">${esc(when)}</span>`,
        on
          ? `<span class="dc-w-now">${on.icon} ${named(on)}</span><span class="dc-w-then">Till ${fmt(on.end ?? on.start)}</span>`
          : nx
            ? `<span class="dc-w-now">${nx.icon} ${named(nx)}</span><span class="dc-w-then">Next, ${dayWord(nx.start, data) === dayWord(view, data) ? "" : `${dayWord(nx.start, data)} `}${fmt(nx.start)}</span>`
            : `<span class="dc-w-now">Nothing planned</span>`,
      ].join("");
    }
    if (words.dataset.html !== out) {
      words.dataset.html = out;
      words.innerHTML = pixelize(out);
    }
  }

  function draw(st: SkyState) {
    last = st;
    // measured at rest and kept through the fold: reading the page's sizes mid-fold, after the frame has changed it,
    // makes the browser lay everything out again (the fold's lag, owner 2026-11-09)
    const folding = st.p > 0 && st.p < 1;
    if (!folding || !sizes) sizes = { W: root.clientWidth, H: root.clientHeight, foot: root.querySelector<HTMLElement>("[data-dc=foot]")?.offsetHeight ?? 0 };
    const { W, H } = sizes;
    const { now, view, data, geo } = st;
    if (!W || !H || !geo) return;
    if (!sun || sun.key !== data.today + data.tz) sun = { key: data.today + data.tz, ...sunTimes(data.today, data.tz) };
    const { rise, set } = sun;
    const follow = Math.abs(view - now) < 0.5;
    const vm = mod(view);
    night = !(vm >= rise && vm < set);
    const nextKey = skylingAt(vm, rise, set);
    if (nextKey !== viewKey) {
      // the next one hops in (a cheer is skipped under reduced motion)
      const swapped = root.dataset.companion === SKY_CHOICE && root.dataset.skylingNow != null;
      viewKey = nextKey;
      if (swapped) cheer(700);
    }
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    fillWords(st, follow, rise, set, timed);

    const P = clamp(st.p, 0, 1);
    const k = reduce ? 0 : E(seg(P, 0, 0.8)); // how far the rim has flowed into the line
    const kc = 1 - seg(P, 0, 0.35); // what belongs only to the wheel (its labels, beads, the water's words)
    const fade = reduce ? 1 - P : 1 - seg(P, 0.84, 0.97); // the whole wheel, handing over to the line as it lands
    // ---- closed, the sky is the whole top of the screen (full, the default) or the line's window (widget); either way
    // it ends up as the window. The words sit under it and the foot under them, so the horizon is placed to leave room.
    const full = root.dataset.mode !== "widget";
    // a laptop: the wheel on the left, the words and the foot on the right (CSS places their sides, this their height)
    const wide = full && W >= WIDE;
    if (wide !== (root.dataset.wide === "true")) root.dataset.wide = String(wide);
    // a very short phone (an iPhone SE): the wheel keeps the space and the skyling's line steps aside (the chat bar
    // docked under the sky is right there)
    const short = full && !wide && H < 420;
    if (short !== (root.dataset.short === "true")) root.dataset.short = String(short);
    const colL = wide ? Math.round(W * WIDE_COL) : W;
    const win = geo.win;
    const footEl = root.querySelector<HTMLElement>("[data-dc=foot]");
    const footH = sizes.foot ? sizes.foot + 12 : 0;
    if (wordsH.key !== `${words.dataset.html}|${W}`) wordsH = { key: `${words.dataset.html}|${W}`, h: words.offsetHeight || 110 };
    const hyC = full ? Math.round(wide ? H - 92 : clamp(H - footH - wordsH.h - 78, 200, Math.max(200, H * 0.62))) : geo.hor;
    const hy = lerp(hyC, geo.hor, k);
    const cx = wide ? Math.round(colL / 2 + 8) : W / 2;
    const R = wheelR(full ? colL - 20 : win.w, full ? hyC - 36 : hyC - win.y, wide ? 270 : 240);
    if (root.dataset.wheelR !== String(R)) root.dataset.wheelR = String(R);
    // the wheel's words grow with it (in rem, so the Text size setting still applies)
    const ts = Math.round(clamp(R / 138, 1, 1.5) * 100) / 100;
    if (ts !== lastTs) root.style.setProperty("--dc-scale", String((lastTs = ts)));
    // everything on the wheel grows with it (a laptop gets a bigger wheel, tiles and companion than a phone)
    const sc = clamp(R / 140, 1, 1.45);
    const h = { a: view - SPAN, b: view + SPAN };
    const angle = (t: number) => Math.PI / 2 - ((t - view) / DAY) * 2 * Math.PI;
    const wheelAt = (t: number, lift = 0): [number, number] => [cx + (R + lift) * Math.cos(angle(t)), hyC - (R + lift) * HF * Math.sin(angle(t))];
    // things rise on the right and set on the left: they fade in the last stretch above the horizon (until unrolled)
    const up = (t: number) => lerp(seg(Math.sin(angle(t)), 0.03, 0.24), 1, k);

    // ---- the window's sky: the real sky at the time on top, and the water under the horizon. It stays where it is and
    // hands over to the line's own sky (an hour's sky for every hour) as the line opens under it.
    if (mood?.date !== data.today) {
      mood = { date: data.today, m: moodOf(data.today) };
      // diagnostics (?debug=1&mood=clear|clouds|cloudy|rain|snow|festive): show a mood on any day
      const q = new URLSearchParams(window.location.search);
      const f = q.get("debug") === "1" ? q.get("mood") : null;
      if (f)
        mood.m = {
          clouds: f === "clear" ? 0 : f === "clouds" ? 0.5 : f === "snow" || f === "festive" ? 0.5 : 1,
          rain: f === "rain",
          snow: f === "snow",
          festive: f === "snow" || f === "festive",
        };
    }
    const md = mood.m;
    const dk = darkness(vm, rise, set);
    // an overcast day greys the sky a little by day (more when it rains)
    const oc = (md.clouds >= 1 ? (md.rain ? 0.42 : 0.2) : 0) * (1 - dk);
    const grey: RGB = [138, 150, 168];
    const [top, mid, bot] = skyAt(vm, rise, set).map((c, i) => mix(c, grey, oc * (i === 2 ? 0.5 : 1))) as [RGB, RGB, RGB];
    root.dataset.sky = dk > 0.5 ? "night" : "day";
    // full: from the very top (up behind the top bar on a phone) to the water's edge, which fades into the page
    // where Today starts on the page, measured once per size (not every frame)
    if (liftAt.key !== `${W}|${H}`) liftAt = { key: `${W}|${H}`, y: Math.max(0, root.getBoundingClientRect().top + window.scrollY) };
    const lift = full && W < 768 ? liftAt.y : 0;
    const box = full
      ? { l: lerp(0, win.x, k), r: lerp(0, win.x, k), t: lerp(-lift, win.y, k), b: lerp(hyC + 64, win.y + win.h, k), rad: lerp(lift ? 0 : 24, win.r, k) }
      : { l: win.x, r: win.x, t: win.y, b: win.y + win.h, rad: win.r };
    const hp = clamp(((hy - box.t) / (box.b - box.t)) * 100, 0, 100);
    Object.assign(bg.style, {
      left: `${box.l}px`,
      right: `${box.r}px`,
      top: `${box.t}px`,
      height: `${box.b - box.t}px`,
      borderRadius: full && !k ? `${box.rad}px ${box.rad}px 0 0` : `${box.rad}px`,
      boxShadow: full && k < 0.6 ? "none" : "",
      background: `linear-gradient(180deg, ${css(top)} 0%, ${css(mid)} ${(hp * 0.58).toFixed(2)}%, ${css(bot)} ${hp.toFixed(2)}%, ${css(mix(bot, DEEP, 0.22))} ${hp.toFixed(2)}%, ${css(mix(top, DEEP, 0.4), full ? k : 1)} 100%)`,
      opacity: String(reduce ? 1 - P : 1 - seg(P, 0.4, 0.85)),
    });
    // a dark sky behind the top bar turns its words light (full, on a phone, while the sky shows)
    const skyDark = 0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2] < 143;
    if (full && lift && P < 0.5) html.dataset.sky = skyDark ? "dark" : "light";
    else delete html.dataset.sky;
    if (full && P < 0.5) root.style.setProperty("--sky-ink", skyDark ? "#eef3fb" : "#0f1a2a");
    else root.style.removeProperty("--sky-ink");
    if (stars) stars.style.opacity = String(dk * (1 - seg(P, 0, 0.5)));
    // clouds as the day's mood has them (faint at night), rain and snow, all gone as the line opens
    const shown2 = Math.round(md.clouds * clouds.length);
    clouds.forEach((c, i) => (c.style.opacity = String(i < shown2 ? (1 - 0.7 * dk) * 0.85 * (1 - seg(P, 0, 0.4)) : 0)));
    rain.style.opacity = String(md.rain ? 0.6 * (1 - seg(P, 0, 0.4)) : 0);
    snow.style.opacity = String(md.snow ? 0.9 * (1 - seg(P, 0, 0.4)) : 0);

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.style.opacity = String(fade);
    layer.textContent = "";
    const morphing = !reduce && P > 0.02 && P < 0.98;
    blur.setAttribute("stdDeviation", (7 * Math.sin(Math.PI * P)).toFixed(2));
    for (const s2 of spillStops) s2.setAttribute("stop-color", css(bot));

    // ---- where a moment sits: on the wheel closed, on the line open; in between, the rim flows from one to the other
    // while the rest of the line pours out of its two ends and rises from the horizon
    const inHalf = (t: number) => t >= h.a && t <= h.b;
    const ends = [geo.lineAt(h.a)[0], geo.lineAt(h.b)[0]];
    const pour = (t: number) => {
      const xr = geo.lineAt(t)[0];
      const d = clamp((t < h.a ? ends[0] - xr : xr - ends[1]) / 380, 0, 1);
      return { kk: E(seg(P, 0.12 + 0.46 * d, 0.5 + 0.46 * d)), vis: P > 0.1 + 0.46 * d };
    };
    const at = (t: number): [number, number] | null => {
      if (inHalf(t)) {
        const [xc, yc] = wheelAt(t);
        if (!k) return [xc, yc];
        const [xr, yr] = geo.lineAt(t);
        return [lerp(xc, xr, k), lerp(yc, yr, k)];
      }
      const r = pour(t);
      if (!k || !r.vis) return null;
      const [xr, yr] = geo.lineAt(t);
      return [xr, lerp(hy, yr, r.kk)];
    };
    const tL = k ? Math.min(h.a, geo.tAtX(-30)) : h.a;
    const tR = k ? Math.max(h.b, geo.tAtX(W + 30)) : h.b;
    const samples: number[] = [h.a, h.b, now, view];
    for (let t = tL; t <= tR; t += Math.max(4, (tR - tL) / 260)) samples.push(t);
    const pts = samples.sort((a, b) => a - b).map((t) => [...(at(t) ?? [NaN, NaN]), t]);
    const runs = (from: number, to: number) => {
      const out: number[][][] = [[]];
      for (const q of pts) {
        if (!Number.isNaN(q[0]) && q[2] >= from && q[2] <= to && q[0] > -60 && q[0] < W + 60) out[out.length - 1].push(q);
        else if (out[out.length - 1].length) out.push([]);
      }
      return out.filter((r) => r.length > 1);
    };

    // the wheel's soft glow on the sky, the glow behind the skyling (placed once it's known where it stands), the
    // horizon and a few ripples on the water
    if (kc > 0)
      for (const r of runs(h.a, h.b)) {
        const d = `${poly(r)}L${r[r.length - 1][0].toFixed(1)} ${hy.toFixed(1)}L${r[0][0].toFixed(1)} ${hy.toFixed(1)}Z`;
        el("path", { d, fill: night ? "#1d3157" : "#ffffff", opacity: ((night ? 0.4 : 0.16) * kc).toFixed(3) }, layer);
      }
    const glowAt = el("g", {}, layer);
    el("rect", { x: box.l, y: (hy - 1).toFixed(1), width: W - box.l - box.r, height: 2, fill: "#ffffff", opacity: (0.6 * kc).toFixed(3) }, layer);
    // December: a string of lights along the horizon
    if (md.festive && kc > 0) {
      const lights = el("g", { opacity: kc.toFixed(3), class: "dc-lights" }, layer);
      const cols = ["#ff5a5a", "#ffd77a", "#5ad18a", "#7db3f2"];
      for (let x = box.l + 14, i = 0; x < W - box.r - 10; x += 22, i++)
        el(
          "circle",
          { cx: x.toFixed(1), cy: (hy - 4 + (i % 2) * 2).toFixed(1), r: 2.4, fill: cols[i % 4], style: `animation-delay:${(-(i % 7) * 0.31).toFixed(2)}s` },
          lights,
        );
    }
    for (let i = 0; i < 5 && kc > 0; i++)
      for (let x = box.l + 18 + ((i * 53) % 70); x < W - box.r - 40; x += 96 + i * 18)
        el(
          "rect",
          { x, y: hy + 10 + i * i * 3, width: 22 + ((i * 47) % 26), height: 1.2, rx: 0.6, fill: "#fff", opacity: ((0.08 + 0.02 * (5 - i)) * kc).toFixed(3) },
          layer,
        );

    // ---- the rim and your things on it, melted together while it moves: behind now it glows, ahead it's a dotted path
    const pathG = el("g", morphing ? { filter: "url(#dc-goo)" } : {}, layer);
    const boost = morphing ? 8 * Math.sin(Math.PI * P) : 0;
    for (const r of runs(now, Infinity))
      stroke(pathG, r, "#ffffff", 4 + boost, { "stroke-opacity": night ? 0.65 : 1, "stroke-dasharray": morphing ? "none" : "0.1 8.5" });
    for (const r of runs(-Infinity, now)) {
      stroke(pathG, r, night ? "#cfe0ff" : "#ffd77a", 12 + boost, { "stroke-opacity": 0.4 });
      stroke(pathG, r, night ? "#f2f6ff" : "#ffb648", 4.5 + boost);
    }
    // the hours still ahead, as small beads on the rim
    if (kc > 0)
      for (let t = Math.ceil(h.a / 60) * 60; t < h.b; t += 60) {
        const q = t > now ? at(t) : null;
        if (q) el("circle", { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 2.4, fill: "#ffffff", opacity: (kc * 0.9 * up(t)).toFixed(3) }, pathG);
      }
    for (const it of timed) {
      if (it.end == null || it.end < tL || it.start > tR) continue;
      for (const r of runs(it.start, it.end)) stroke(pathG, r, itemColor(it), lerp(10, 7, k) + boost, { "stroke-opacity": it.end <= now ? 0.5 : 0.95 });
    }

    // ---- inside the rim: a gold dot and "Sunset about 4:50 PM" at each sunrise and sunset, the day's name where
    // midnight turns over, and "Now" while the wheel is turned away. They read inward, away from the rim.
    const marks = el("g", { opacity: kc.toFixed(3) }, layer);
    const inward = (x: number) => (x > cx + 12 ? "end" : x < cx - 12 ? "start" : "middle");

    // ---- tiles: one per moment on the rim (a pile when several share it, what's on now leading), late things at now,
    // the next two with their time. A tile that would sit on another moves just inside; failing that, it piles up.
    const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
    const nextIt = cur ?? timed.filter((it) => it.start > now && it.origin !== "milestone").sort((a, b) => a.start - b.start)[0];
    const placeOf = (it: ClockItem) => (isLate(it, now) ? now : it.start);
    const weight = (it: ClockItem) => (it === nextIt ? 9 : it.end != null ? 5 : isExam(it) ? 4 : it.origin === "assignment" || it.origin === "task" ? 3 : 1);
    const onPath = timed.filter((x) => inHalf(x.start) && !isLate(x, now) && !OFF_PATH.includes(x.origin ?? ""));
    const groups = new Map<string, ClockItem[]>();
    for (const it of [...st.items.filter((x) => isLate(x, now) && inHalf(now)), ...onPath]) {
      const key = `${placeOf(it)}:${isLate(it, now)}`;
      groups.set(key, [...(groups.get(key) ?? []), it]);
    }
    const list = [...groups.values()].map((gp) => gp.sort((a, b) => weight(b) - weight(a))).sort((a, b) => placeOf(a[0]) - placeOf(b[0]));
    const withTime = new Set(
      list
        .filter((gp) => placeOf(gp[0]) > now && !(cur && gp.includes(cur)))
        .slice(0, 2)
        .map((gp) => gp[0]),
    );
    // the next two say when and what ("5 PM Work"), so the wheel reads at a glance (owner, 2026-11-10)
    const clip = (t: string) => (t.length > 14 ? `${t.slice(0, 13).trimEnd()}…` : t);
    const tag = (it: ClockItem) => `${fmt(it.start)} ${clip(it.title)}`;
    const tiles: Tile[] = [];
    const tileOf = new Map<string, Tile>();
    for (const gp of list) {
      const it = gp[0];
      const [px, py] = wheelAt(isLate(it, now) ? clamp(now + 1, h.a, h.b) : it.start);
      const th = (it === nextIt ? 38 : isFinished(it, now) ? 28 : 32) * sc;
      const tw = withTime.has(it) ? th + tag(it).length * 6.4 * sc + 12 : th;
      const len = Math.hypot(cx - px, hyC - py) || 1;
      let tile: Tile | undefined;
      for (const lane of [0, 1]) {
        const x = px + ((cx - px) / len) * lane * 40 * sc;
        const y = py + ((hyC - py) / len) * lane * 40 * sc;
        if (x - tw / 2 < box.l + 4 || x + tw / 2 > W - box.r - 4 || tiles.some((q) => overlaps(q, x, y, tw, th))) continue;
        tile = { it, x, y, w: tw, h: th, ax: px, ay: py, lane, count: gp.length - 1 };
        break;
      }
      const near = tile
        ? undefined
        : tiles.reduce<Tile | undefined>((b, q) => (!b || Math.hypot(q.x - px, q.y - py) < Math.hypot(b.x - px, b.y - py) ? q : b), undefined);
      if (near) {
        near.count += gp.length;
        // something late with no room of its own joins the pile at now, and the pile says it's late (it used to vanish)
        if (isLate(it, now)) near.late = true;
        if (it === nextIt) {
          tileOf.set(near.it.id, { ...near, of: near });
          near.it = it;
        }
      } else {
        tile = tile ?? { it, x: px, y: py, w: tw, h: th, ax: px, ay: py, lane: 0, count: gp.length - 1 };
        tiles.push(tile);
      }
      const lead = (tile ?? near) as Tile;
      for (const o of gp) tileOf.set(o.id, o === lead.it ? lead : { ...lead, it: o, of: lead });
    }
    // the marks inside the rim, drawn now that the tiles are placed: a mark a tile would cover moves further in, or
    // keeps quiet (the tile says the time)
    const fontPx = 10.56 * ts * remK;
    // at night the "N stars today" line sits in the middle of the wheel, so a mark keeps clear of it too
    const starsToday =
      night && follow && P < 1 ? timed.filter((it) => dayOf(it.start) === dayOf(now - (mod(now) < rise ? DAY : 0)) && isFinished(it, now)) : [];
    const keepClear: { x: number; y: number; w: number; h: number }[] = [...tiles];
    if (starsToday.length) keepClear.push({ x: cx, y: hyC - R * HF * 0.2 - fontPx * 0.4, w: fontPx * 9, h: fontPx * 2 });
    const mark = (t: number, s: string) => {
      for (const lift of [-18, -18 - 46 * sc]) {
        const [x, y] = wheelAt(t, lift);
        const a = inward(x);
        const w = s.length * fontPx * 0.56;
        const l = a === "start" ? x : a === "end" ? x - w : x - w / 2;
        if (keepClear.some((q) => l < q.x + q.w / 2 + 4 && l + w > q.x - q.w / 2 - 4 && y + 4 - fontPx < q.y + q.h / 2 + 2 && y + 6 > q.y - q.h / 2 - 2))
          continue;
        txt(marks, x, y + 4, s, { class: "dc-rim-t", "text-anchor": a, opacity: up(t).toFixed(3) });
        return;
      }
    };
    for (let d = dayOf(h.a) - 1; d <= dayOf(h.b) + 1; d++) {
      for (const [t, name] of [
        [d * DAY + rise, "Sunrise"],
        [d * DAY + set, "Sunset"],
      ] as const) {
        if (t < h.a || t > h.b) continue;
        const [x, y] = wheelAt(t);
        el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, class: "dc-rim-sun", opacity: up(t).toFixed(3) }, marks);
        mark(t, `${name} about ${fmt(Math.round(mod(t) / 5) * 5)}`);
      }
      const t = d * DAY;
      if (t > h.a + 20 && t < h.b - 20) mark(t, dayWord(t, data));
    }
    if (!follow && inHalf(now)) {
      const [x, y] = wheelAt(now);
      el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 5.5, class: "dc-rim-now", opacity: up(now).toFixed(3) }, marks);
      mark(now, "Now");
    }
    // on the open line each goes to its stop
    const stopOf = new Map<string, SkyNode>();
    for (const n of geo.nodes) for (const id of n.ids) stopOf.set(id, n);
    const stemG = el("g", { opacity: morphing ? 0.3 : 1 }, layer);
    layer.insertBefore(stemG, pathG);
    const topG = el("g", {}, layer);
    const shown: Tile[] = [];
    for (const tl of tileOf.values()) {
      const head = tl.of ?? tl;
      const n = stopOf.get(tl.it.id);
      // a late thing lives at now, so it shows as much as now does (its own day may be long out of view)
      let [x, y, w, hh, a] = [head.x, head.y, head.w, head.h, up(placeOf(tl.it))];
      if (k && n) [x, y, w, hh] = [lerp(head.x, n.x, k), lerp(head.y, n.y, k), lerp(head.w, 30, k), lerp(head.h, 30, k)];
      else if (k) a *= 1 - k;
      if (a <= 0.01 || (tl.of && k < 0.5)) continue;
      const fin = isFinished(tl.it, now);
      const late = isLate(tl.it, now) || !!tl.late;
      if (!tl.of && tl.lane && kc > 0) {
        const stem = { x1: head.ax.toFixed(1), y1: head.ay.toFixed(1), x2: head.x.toFixed(1), y2: head.y.toFixed(1) };
        el("line", { ...stem, stroke: itemColor(tl.it), "stroke-width": 1.8, "stroke-opacity": (a * 0.8 * kc).toFixed(2) }, stemG);
      }
      const dark = stripDark(tl.it.start, { inWeek: geo.inWeek, rise, set }) > 0.5;
      if (tl.of) continue;
      shown.push({ ...tl, x, y, w, h: hh });
      const eo = morphing ? 0.5 + 0.5 * Math.abs(1 - 2 * P) : 1;
      const tg = el("g", { opacity: (a * eo * (fin ? 0.82 : 1)).toFixed(3), "data-n": tl.count + 1, ...(late ? { "data-late": "" } : {}) }, topG);
      // our own pixel icon, floating where it is: no box around it (owner, 2026-11-10)
      iconSvgInto(tg, tl.it.icon, x - w / 2 + hh / 2, y, hh * (tl.it === nextIt ? 0.86 : 0.78), { class: dark ? "dc-px-svg dc-px-dark" : "dc-px-svg" });
      if (withTime.has(tl.it) && w > hh + 8 && k < 0.5)
        txt(tg, x - w / 2 + hh - 1, y + hh * 0.15, tag(tl.it), {
          "text-anchor": "start",
          "font-size": (hh * 0.31).toFixed(1),
          class: dark ? "dc-pill-t dc-tag-t dc-on-dark" : "dc-pill-t dc-tag-t",
        });
      const [bx, by] = [x + w / 2 - 2, y - hh / 2 + 2];
      if (tl.count) {
        el("circle", { cx: bx.toFixed(1), cy: by.toFixed(1), r: 8.5, class: "dc-badge" }, tg);
        txt(tg, bx, by + 3.6, `+${tl.count}`, { class: "dc-badge-t" });
      } else if (late) {
        el("circle", { cx: bx.toFixed(1), cy: by.toFixed(1), r: 7.5, fill: "#ef4444" }, tg);
        txt(tg, bx, by + 3.5, "!", { class: "dc-late-t" });
      } else if (fin) star(tg, bx - 1, by + 1, 5.5);
    }
    // the rest of the line's stops rise out of the water as it pours (they become the line's own stops as it lands)
    if (k)
      for (const n of geo.nodes) {
        const r = pour(n.t);
        if (n.ids.some((id) => tileOf.has(id)) || !r.vis || r.kk <= 0.02) continue;
        const [y, s2] = [lerp(hy, n.y, r.kk), 30 * (0.3 + 0.7 * r.kk)];
        const darkN = stripDark(n.t, { inWeek: geo.inWeek, rise, set }) > 0.5;
        iconSvgInto(topG, n.icon, n.x, y, s2 * 0.8, { opacity: r.kk.toFixed(3), class: darkN ? "dc-px-svg dc-px-dark" : "dc-px-svg" });
      }

    // ---- at night (on now), what you finished today shines as stars; opening, each flies home to its stop
    if (night && follow && P < 1) {
      const fin = starsToday;
      const sg = el("g", {}, layer);
      const kf = reduce ? 0 : E(seg(P, 0.15, 0.85));
      fin.forEach((it, i) => {
        const r0 = R * (0.3 + 0.32 * (((i * 37) % 10) / 10));
        const a0 = Math.PI * ((i + 0.5) / fin.length);
        const [sx, sy] = [cx - r0 * Math.cos(a0), hyC - r0 * HF * Math.sin(a0)];
        const stop = stopOf.get(it.id);
        star(sg, lerp(sx, stop ? stop.x + 12 : sx, kf), lerp(sy, stop ? stop.y - 12 : sy, kf), lerp(7.5, 5.5, kf), stop || !P ? 1 : 1 - P);
      });
      if (fin.length)
        txt(sg, cx, hyC - R * HF * 0.2, `${fin.length} star${fin.length === 1 ? "" : "s"} today`, { class: "dc-stars-t", opacity: (kc * 0.85).toFixed(3) });
    }

    // ---- on the water: how long until the sun sets (or rises); while turned away, "Back to now" (the engine's button)
    const waterY = full ? hyC + 32 : hy + (win.y + win.h - hy) / 2;
    if (follow && kc > 0) {
      const m = mod(now);
      const sunUp = m >= rise && m < set;
      const ahead = sunUp ? set - m : mod(rise - m);
      const near5 = Math.max(5, ahead < 60 ? Math.round(ahead / 5) * 5 : Math.round(ahead / 10) * 10);
      const span = near5 < 60 ? `${near5} min` : `${Math.floor(near5 / 60)}h${near5 % 60 ? ` ${near5 % 60}m` : ""}`;
      const chip = sunUp ? `Sun sets in about ${span}` : `Sun rises in about ${span}`;
      // sized for its words at the wheel's scale and the app's text size
      const k2 = ts * remK;
      const cw = chip.length * 6.6 * k2 + 18 + 20 * k2;
      const cg = el("g", { opacity: kc.toFixed(3) }, layer);
      el(
        "rect",
        { x: (cx - cw / 2).toFixed(1), y: (waterY - 12 * k2).toFixed(1), width: cw.toFixed(1), height: (24 * k2).toFixed(1), rx: 12 * k2, class: "dc-sunchip" },
        cg,
      );
      iconSvgInto(cg, sunUp ? "☀️" : "🌙", cx - cw / 2 + 17 * k2, waterY, 15 * k2);
      txt(cg, cx + 10 * k2, waterY + 4 * k2, chip, { class: "dc-sunchip-t" });
    }
    if (back) {
      back.hidden = follow || P > 0.01;
      back.style.left = `${cx}px`;
      back.style.top = `${waterY - 18}px`;
    }

    // ---- the words under the window (on a laptop, beside the wheel with the foot under them, the two centred in the
    // sky); the parts that don't fit give way (after, then, the numbers)
    const below = wide && footH ? footH + 10 : 0;
    const wordsTop = wide ? Math.round(Math.max(76, (hyC - wordsH.h - below) / 2)) : full ? hyC + 70 : win.y + win.h + 14;
    words.style.top = `${wordsTop}px`;
    const room = wide ? hyC - 28 - wordsTop - below : H - footH - wordsTop;
    const fitKey = `${words.dataset.html}|${room}`;
    if (fit !== fitKey) {
      const parts = [".dc-w-after", ".dc-w-then", ".dc-w-pills"].map((sel) => words.querySelector<HTMLElement>(sel)).filter((e) => e !== null);
      for (const e of parts) e.style.display = "";
      for (const e of parts) if (words.offsetHeight > room) e.style.display = "none";
      shownH = words.offsetHeight;
      // a short screen: with no room even for the title, the words keep quiet (the wheel shows what's on)
      wordsFit = shownH <= room + 4;
      fit = fitKey;
    }
    if (footEl) footEl.style.top = wide ? `${wordsTop + shownH + 22}px` : "";
    if (wide) {
      // their ink follows the sky behind them: light on a deep sky, dark on a pale one
      const f = ((wordsTop + shownH / 2 - box.t) / (box.b - box.t)) * 100;
      const a = hp * 0.58;
      const c = f < a ? mix(top, mid, clamp(f / a, 0, 1)) : mix(mid, bot, clamp((f - a) / Math.max(1, hp - a), 0, 1));
      const ink = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 150 ? "light" : "dark";
      if (root.dataset.ink !== ink) root.dataset.ink = ink;
      // the whole wheel is the place to grab, not the words beside it
      const hit = root.querySelector<HTMLElement>("[data-dc=hit]");
      if (hit) Object.assign(hit.style, { left: "0px", top: "48px", width: `${colL}px`, height: `${hyC + 40 - 48}px` });
    } else delete root.dataset.ink;
    words.style.opacity = String(reduce ? 1 - P : kc);
    words.style.transform = `translateY(${(24 * eOut(seg(P, 0, 0.45))).toFixed(1)}px)`;
    words.style.visibility = P > 0.4 || !wordsFit ? "hidden" : "visible";

    // ---- the skyling: running in place on top of the wheel (standing on the tile of what's on, if one is there),
    // the sun by day and asleep on the moon late at night; it turns round when the wheel goes back in time and jogs
    // faster while it turns. Opening, it rides the rim down onto the line.
    const moved = lastView != null && Math.abs(view - lastView) > 0.2;
    if (moved && lastView != null) dir = view < lastView ? -1 : 1;
    if (follow && !moved) dir = 1;
    lastView = view;
    const tnow = performance.now();
    if (moved && !reduce && tnow - stepAt > 70) {
      step++;
      stepAt = tnow;
    }
    const [wx, py] = at(view) ?? [cx, hy];
    let wy = py;
    for (const d of shown)
      if (!d.lane && Math.abs(wx - d.x) < d.w / 2 + 4 && wy > d.y - d.h / 2 - 6 && wy < d.y + d.h / 2 + 26) wy = Math.min(wy, d.y - d.h / 2 + 1);
    // the skyling's size: a good deal bigger than a tile, and bigger still on a big wheel; it shrinks onto the line.
    // Whole multiples of its 24 px sprite, so its pixels stay crisp (4x on a phone, 6x on a laptop's wheel)
    const rest = Math.round(clamp(R * 0.62, 96, 144) / 24) * 24;
    const size = k ? Math.round(lerp(rest, 48, k)) : rest;
    const glow = `url(#${night ? "dc-glow-night" : "dc-glow-day"})`;
    el(
      "circle",
      { cx: wx.toFixed(1), cy: (wy - size * 0.42).toFixed(1), r: (size * (night ? 0.8 : 1.05)).toFixed(1), fill: glow, opacity: fade.toFixed(3) },
      glowAt,
    );
    pose = follow && night && (mod(now) >= 23 * 60 || mod(now) < rise) ? "sleep" : reduce && !moved ? "idle" : "walk";
    if (pose !== "walk" && step >= FRAMES[pose].length) step = 0;
    who.style.width = who.style.height = `${size}px`;
    who.style.transformOrigin = `${size / 2}px ${size / 2}px`;
    // its shadow (the sprite's last row) sits on the rim
    who.style.transform = `translate(${(wx - size / 2).toFixed(1)}px, ${(wy - size * 0.97).toFixed(1)}px)${dir < 0 ? " scaleX(-1)" : ""}`;
    whoAt = { x: wx - box.l, y: wy - box.t - size * 0.45 };
    who.style.opacity = String(fade);
    paintWho();
  }

  const onResize = () => {
    remK = parseFloat(getComputedStyle(html).fontSize) / 16 || 1;
    if (last) draw(last);
  };
  window.addEventListener("resize", onResize);
  return {
    draw,
    /** Diagnostics (?debug=1): a visitor now. */
    visit: (kind?: VisitorKind) => visitors?.visit(kind),
    cheer,
    destroy() {
      visitors?.destroy();
      window.clearInterval(timer);
      delete html.dataset.sky;
      window.removeEventListener("resize", onResize);
      // leave the skeleton as React made it, so a fresh sky starts clean
      svg.textContent = "";
      if (stars) stars.textContent = "";
      words.textContent = "";
      delete words.dataset.html;
    },
  };
}
