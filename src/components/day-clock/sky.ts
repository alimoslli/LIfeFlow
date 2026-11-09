/**
 * Today as the sky (v3 Day Sky, owner 2026-11-09; concept docs/design/companions/day-sky.html; spec section 7c).
 *
 * Closed: the real sky for this minute, full width and up behind the top bar. By day your things are tiles on the sun's
 * path from sunrise (left) to sunset (right) and the companion walks it, standing on what you're doing. At sunset it
 * turns over into a valley under the horizon: the companion is the moon, and what you finished today shines as stars.
 * Under the horizon, in words: now or next, today's numbers, what comes after this half.
 *
 * Opening: today's half pours, like liquid, into its place on the timeline while the rest of the line runs out of its
 * two ends, the tiles fly to their stops, the stars fly home, and the sky folds into the timeline's window. The engine
 * (engine.ts) owns the timeline and paints its window with `paintStrip`, so the two meet exactly as the motion lands.
 *
 * Drawing only, no app state. Reduced motion gets a calm crossfade.
 */
import { isExam, pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { css, darkness, luminance, mix, skyAt, type RGB } from "@/lib/sky";
import { COMPANIONS, drawCompanion, nightOf, type Pose } from "./companion";

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
export type SkyState = { p: number; now: number; data: ClockData; items: ClockItem[]; face: SkyFace; geo: SkyGeo | null };

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
  (it.origin === "task" || it.origin === "assignment") && !it.someday && (it.allDay ? dayOf(it.start) < dayOf(now) : (it.end ?? it.start) < now);
// Milestones and goals live on the timeline, not on Today's path; to-dos and assignments are done only when you say so.
const OFF_PATH = ["milestone", "goal", "money_goal"];
const STILL_TO_DO = ["task", "assignment", ...OFF_PATH];
/** Its time has passed and it isn't something still to do: it counts as done (a star). */
export const isFinished = (it: ClockItem, now: number) =>
  !it.someday && !it.allDay && (it.end ?? it.start + 1) <= now && !STILL_TO_DO.includes(it.origin ?? "");

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
type Half = { day: boolean; a: number; b: number; d: number };
/** Today's arch: its horizon, its height (negative: a valley) and its half-width. */
type Arch = { hy: number; ry: number; rx: number };
/** A tile on Today's path; the rest of a pile point at the tile that leads it (`of`). */
type Tile = { it: ClockItem; x: number; y: number; w: number; h: number; ax: number; ay: number; lane: number; count: number; of?: Tile };
const overlaps = (a: Tile, x: number, y: number, w: number, h: number) => Math.abs(a.x - x) < (a.w + w) / 2 + 6 && Math.abs(a.y - y) < (a.h + h) / 2 + 6;

export function createSky(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  const bgQ = root.querySelector<HTMLElement>("[data-dc=skybg]");
  const wordsQ = root.querySelector<HTMLElement>("[data-dc=words]");
  if (!svgQ || !whoQ || !bgQ || !wordsQ) return { draw: () => {}, destroy: () => {} };
  const [svg, who, bg, words]: [SVGSVGElement, HTMLCanvasElement, HTMLElement, HTMLElement] = [svgQ, whoQ, bgQ, wordsQ];
  const stars = bg.querySelector<SVGSVGElement>("[data-dc=stars]");
  const clouds = [...bg.querySelectorAll<HTMLElement>("[data-dc=cloud]")];
  const html = document.documentElement;

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
    for (let i = 0; i < 70; i++) {
      const at = { cx: `${(rnd() * 100).toFixed(2)}%`, cy: `${(rnd() * 100).toFixed(2)}%`, r: rnd() < 0.18 ? 1.3 : 0.75 };
      el("circle", { ...at, style: `animation-delay:${(-rnd() * 3.2).toFixed(2)}s` }, stars);
    }
  }

  let last: SkyState | null = null;
  let sun: { key: string; rise: number; set: number } | null = null;
  let half: Half | null = null;
  let arch: Arch = { hy: 0, ry: 0, rx: 0 };
  let ui = 0; // 0 day, 1 night (eased while the arch turns over)
  let flip: { from: Arch; ui: number; t0: number } | null = null;
  let night = false;
  let pose: Pose = "stand";
  let step = 0;
  let raf = 0;
  let fit = { key: "", h: 150 };

  // the companion (Sol by day, the moon at night) on the sky, and standing on the open line
  const paintWho = () => {
    const c = night ? nightOf(COMPANIONS[1]) : COMPANIONS[1];
    for (const cv of [who, ...root.querySelectorAll<HTMLCanvasElement>(".dc-now-who")]) drawCompanion(cv, c, pose, step);
  };
  // it walks: a step about every half second (never with reduced motion, never asleep)
  const timer = reduce
    ? 0
    : window.setInterval(() => {
        if (document.hidden || pose !== "walk") return;
        step++;
        paintWho();
      }, 460);

  const halfAt = (t: number, rise: number, set: number): Half => {
    const d = dayOf(t);
    const m = t - d * DAY;
    if (m >= rise && m < set) return { day: true, a: d * DAY + rise, b: d * DAY + set, d };
    return m >= set ? { day: false, a: d * DAY + set, b: (d + 1) * DAY + rise, d } : { day: false, a: (d - 1) * DAY + set, b: d * DAY + rise, d: d - 1 };
  };
  const asleepAt = (now: number, rise: number) => night && (mod(now) >= 23 * 60 || mod(now) < rise);

  /** Under the horizon, in words: now or next, then, today's numbers, what comes after this half. */
  function fillWords(st: SkyState, h: Half, rise: number, timed: ClockItem[]) {
    const { now, data, face } = st;
    const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
    const nx = timed.filter((it) => it.start > now && it !== cur && it.origin !== "milestone").sort((a, b) => a.start - b.start)[0];
    const named = (it: ClockItem) => esc(isExam(it) ? it.title : (pileOf(timed.filter((x) => x.start === it.start)) ?? it.title));
    const done = timed.filter((it) => dayOf(it.start) === dayOf(now) && isFinished(it, now)).length;
    const pills: string[] = [];
    if (data.steps != null) pills.push(`👟 ${data.steps.toLocaleString("en-US")}`);
    if (data.sleepHours != null) pills.push(`😴 ${Math.floor(data.sleepHours)}h ${String(Math.round((data.sleepHours % 1) * 60)).padStart(2, "0")}m`);
    if (data.spentTodayCents != null) pills.push(`💳 $${(data.spentTodayCents / 100).toFixed(2).replace(/\.00$/, "")}`);
    if (done) pills.push(`⭐ ${done}`);
    const after: string[] = [];
    for (const it of timed.filter((x) => x.start >= h.b && x.start < h.b + 600).sort((a, b) => a.start - b.start)) {
      const say = `${it.icon} ${named(it)}`;
      if (after.length < 2 && !after.includes(say)) after.push(say);
    }
    const asleep = asleepAt(now, rise);
    const out = [
      `<span class="dc-w-tag">${esc(asleep ? "Sleep" : face.tag)}</span>`,
      `<span class="dc-w-now">${asleep ? "🌙 Rest well" : `${face.icon ? `${esc(face.icon)} ` : ""}${esc(face.text)}`}</span>`,
      cur && nx ? `<span class="dc-w-then">Then ${nx.icon} ${named(nx)} · ${fmt(nx.start)}</span>` : "",
      !pills.length && face.stats[0] ? `<span class="dc-w-then">${esc(face.stats[0])}</span>` : "",
      pills.length ? `<span class="dc-w-pills">${pills.map((x) => `<span>${esc(x)}</span>`).join("")}</span>` : "",
      after.length ? `<span class="dc-w-after">${night ? "After sunrise" : "After sunset"} · ${after.join(" · ")}</span>` : "",
    ].join("");
    if (words.dataset.html !== out) {
      words.dataset.html = out;
      words.innerHTML = out;
    }
  }

  function draw(st: SkyState) {
    last = st;
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const { now, data, geo } = st;
    if (!sun || sun.key !== data.today + data.tz) sun = { key: data.today + data.tz, ...sunTimes(data.today, data.tz) };
    const { rise, set } = sun;
    const h = halfAt(now, rise, set);
    night = !h.day;
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    fillWords(st, h, rise, timed);

    // ---- the arch: a dome over the words by day, a valley under the stars at night. On a short screen the words give
    // way first (after, then, the numbers), so the sky keeps its size. At sunset (and sunrise) it turns over.
    const foot = root.querySelector<HTMLElement>("[data-dc=foot]");
    const footH = foot?.offsetHeight ? foot.offsetHeight + 12 : 0;
    // (measured only when the words or the room change, never on every frame of the motion)
    const fitKey = `${words.dataset.html}|${H}|${footH}|${night}`;
    if (fit.key !== fitKey) {
      const parts = [".dc-w-after", ".dc-w-then", ".dc-w-pills"].map((sel) => words.querySelector<HTMLElement>(sel)).filter((e) => e !== null);
      for (const e of parts) e.style.display = "";
      for (const e of parts) if (H - footH - words.offsetHeight - 52 < (night ? 238 : 200)) e.style.display = "none";
      fit = { key: fitKey, h: words.offsetHeight || 150 };
    }
    const room = H - footH - fit.h;
    const rx = Math.min(W / 2 - 32, 168);
    const valleyHy = clamp(room - 204, 108, 200);
    const target: Arch = night
      ? { hy: valleyHy, ry: -(clamp(room - 64, 226, 420) - valleyHy), rx }
      : { hy: clamp(room - 52, 200, 360), ry: clamp(room - 122, 118, 214), rx };
    if (half && half.day !== h.day && !reduce) flip = { from: { ...arch }, ui, t0: performance.now() };
    half = h;
    arch = target;
    ui = night ? 1 : 0;
    if (flip) {
      const f = E(clamp((performance.now() - flip.t0) / 950, 0, 1));
      arch = { hy: lerp(flip.from.hy, target.hy, f), ry: lerp(flip.from.ry, target.ry, f), rx };
      ui = lerp(flip.ui, ui, f);
      if (f < 1) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => last && draw(last));
      } else flip = null;
    }
    const g = arch;
    const P = clamp(st.p, 0, 1);
    const k = reduce || !geo ? 0 : E(seg(P, 0, 0.8)); // how far today's half has flowed into the line
    const kc = 1 - seg(P, 0, 0.35); // what belongs only to Today (labels, beads, its shape)
    const fade = reduce ? 1 - P : 1 - seg(P, 0.84, 0.97); // the whole sky, handing over to the line as it lands
    const flat = 1 - Math.min(1, Math.abs(g.ry) / 70); // 1 while the arch is turning over
    const hy = geo ? lerp(g.hy, geo.hor, k) : g.hy;

    // ---- the sky for this minute: full width and up behind the top bar (or to a marked edge); it folds into the
    // timeline's window as it opens. At night the ground under the horizon goes dark too, then fades into the page.
    const [top, mid, bot] = skyAt(now, rise, set);
    const dk = darkness(now, rise, set);
    const skyDark = luminance(top) < 0.56;
    root.style.setProperty("--sky-ink", skyDark ? "#eef3fb" : "#0f1a2a");
    root.dataset.sky = night ? "night" : "day";
    if (P < 0.5) html.dataset.sky = skyDark ? "dark" : "light";
    else delete html.dataset.sky;
    const edge = root.closest<HTMLElement>("[data-sky-top]");
    const lift = W < 768 ? Math.max(0, root.getBoundingClientRect().top - (edge ? edge.getBoundingClientRect().top : -window.scrollY)) : 0;
    const win = geo?.win ?? { x: 0, y: -lift, w: W, h: 0, r: 0 };
    const bTop = lerp(-lift, win.y, k);
    const span = Math.max(1, lerp(hy + ui * (Math.max(0, -g.ry) + 56), win.y + win.h, k) - bTop);
    const hp = clamp(((hy - bTop) / span) * 100, 0, 100);
    const gnd = `rgb(9 19 38 / ${ui.toFixed(3)})`;
    const [rTop, rBottom] = [lerp(lift ? 0 : 28, win.r, k), lerp(0, win.r, k)];
    Object.assign(bg.style, {
      left: `${lerp(0, win.x, k)}px`,
      right: `${lerp(0, win.x, k)}px`,
      top: `${bTop}px`,
      height: `${span}px`,
      borderRadius: `${rTop}px ${rTop}px ${rBottom}px ${rBottom}px`,
      background: `linear-gradient(180deg, ${css(top)} 0%, ${css(mid)} ${(hp * 0.58).toFixed(2)}%, ${css(bot)} ${hp.toFixed(2)}%, ${gnd} ${hp.toFixed(2)}%, ${gnd} ${Math.max(hp, 100 - (40 / span) * 100).toFixed(2)}%, rgb(9 19 38 / 0) 100%)`,
      opacity: String(reduce ? 1 - P : 1 - seg(P, 0.4, 0.85)),
    });
    if (stars) stars.style.opacity = String(dk * (1 - seg(P, 0, 0.5)));
    for (const c of clouds) c.style.opacity = String((1 - dk) * 0.85 * (1 - seg(P, 0, 0.4)));

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.style.opacity = String(fade);
    layer.textContent = "";
    const morphing = !reduce && P > 0.02 && P < 0.98;
    blur.setAttribute("stdDeviation", (7 * Math.sin(Math.PI * P)).toFixed(2));
    for (const s of spillStops) s.setAttribute("stop-color", css(bot));
    if (!night && kc > 0) el("rect", { x: 0, y: g.hy, width: W, height: 44, fill: "url(#dc-spill)", opacity: (kc * (1 - flat)).toFixed(3) }, layer);

    // ---- where a moment sits: on Today's arch closed, on the line open; in between, today's half flows from one to the
    // other while the rest of the line pours out of its two ends and rises from the horizon
    const archAt = (t: number): [number, number] => {
      const th = Math.PI * clamp((t - h.a) / (h.b - h.a), 0, 1);
      return [W / 2 - g.rx * Math.cos(th), g.hy - g.ry * Math.sin(th)];
    };
    const inHalf = (t: number) => t >= h.a && t <= h.b;
    const ends = geo ? [geo.lineAt(h.a)[0], geo.lineAt(h.b)[0]] : [0, W];
    const pour = (t: number) => {
      const xr = geo ? geo.lineAt(t)[0] : 0;
      const d = clamp((t < h.a ? ends[0] - xr : xr - ends[1]) / 380, 0, 1);
      return { kk: E(seg(P, 0.12 + 0.46 * d, 0.5 + 0.46 * d)), vis: P > 0.1 + 0.46 * d };
    };
    const at = (t: number): [number, number] | null => {
      if (inHalf(t)) {
        const [xc, yc] = archAt(t);
        if (!geo || !k) return [xc, yc];
        const [xr, yr] = geo.lineAt(t);
        return [lerp(xc, xr, k), lerp(yc, yr, k)];
      }
      const r = pour(t);
      if (!geo || !k || !r.vis) return null;
      const [xr, yr] = geo.lineAt(t);
      return [xr, lerp(hy, yr, r.kk)];
    };
    const tL = geo && k ? Math.min(h.a, geo.tAtX(-30)) : h.a;
    const tR = geo && k ? Math.max(h.b, geo.tAtX(W + 30)) : h.b;
    const samples: number[] = [h.a, h.b, now];
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

    // Today's shape (the dome a soft glow on the sky, the valley a bowl in the dark ground), the glow behind the
    // companion (placed once it's known where it stands), and the horizon
    if (kc > 0)
      for (const r of runs(h.a, h.b)) {
        const d = `${poly(r)}L${r[r.length - 1][0].toFixed(1)} ${hy.toFixed(1)}L${r[0][0].toFixed(1)} ${hy.toFixed(1)}Z`;
        el("path", { d, fill: night ? "#1d3157" : "#ffffff", opacity: ((night ? 0.55 : 0.2) * kc * (1 - flat)).toFixed(3) }, layer);
      }
    const glowAt = el("g", {}, layer);
    el(
      "rect",
      { x: 0, y: (hy - 1).toFixed(1), width: W, height: 2, fill: night ? "#9fb4d8" : "#ffffff", opacity: ((night ? 0.5 : 0.95) * kc).toFixed(3) },
      layer,
    );

    // ---- the path and your things on it, melted together while it moves
    const pathG = el("g", morphing ? { filter: "url(#dc-goo)" } : {}, layer);
    const boost = morphing ? 8 * Math.sin(Math.PI * P) : 0;
    for (const r of runs(now, Infinity))
      stroke(pathG, r, "#ffffff", 4 + boost, { "stroke-opacity": night ? 0.65 : 1, "stroke-dasharray": morphing ? "none" : "0.1 8.5" });
    for (const r of runs(-Infinity, now)) {
      stroke(pathG, r, night ? "#cfe0ff" : "#ffd77a", 12 + boost, { "stroke-opacity": 0.4 });
      stroke(pathG, r, night ? "#f2f6ff" : "#ffb648", 4.5 + boost);
    }
    // the hours still ahead, as small beads on Today's path
    if (kc > 0)
      for (let t = Math.ceil(h.a / 60) * 60; t < h.b; t += 60) {
        const q = t > now ? at(t) : null;
        if (q) el("circle", { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 2.6, fill: "#ffffff", opacity: (kc * (1 - flat)).toFixed(3) }, pathG);
      }
    for (const it of timed) {
      if (it.end == null || it.end < tL || it.start > tR) continue;
      for (const r of runs(it.start, it.end)) stroke(pathG, r, itemColor(it), lerp(10, 7, k) + boost, { "stroke-opacity": it.end <= now ? 0.5 : 0.95 });
    }

    // ---- tiles: one per moment on Today's path (a pile when several share it, what's on now leading), late things at
    // now, the next two with their time. A tile that would sit on another moves just inside; failing that, it piles up.
    const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
    const nextIt = cur ?? timed.filter((it) => it.start > now && it.origin !== "milestone").sort((a, b) => a.start - b.start)[0];
    const placeOf = (it: ClockItem) => (isLate(it, now) ? now : it.start);
    const weight = (it: ClockItem) => (it === nextIt ? 9 : it.end != null ? 5 : isExam(it) ? 4 : it.origin === "assignment" || it.origin === "task" ? 3 : 1);
    const onPath = timed.filter((x) => inHalf(x.start) && !isLate(x, now) && !OFF_PATH.includes(x.origin ?? ""));
    const groups = new Map<string, ClockItem[]>();
    for (const it of [...st.items.filter((x) => isLate(x, now)), ...onPath]) {
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
    const tiles: Tile[] = [];
    const tileOf = new Map<string, Tile>();
    for (const gp of list) {
      const it = gp[0];
      const [px, py] = archAt(isLate(it, now) ? clamp(now + 1, h.a, h.b) : it.start);
      const th = it === nextIt ? 40 : isFinished(it, now) ? 28 : 34;
      const tw = withTime.has(it) ? th + fmt(it.start).length * 6.7 + 12 : th;
      const len = Math.hypot(W / 2 - px, g.hy - py) || 1;
      let tile: Tile | undefined;
      for (const lane of [0, 1]) {
        const x = px + ((W / 2 - px) / len) * lane * 44;
        const y = py + ((g.hy - py) / len) * lane * 44;
        if (x - tw / 2 < 6 || x + tw / 2 > W - 6 || tiles.some((q) => overlaps(q, x, y, tw, th))) continue;
        tile = { it, x, y, w: tw, h: th, ax: px, ay: py, lane, count: gp.length - 1 };
        break;
      }
      const near = tile
        ? undefined
        : tiles.reduce<Tile | undefined>((b, q) => (!b || Math.hypot(q.x - px, q.y - py) < Math.hypot(b.x - px, b.y - py) ? q : b), undefined);
      if (near) {
        near.count += gp.length;
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
    // on the open line each goes to its stop
    const stopOf = new Map<string, SkyNode>();
    for (const n of geo?.nodes ?? []) for (const id of n.ids) stopOf.set(id, n);
    const stemG = el("g", { opacity: morphing ? 0.3 : 1 }, layer);
    layer.insertBefore(stemG, pathG);
    const tileG = el("g", {}, pathG);
    const topG = el("g", {}, layer);
    const shown: Tile[] = [];
    for (const tl of tileOf.values()) {
      const head = tl.of ?? tl;
      const n = stopOf.get(tl.it.id);
      let [x, y, w, hh, a] = [head.x, head.y, head.w, head.h, 1];
      if (k && n) [x, y, w, hh] = [lerp(head.x, n.x, k), lerp(head.y, n.y, k), lerp(head.w, 30, k), lerp(head.h, 30, k)];
      else if (k) a = 1 - k;
      if (!P) a *= 1 - flat;
      if (a <= 0.01 || (tl.of && k < 0.5)) continue;
      const fin = isFinished(tl.it, now);
      const late = isLate(tl.it, now);
      if (!tl.of && tl.lane && kc > 0) {
        const stem = { x1: head.ax.toFixed(1), y1: head.ay.toFixed(1), x2: head.x.toFixed(1), y2: head.y.toFixed(1) };
        el("line", { ...stem, stroke: itemColor(tl.it), "stroke-width": 1.8, "stroke-opacity": (a * 0.8 * kc).toFixed(2) }, stemG);
      }
      const box = { x: (x - w / 2).toFixed(1), y: (y - hh / 2).toFixed(1), width: w.toFixed(1), height: hh.toFixed(1), rx: (hh * 0.34).toFixed(1) };
      const look = { fill: night ? "#14223b" : "#ffffff", stroke: late ? "#ef4444" : itemColor(tl.it), "stroke-width": tl.it === nextIt ? 2.6 : 2 };
      el("rect", { ...box, ...look, opacity: (a * (fin ? 0.8 : 1)).toFixed(3), filter: morphing ? "none" : "url(#dc-sh)" }, tileG);
      if (tl.of) continue;
      shown.push({ ...tl, x, y, w, h: hh });
      const eo = morphing ? 0.5 + 0.5 * Math.abs(1 - 2 * P) : 1;
      const tg = el("g", { opacity: (a * eo * (fin ? 0.82 : 1)).toFixed(3), "data-n": tl.count + 1, ...(late ? { "data-late": "" } : {}) }, topG);
      txt(tg, x - w / 2 + hh / 2, y + hh * 0.19, tl.it.icon, { "font-size": (hh * 0.52).toFixed(1) });
      if (withTime.has(tl.it) && w > hh + 8 && k < 0.5)
        txt(tg, x - w / 2 + hh - 1, y + hh * 0.15, fmt(tl.it.start), { "text-anchor": "start", "font-size": (hh * 0.31).toFixed(1), class: "dc-pill-t" });
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
    if (geo && k)
      for (const n of geo.nodes) {
        const r = pour(n.t);
        if (n.ids.some((id) => tileOf.has(id)) || !r.vis || r.kk <= 0.02) continue;
        const [y, s] = [lerp(hy, n.y, r.kk), 30 * (0.3 + 0.7 * r.kk)];
        const fill = stripDark(n.t, { inWeek: geo.inWeek, rise, set }) > 0.5 ? "#14223b" : "#ffffff";
        el(
          "rect",
          {
            x: (n.x - s / 2).toFixed(1),
            y: (y - s / 2).toFixed(1),
            width: s.toFixed(1),
            height: s.toFixed(1),
            rx: (s * 0.34).toFixed(1),
            fill,
            opacity: r.kk.toFixed(3),
          },
          tileG,
        );
        txt(topG, n.x, y + s * 0.19, n.icon, { "font-size": (s * 0.52).toFixed(1), opacity: r.kk.toFixed(3) });
      }

    // ---- sunrise and sunset where Today's path meets the horizon
    if (kc > 0) {
      const yL = night ? g.hy - 30 : g.hy + 24;
      const end = (x: number, kind: "rise" | "set", label: string, dir: 1 | -1) => {
        const eg = el("g", { opacity: (kc * (1 - flat)).toFixed(3) }, layer);
        sunGlyph(eg, x + dir * 7, yL - 4, kind);
        txt(eg, x + dir * 19, yL, label, { "text-anchor": dir > 0 ? "start" : "end", class: "dc-end" });
      };
      end(archAt(h.a)[0] - 8, night ? "set" : "rise", night ? `Sunset ${fmt(set)}` : `Sunrise ${fmt(rise)}`, 1);
      end(archAt(h.b)[0] + 8, night ? "rise" : "set", night ? `Sunrise ${fmt(rise)}` : `Sunset ${fmt(set)}`, -1);
    }

    // ---- at night, what you finished today shines as stars; opening, each flies home to its stop
    if (night && P < 1) {
      const fin = timed.filter((it) => dayOf(it.start) === h.d && isFinished(it, now));
      const sg = el("g", {}, layer);
      const top2 = Math.max(40, g.hy - 118);
      const kf = reduce ? 0 : E(seg(P, 0.15, 0.85));
      fin.forEach((it, i) => {
        const sx = 50 + ((i + 0.5) / fin.length) * (W - 100) + ((i * 37) % 23) - 11;
        const sy = top2 + 22 + ((i * 53) % Math.max(20, g.hy - top2 - 62));
        const stop = stopOf.get(it.id);
        star(
          sg,
          lerp(sx, stop ? stop.x + 12 : sx, kf),
          lerp(sy, stop ? stop.y - 12 : sy, kf),
          lerp(8.5, 5.5, kf),
          (1 - flat) * (stop || !P ? 1 : 1 - P) * (reduce ? 1 - P : 1),
        );
      });
      const when = dayOf(now) > h.d ? "yesterday" : "today";
      if (fin.length)
        txt(sg, W / 2, top2 + 4, `${fin.length} star${fin.length === 1 ? "" : "s"} ${when}`, {
          class: "dc-stars-t",
          opacity: (kc * (1 - flat) * 0.85).toFixed(3),
        });
    }

    // ---- the words under the horizon (under the valley at night)
    words.style.top = `${night ? g.hy - g.ry + 46 : g.hy + 38}px`;
    words.style.opacity = String(reduce ? 1 - P : kc);
    words.style.transform = `translateY(${(36 * eOut(seg(P, 0, 0.45))).toFixed(1)}px)`;
    words.style.visibility = P > 0.4 ? "hidden" : "visible";

    // ---- the companion on the path at now (on top of the tile of what you're doing), with the sun's (or moon's) glow
    const [wx, py] = at(now) ?? [W / 2, hy];
    let wy = py;
    for (const d of shown)
      if (!d.lane && Math.abs(wx - d.x) < d.w / 2 + 4 && wy > d.y - d.h / 2 - 6 && wy < d.y + d.h / 2 + 26) wy = Math.min(wy, d.y - d.h / 2 + 1);
    const glow = `url(#${night ? "dc-glow-night" : "dc-glow-day"})`;
    el("circle", { cx: wx.toFixed(1), cy: (wy - 22).toFixed(1), r: night ? 56 : lerp(100, 62, k), fill: glow, opacity: fade.toFixed(3) }, glowAt);
    pose = asleepAt(now, rise) ? "sleep" : reduce ? "stand" : "walk";
    who.style.transform = `translate(${(wx - 24).toFixed(1)}px, ${(wy - 41).toFixed(1)}px)`;
    who.style.opacity = String(fade);
    paintWho();
  }

  const onResize = () => last && draw(last);
  window.addEventListener("resize", onResize);
  return {
    draw,
    destroy() {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      delete html.dataset.sky;
      // leave the skeleton as React made it, so a fresh sky starts clean
      svg.textContent = "";
      if (stars) stars.textContent = "";
      words.textContent = "";
      delete words.dataset.html;
    },
  };
}
