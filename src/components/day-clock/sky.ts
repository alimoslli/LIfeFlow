/**
 * Today as the sky (v3 Day Sky, owner 2026-11-09; concept docs/design/companions/day-sky.html).
 *
 * Closed: the real sky for this minute, full width and up behind the top bar. By day your things sit as tiles on the
 * sun's path from sunrise (left) to sunset (right) and the companion walks it, standing on what you're doing now. At
 * sunset it turns over into a valley under the horizon (sunset to sunrise): the companion is the moon, and what you
 * finished today shines as stars. Under the horizon, in words: now or next, today's numbers, what comes after this half.
 *
 * Opening: the dome pours, like liquid, into the timeline: today's half flows into its place on the line while the rest
 * of the line runs out of its two ends, the tiles fly to their stops, the stars fly home to theirs, and the sky folds
 * into the timeline's window. The engine (engine.ts) owns the timeline itself (the scroller, its stops, the cards and
 * every gesture) and draws its window with `paintStrip` below, so the two match exactly when the motion ends.
 *
 * Drawing only; no app state. Transform, opacity and SVG attributes only; reduced motion gets a calm crossfade.
 */
import { isExam, pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { css, darkness, luminance, mix, skyAt, type RGB } from "@/lib/sky";
import { COMPANIONS, drawCompanion, nightOf, type Pose } from "./companion";

export type DomeFace = { tag: string; text: string; stats: string[]; icon?: string };
/** A stop on the open line, in the root's coordinates with the line at its home scroll. */
export type SkyNode = { ids: string[]; t: number; x: number; y: number; icon: string };
/** Where the open timeline is, for the morph. Null until the engine has laid it out. */
export type SkyGeo = {
  /** The timeline's window (root coordinates). */
  win: { x: number; y: number; w: number; h: number; r: number };
  /** Its horizon (root y). */
  hor: number;
  /** A moment's place on the open line at its home scroll (root coordinates). */
  lineAt: (t: number) => [number, number];
  /** The moment at a root x on the open line at its home scroll. */
  tAtX: (x: number) => number;
  /** The stops in view at the home scroll. */
  nodes: SkyNode[];
  /** Inside the week the line rises and falls with the days; outside it, it's flat. */
  inWeek: (t: number) => boolean;
};
export type DomeState = { p: number; now: number; data: ClockData; items: ClockItem[]; face: DomeFace; lineY: number; geo?: SkyGeo | null };

const NS = "http://www.w3.org/2000/svg";
const DAY = 1440;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const E = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
const mod = (m: number) => ((m % DAY) + DAY) % DAY;
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

/** Each kind of thing has its colour on the sky: shifts amber, classes blue, deadlines red, the rest by where they came from. */
export function itemColor(it: Pick<ClockItem, "cat" | "origin">): string {
  if (it.cat === "work") return "#f59e0b";
  if (it.cat === "class") return "#2f80ed";
  if (it.cat === "due") return "#ef4444";
  switch (it.origin) {
    case "reminder":
      return "#8fa3bf";
    case "goal":
    case "money_goal":
      return "#22b866";
    case "milestone":
      return "#f06292";
    case "bill":
    case "trial":
    case "pay":
      return "#0f8f80";
    default:
      return "#06b0cc";
  }
}
/** Still open after its time: a to-do or an assignment that's late (the line keeps it at now). */
export const isLate = (it: ClockItem, now: number) =>
  (it.origin === "task" || it.origin === "assignment") && !it.someday && !it.allDay && (it.end ?? it.start) < now;
/** Its time has passed and it isn't something still to do: it counts as done (a star). */
export const isFinished = (it: ClockItem, now: number) =>
  !it.someday &&
  !it.allDay &&
  (it.end ?? it.start + 1) <= now &&
  it.origin !== "task" &&
  it.origin !== "assignment" &&
  it.origin !== "milestone" &&
  it.origin !== "goal";

function starPath(x: number, y: number, r: number) {
  const q = r * 0.18;
  return `M${x} ${y - r}Q${x + q} ${y - q} ${x + r} ${y}Q${x + q} ${y + q} ${x} ${y + r}Q${x - q} ${y + q} ${x - r} ${y}Q${x - q} ${y - q} ${x} ${y - r}Z`;
}
function sunGlyph(defs: Element, p: Element, x: number, y: number, kind: "rise" | "set") {
  const id = `sg${kind}${Math.round(x)}x${Math.round(y)}`;
  const cl = el("clipPath", { id }, defs);
  el("rect", { x: x - 9, y: y - 9, width: 18, height: 9 }, cl);
  el("circle", { cx: x, cy: y, r: 5.5, fill: "#f5a524", "clip-path": `url(#${id})` }, p);
  el("rect", { x: x - 8, y: y - 0.8, width: 16, height: 1.6, rx: 0.8, fill: "#f5a524" }, p);
  el(
    "path",
    {
      d: kind === "rise" ? `M${x - 2.6} ${y - 8.4}l2.6 -2.6l2.6 2.6` : `M${x - 2.6} ${y - 11}l2.6 2.6l2.6 -2.6`,
      fill: "none",
      stroke: "#f5a524",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    p,
  );
}

/* ---------- the timeline's window (shared by the engine's line and the morph) ---------- */
export type StripOpts = {
  /** x range to paint, in the svg's own coordinates */
  x0: number;
  x1: number;
  /** the moment at an svg x, and an svg x for a moment */
  tAt: (x: number) => number;
  xOf: (t: number) => number;
  /** the line's y for a moment (svg coordinates) */
  yOf: (t: number) => number;
  /** the window's sky top, horizon and water bottom (svg y) */
  top: number;
  hor: number;
  bottom: number;
  inWeek: (t: number) => boolean;
  now: number;
  rise: number;
  set: number;
  items: ClockItem[];
  /** an id prefix so two strips on a page don't share gradients */
  id: string;
  /** a little thicker while it's melting */
  boost?: number;
};
const FAR_TOP = hex("#355889");
const FAR_BOT = hex("#b9c9de");
/** The sky above the line at a moment: the real sky inside the week; a calm far-off twilight beyond it. */
export function stripSky(t: number, o: Pick<StripOpts, "inWeek" | "rise" | "set">): [RGB, RGB] {
  if (!o.inWeek(t)) return [FAR_TOP, FAR_BOT];
  const [a, , c] = skyAt(t, o.rise, o.set);
  return [a, c];
}
export function stripDark(t: number, o: Pick<StripOpts, "inWeek" | "rise" | "set">) {
  return o.inWeek(t) ? darkness(t, o.rise, o.set) : 0.35;
}

/** Paint the timeline's window into an svg group: each hour its own sky, the water under it, stars over the nights, and
 * the line rising into a hill for every day and falling into a valley for every night, your things along it. */
export function paintStrip(g: Element, defs: Element, o: StripOpts) {
  const W = o.x1 - o.x0;
  const soft = (f: (t: number) => RGB) => (x: number) => {
    let acc: RGB = [0, 0, 0];
    for (const dx of [-42, -21, 0, 21, 42]) {
      const c = f(o.tAt(x + dx));
      acc = [acc[0] + c[0] / 5, acc[1] + c[1] / 5, acc[2] + c[2] / 5];
    }
    return acc;
  };
  const grad = (id: string, f: (x: number) => RGB) => {
    const gr = el("linearGradient", { id, x1: o.x0, y1: 0, x2: o.x1, y2: 0, gradientUnits: "userSpaceOnUse" }, defs);
    for (let x = o.x0; x <= o.x1 + 0.1; x += Math.max(6, W / 160)) el("stop", { offset: clamp((x - o.x0) / W, 0, 1).toFixed(4), "stop-color": css(f(x)) }, gr);
  };
  const deep = hex("#06101f");
  grad(
    `${o.id}T`,
    soft((t) => stripSky(t, o)[0]),
  );
  grad(
    `${o.id}B`,
    soft((t) => stripSky(t, o)[1]),
  );
  grad(
    `${o.id}WT`,
    soft((t) => mix(stripSky(t, o)[1], deep, 0.22)),
  );
  grad(
    `${o.id}WB`,
    soft((t) => mix(stripSky(t, o)[0], deep, 0.4)),
  );
  const vm = el("linearGradient", { id: `${o.id}V`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 }, vm);
  el("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 1 }, vm);
  const mk = el("mask", { id: `${o.id}M`, maskUnits: "userSpaceOnUse", x: o.x0, y: o.top, width: W, height: o.hor - o.top }, defs);
  el("rect", { x: o.x0, y: o.top, width: W, height: o.hor - o.top, fill: `url(#${o.id}V)` }, mk);
  const mw = el("mask", { id: `${o.id}N`, maskUnits: "userSpaceOnUse", x: o.x0, y: o.hor, width: W, height: o.bottom - o.hor }, defs);
  el("rect", { x: o.x0, y: o.hor, width: W, height: o.bottom - o.hor, fill: `url(#${o.id}V)` }, mw);
  el("rect", { x: o.x0, y: o.top, width: W, height: o.hor - o.top, fill: `url(#${o.id}T)` }, g);
  el("rect", { x: o.x0, y: o.top, width: W, height: o.hor - o.top, fill: `url(#${o.id}B)`, mask: `url(#${o.id}M)` }, g);
  el("rect", { x: o.x0, y: o.hor, width: W, height: o.bottom - o.hor, fill: `url(#${o.id}WT)` }, g);
  el("rect", { x: o.x0, y: o.hor, width: W, height: o.bottom - o.hor, fill: `url(#${o.id}WB)`, mask: `url(#${o.id}N)` }, g);
  // stars over the nights, ripples on the water (both fixed to their place on the line)
  const d0 = Math.floor(o.tAt(o.x0) / DAY) - 1;
  const d1 = Math.floor(o.tAt(o.x1) / DAY) + 1;
  for (let d = d0; d <= d1; d++) {
    let s = (d + 5000) * 7919;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 12; i++) {
      const t = d * DAY + o.set + 50 + rnd() * (DAY - o.set + o.rise - 100);
      const x = o.xOf(t);
      const y = o.top + 10 + rnd() * (o.hor - o.top - 26);
      const dk = stripDark(t, o);
      if (x > o.x0 && x < o.x1 && dk > 0.5)
        el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: rnd() < 0.2 ? 1.3 : 0.8, fill: "#fff", opacity: (0.85 * dk).toFixed(2) }, g);
    }
  }
  for (let i = 0; i < 6; i++) {
    const y = o.hor + 10 + i * i * 2.8;
    for (let x = o.x0 - (o.x0 % 90) + ((i * 37) % 90); x < o.x1; x += 90 + i * 14)
      el(
        "rect",
        { x: x.toFixed(1), y: y.toFixed(1), width: 24 + ((i * 47) % 30), height: 1.2, rx: 0.6, fill: "#fff", opacity: (0.07 + 0.025 * (6 - i)).toFixed(3) },
        g,
      );
  }
  el("rect", { x: o.x0, y: o.hor - 1, width: W, height: 2, fill: "#ffffff", opacity: 0.55 }, g);
  // the line: what's behind you glows; what's ahead is a dotted path; nights a little quieter
  const pts: [number, number, number][] = [];
  for (let x = o.x0 - 4; x <= o.x1 + 4; x += 4) {
    const t = o.tAt(x);
    pts.push([o.xOf(t), o.yOf(t), t]);
  }
  const boost = o.boost ?? 0;
  const past = pts.filter((p) => p[2] <= o.now);
  if (past.length > 1) {
    el(
      "path",
      {
        d: poly(past),
        fill: "none",
        stroke: "#ffd77a",
        "stroke-opacity": 0.4,
        "stroke-width": 11 + boost,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      g,
    );
    el("path", { d: poly(past), fill: "none", stroke: "#ffb648", "stroke-width": 4.5 + boost, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
  }
  const ahead = pts.filter((p) => p[2] >= o.now);
  let run: [number, number, number][] = [];
  const flush = () => {
    if (run.length > 1) {
      const nt = stripDark(run[0][2], o) > 0.5;
      el(
        "path",
        {
          d: poly(run),
          fill: "none",
          stroke: "#ffffff",
          "stroke-opacity": nt ? 0.6 : 0.95,
          "stroke-width": 4 + boost,
          "stroke-linecap": "round",
          "stroke-dasharray": boost ? "none" : "0.1 8.5",
        },
        g,
      );
    }
  };
  for (const p of ahead) {
    if (run.length && stripDark(p[2], o) > 0.5 !== stripDark(run[0][2], o) > 0.5) {
      run.push(p);
      flush();
      run = [p];
    } else run.push(p);
  }
  flush();
  // how long each thing takes, along the line
  for (const it of o.items) {
    if (it.end == null || it.allDay || it.someday) continue;
    const a = o.xOf(it.start);
    const b = o.xOf(it.end);
    if (b < o.x0 || a > o.x1) continue;
    const seg2: number[][] = [];
    for (let x = Math.max(a, o.x0); x <= Math.min(b, o.x1); x += 3) {
      const t = o.tAt(x);
      seg2.push([x, o.yOf(t)]);
    }
    if (seg2.length > 1)
      el(
        "path",
        {
          d: poly(seg2),
          fill: "none",
          stroke: itemColor(it),
          "stroke-opacity": it.end <= o.now ? 0.5 : 0.95,
          "stroke-width": 7 + boost,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        g,
      );
  }
  // a small sun where each day starts, a moon where it ends
  for (let d = d0; d <= d1; d++) {
    for (const [t, kind] of [
      [d * DAY + o.rise, "rise"],
      [d * DAY + o.set, "set"],
    ] as const) {
      if (!o.inWeek(t)) continue;
      const x = o.xOf(t);
      if (x < o.x0 - 10 || x > o.x1 + 10) continue;
      if (kind === "rise") sunGlyph(defs, g, x, o.hor + 14, "rise");
      else el("path", { d: `M${x + 2} ${o.hor + 7}a5 5 0 1 0 0 10a6.5 6.5 0 1 1 0 -10z`, fill: "#e6edf8" }, g);
    }
  }
}

/* ---------- Today (closed) and the motion ---------- */
type Half = { day: boolean; a: number; b: number; d: number };
type Geo = { hy: number; ry: number; rx: number };
type Tile = {
  id: string;
  it: ClockItem;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  lane: number;
  count: number;
  head: boolean;
  of?: Tile;
};
const hit = (a: number[], b: number[]) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

export function createSky(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  const bgQ = root.querySelector<HTMLElement>("[data-dc=skybg]");
  const wordsQ = root.querySelector<HTMLElement>("[data-dc=words]");
  if (!svgQ || !whoQ || !bgQ || !wordsQ) return { draw: () => {}, paintNow: () => {}, destroy: () => {} };
  const svg: SVGSVGElement = svgQ;
  const who: HTMLCanvasElement = whoQ;
  const bg: HTMLElement = bgQ;
  const words: HTMLElement = wordsQ;
  const stars = bg.querySelector<SVGSVGElement>("[data-dc=stars]");
  const clouds = [...bg.querySelectorAll<HTMLElement>("[data-dc=cloud]")];
  const lead = COMPANIONS[1];
  let last: DomeState | null = null;
  let sun: { key: string; rise: number; set: number } | null = null;
  let half: Half | null = null;
  let flip: { from: Geo; ui: number; t0: number } | null = null;
  let g: Geo = { hy: 0, ry: 0, rx: 0 };
  let ui = 0;
  let step = 0;
  let pose: Pose = "stand";
  let night = false;
  let raf = 0;
  const html = document.documentElement;

  // the twinkling stars live in the sky's own layer, built once
  if (stars) {
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++)
      el(
        "circle",
        {
          cx: (rnd() * 100).toFixed(2) + "%",
          cy: (rnd() * 100).toFixed(2) + "%",
          r: rnd() < 0.18 ? 1.3 : 0.75,
          style: `animation-delay:${(-rnd() * 3.2).toFixed(2)}s`,
        },
        stars,
      );
  }

  const paintWho = () => {
    const c = night ? nightOf(lead) : lead;
    drawCompanion(who, c, pose, step, false);
    for (const cv of root.querySelectorAll<HTMLCanvasElement>(".dc-now-who")) drawCompanion(cv, c, pose, step, false);
  };
  // the companion walks: a step about every half second (never with reduced motion, never while asleep)
  const timer = reduce
    ? 0
    : window.setInterval(() => {
        if (document.hidden || pose !== "walk") return;
        step++;
        paintWho();
      }, 460);

  const halfAt = (t: number, rise: number, set: number): Half => {
    const d = Math.floor(t / DAY);
    const m = t - d * DAY;
    if (m >= rise && m < set) return { day: true, a: d * DAY + rise, b: d * DAY + set, d };
    return m >= set ? { day: false, a: d * DAY + set, b: (d + 1) * DAY + rise, d } : { day: false, a: (d - 1) * DAY + set, b: d * DAY + rise, d: d - 1 };
  };

  function fillWords(st: DomeState, h: Half, rise: number, timed: ClockItem[]) {
    const { now, data } = st;
    // under the horizon, in words: now or next, today's numbers, what comes after this half
    const upcoming = timed.filter((it) => it.start > now && it.origin !== "milestone").sort((a, b) => a.start - b.start);
    const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
    const nx = upcoming.find((it) => it !== cur);
    const finToday = timed.filter((it) => Math.floor(it.start / DAY) === Math.floor(now / DAY) && isFinished(it, now)).length;
    const afterGroups: ClockItem[][] = [];
    for (const it of timed.filter((x) => x.start >= h.b && x.start < h.b + 600).sort((a, b) => a.start - b.start)) {
      const grp = afterGroups.find((x) => x[0].start === it.start);
      if (grp) grp.push(it);
      else afterGroups.push([it]);
    }
    const after = afterGroups.slice(0, 2).map((gp) => `${gp[0].icon} ${esc(pileOf(gp) ?? gp[0].title)}`);
    const pills: string[] = [];
    if (data.steps != null) pills.push(`👟 ${data.steps.toLocaleString("en-US")}`);
    if (data.sleepHours != null) pills.push(`😴 ${Math.floor(data.sleepHours)}h ${String(Math.round((data.sleepHours % 1) * 60)).padStart(2, "0")}m`);
    if (data.spentTodayCents != null) pills.push(`💳 $${(data.spentTodayCents / 100).toFixed(2).replace(/\.00$/, "")}`);
    if (finToday) pills.push(`⭐ ${finToday}`);
    const asleep = night && (mod(now) >= 23 * 60 || mod(now) < rise);
    const face = st.face;
    const then =
      cur && nx ? `Then ${nx.icon} ${esc(isExam(nx) ? nx.title : (pileOf(timed.filter((x) => x.start === nx.start)) ?? nx.title))} · ${fmt(nx.start)}` : "";
    const statLine = !pills.length && face.stats.length ? `<span class="dc-w-then">${esc(face.stats[0])}</span>` : "";
    const key = [face.tag, face.text, face.icon, then, pills.join(), after.join(), asleep, night].join("|");
    if (words.dataset.key !== key) {
      words.dataset.key = key;
      words.innerHTML = `<span class="dc-w-tag">${esc(asleep ? "Sleep" : face.tag)}</span><span class="dc-w-now">${
        asleep ? "🌙 Rest well" : `${face.icon ? `${esc(face.icon)} ` : ""}${esc(face.text)}`
      }</span>${then ? `<span class="dc-w-then">${then}</span>` : ""}${statLine}${
        pills.length ? `<span class="dc-w-pills">${pills.map((x) => `<span>${esc(x)}</span>`).join("")}</span>` : ""
      }${after.length ? `<span class="dc-w-after">${night ? "After sunrise" : "After sunset"} · ${after.join(" · ")}</span>` : ""}`;
    }
  }

  function draw(st: DomeState) {
    last = st;
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const { now, data, p } = st;
    if (!sun || sun.key !== data.today + data.tz) sun = { key: data.today + data.tz, ...sunTimes(data.today, data.tz) };
    const { rise, set } = sun;
    const h = halfAt(now, rise, set);
    night = !h.day;
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    fillWords(st, h, rise, timed);
    // closed geometry: a dome over the words by day, a valley under the stars at night. On a short screen the words
    // give way first ("after sunset", then "then ..."), so the sky keeps its size.
    const foot = root.querySelector<HTMLElement>("[data-dc=foot]");
    const footH = foot && foot.offsetHeight ? foot.offsetHeight + 12 : 0;
    const need = night ? 300 : 228;
    for (const sel of [".dc-w-after", ".dc-w-then", ".dc-w-pills"]) {
      const e = words.querySelector<HTMLElement>(sel);
      if (e) e.style.display = H - footH - words.offsetHeight - 52 < need ? "none" : "";
    }
    const wordsH = words.offsetHeight || 150;
    const roomBottom = H - footH - wordsH - 52;
    const rx = Math.min(W / 2 - 32, 168);
    const day: Geo = { hy: clamp(roomBottom, 200, 360), ry: clamp(roomBottom - 70, 118, 214), rx };
    const vb = clamp(H - footH - wordsH - 64, 226, 420);
    const nh = clamp(vb - 140, 108, 200);
    const nightG: Geo = { hy: nh, ry: -(vb - nh), rx };
    const target = night ? nightG : day;
    if (half && half.day !== h.day && !reduce) flip = { from: { ...g }, ui, t0: performance.now() };
    half = h;
    g = target;
    ui = night ? 1 : 0;
    if (flip) {
      const f = E(clamp((performance.now() - flip.t0) / 950, 0, 1));
      g = { hy: lerp(flip.from.hy, target.hy, f), ry: lerp(flip.from.ry, target.ry, f), rx };
      ui = lerp(flip.ui, ui, f);
      if (f >= 1) flip = null;
      else {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => last && draw(last));
      }
    }
    const geo = st.geo ?? null;
    const P = clamp(p, 0, 1);
    const k = reduce ? 0 : E(seg(P, 0, 0.8));
    const kc = 1 - seg(P, 0, 0.35);
    const fade = reduce ? 1 - P : 1 - seg(P, 0.84, 0.97);
    const flat = 1 - Math.min(1, Math.abs(g.ry) / 70);
    const hy = geo ? lerp(g.hy, geo.hor, k) : g.hy;

    // ---- colours: the sky now; ink on it
    const [top, mid, bot] = skyAt(now, rise, set);
    const dk = darkness(now, rise, set);
    const skyDark = luminance(top) < 0.56;
    root.style.setProperty("--sky-ink", skyDark ? "#eef3fb" : "#0f1a2a");
    root.dataset.sky = night ? "night" : "day";
    if (P < 0.5) html.dataset.sky = skyDark ? "dark" : "light";
    else delete html.dataset.sky;

    // ---- the sky: full width and up behind the top bar; it folds into the timeline's window as it opens
    // how far the sky reaches up above the clock: to the top of the page (behind the top bar), or to a marked edge
    const edge = root.closest<HTMLElement>("[data-sky-top]");
    const lift = W < 768 ? Math.max(0, root.getBoundingClientRect().top - (edge ? edge.getBoundingClientRect().top : -window.scrollY)) : 0;
    const win = geo?.win;
    const bx = win ? lerp(0, win.x, k) : 0;
    const bTop = win ? lerp(-lift, win.y, k) : -lift;
    // at night the ground under the horizon is dark as well, down past the valley, then it fades into the page
    const ground = ui * (Math.max(0, -g.ry) + 56);
    const bBottom = win ? lerp(hy + ground, win.y + win.h, k) : hy + ground;
    Object.assign(bg.style, {
      left: `${bx}px`,
      right: `${bx}px`,
      top: `${bTop}px`,
      height: `${Math.max(0, bBottom - bTop)}px`,
      borderRadius: `${win ? lerp(lift ? 0 : 28, win.r, k) : lift ? 0 : 28}px ${win ? lerp(lift ? 0 : 28, win.r, k) : lift ? 0 : 28}px ${win ? lerp(0, win.r, k) : 0}px ${win ? lerp(0, win.r, k) : 0}px`,
      background: (() => {
        const span = Math.max(1, bBottom - bTop);
        const hp = clamp(((hy - bTop) / span) * 100, 0, 100);
        const gnd = `rgb(9 19 38 / ${ui.toFixed(3)})`;
        return `linear-gradient(180deg, ${css(top)} 0%, ${css(mid)} ${(hp * 0.58).toFixed(2)}%, ${css(bot)} ${hp.toFixed(2)}%, ${gnd} ${hp.toFixed(2)}%, ${gnd} ${Math.max(hp, 100 - (40 / span) * 100).toFixed(2)}%, rgb(9 19 38 / 0) 100%)`;
      })(),
      opacity: String(reduce ? 1 - P : 1 - seg(P, 0.4, 0.85)),
    });
    if (stars) stars.style.opacity = String(dk * (1 - seg(P, 0, 0.5)));
    for (const c of clouds) c.style.opacity = String((1 - dk) * 0.85 * (1 - seg(P, 0, 0.4)));

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.textContent = "";
    svg.style.opacity = String(fade);
    const defs = el("defs", {}, svg);
    const goo = el("filter", { id: "dc-goo", x: "-10%", y: "-10%", width: "120%", height: "120%", "color-interpolation-filters": "sRGB" }, defs);
    el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: (7 * Math.sin(Math.PI * P)).toFixed(2), result: "b" }, goo);
    el("feColorMatrix", { in: "b", mode: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10", result: "g" }, goo);
    el("feComposite", { in: "SourceGraphic", in2: "g", operator: "atop" }, goo);
    const sh = el("filter", { id: "dc-sh", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
    el("feDropShadow", { dx: 0, dy: 2.5, stdDeviation: 2.6, "flood-color": "#0b1426", "flood-opacity": 0.22 }, sh);
    const glow = el("radialGradient", { id: "dc-glow" }, defs);
    for (const [o, c, a] of night
      ? [
          [0, "#eef4ff", 0.5],
          [0.45, "#a9c1ec", 0.16],
          [1, "#a9c1ec", 0],
        ]
      : [
          [0, "#fff8dc", 0.95],
          [0.35, "#ffe2a0", 0.45],
          [1, "#ffd27a", 0],
        ])
      el("stop", { offset: o, "stop-color": c as string, "stop-opacity": a as number }, glow);
    // a little of the sky's warmth spills onto the ground under it by day
    if (!night && kc > 0) {
      const sp = el("linearGradient", { id: "dc-spill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el("stop", { offset: 0, "stop-color": css(bot), "stop-opacity": 0.5 }, sp);
      el("stop", { offset: 1, "stop-color": css(bot), "stop-opacity": 0 }, sp);
      el("rect", { x: 0, y: g.hy, width: W, height: 44, fill: "url(#dc-spill)", opacity: (kc * (1 - flat)).toFixed(3) }, svg);
    }

    // ---- while it opens: the timeline's window takes shape under the motion
    const kb = reduce ? 0 : seg(P, 0.42, 0.88);
    if (geo && win && kb > 0) {
      const wg = el("g", { opacity: kb.toFixed(3) }, svg);
      const clip = el("clipPath", { id: "dc-win" }, defs);
      el("rect", { x: win.x, y: win.y, width: win.w, height: win.h, rx: win.r }, clip);
      const inner = el("g", { "clip-path": "url(#dc-win)" }, wg);
      paintStrip(inner, defs, {
        x0: win.x,
        x1: win.x + win.w,
        tAt: geo.tAtX,
        xOf: (t) => geo.lineAt(t)[0],
        yOf: (t) => geo.lineAt(t)[1],
        top: win.y,
        hor: geo.hor,
        bottom: win.y + win.h,
        inWeek: geo.inWeek,
        now,
        rise,
        set,
        items: [],
        id: "dc-mw",
      });
    }

    // ---- where everything sits: on Today's dome (or valley) closed, on the line open; in between, today's half flows
    // from one to the other and the rest of the line pours out of its two ends
    const closedPt = (t: number): [number, number] => {
      const th = Math.PI * clamp((t - h.a) / (h.b - h.a), 0, 1);
      return [W / 2 - g.rx * Math.cos(th), g.hy - g.ry * Math.sin(th)];
    };
    const inHalf = (t: number) => t >= h.a && t <= h.b;
    const ax = geo ? geo.lineAt(h.a)[0] : 0;
    const bxx = geo ? geo.lineAt(h.b)[0] : W;
    const reveal = (t: number) => {
      if (!geo) return { kk: 0, vis: false };
      const xr = geo.lineAt(t)[0];
      const dist = t < h.a ? ax - xr : xr - bxx;
      const d = clamp(dist / 380, 0, 1);
      return { kk: E(seg(P, 0.12 + 0.46 * d, 0.5 + 0.46 * d)), vis: P > 0.1 + 0.46 * d };
    };
    const at = (t: number): [number, number, number] | null => {
      if (inHalf(t)) {
        const [xc, yc] = closedPt(t);
        if (!geo || k === 0) return [xc, yc, 1];
        const [xr, yr] = geo.lineAt(t);
        return [lerp(xc, xr, k), lerp(yc, yr, k), 1];
      }
      if (!geo || P === 0 || reduce) return null;
      const r = reveal(t);
      if (!r.vis) return null;
      const [xr, yr] = geo.lineAt(t);
      return [xr, lerp(hy, yr, r.kk), r.kk];
    };
    const tL = geo && P > 0 ? Math.min(h.a, geo.tAtX(-30)) : h.a;
    const tR = geo && P > 0 ? Math.max(h.b, geo.tAtX(W + 30)) : h.b;
    const samples: number[] = [];
    for (let t = tL; t <= tR; t += Math.max(4, (tR - tL) / 260)) samples.push(t);
    samples.push(h.a, h.b, now);
    samples.sort((a, b) => a - b);
    const pts = samples.map((t) => {
      const q = at(t);
      return q ? ([q[0], q[1], t] as [number, number, number]) : null;
    });
    const runs = (from: number, to: number) => {
      const out: [number, number, number][][] = [];
      let cur: [number, number, number][] = [];
      for (const q of pts) {
        if (q && q[2] >= from && q[2] <= to && q[0] > -60 && q[0] < W + 60) cur.push(q);
        else if (cur.length) {
          out.push(cur);
          cur = [];
        }
      }
      if (cur.length) out.push(cur);
      return out.filter((r) => r.length > 1);
    };
    // Today's shape: the dome a soft glow over the sky, the valley a deeper bowl in the ground
    if (kc > 0)
      for (const r of runs(h.a, h.b))
        el(
          "path",
          {
            d: `${poly(r)}L${r[r.length - 1][0].toFixed(1)} ${hy.toFixed(1)}L${r[0][0].toFixed(1)} ${hy.toFixed(1)}Z`,
            fill: night ? "#1d3157" : "#ffffff",
            opacity: ((night ? 0.55 : 0.2) * kc * (1 - flat)).toFixed(3),
          },
          svg,
        );

    // the sun (or moon) behind the companion; it's placed once the tiles are, since it stands on them
    const glowAt = el("g", {}, svg);
    // the horizon
    el(
      "rect",
      { x: 0, y: (hy - 1).toFixed(1), width: W, height: 2, fill: night ? "#9fb4d8" : "#ffffff", opacity: ((night ? 0.5 : 0.95) * kc).toFixed(3) },
      svg,
    );

    // ---- the path and your things on it (melted together while it moves)
    const morphing = !reduce && P > 0.02 && P < 0.98;
    const pathG = el("g", morphing ? { filter: "url(#dc-goo)" } : {}, svg);
    const boost = morphing ? 8 * Math.sin(Math.PI * P) : 0;
    const roadW = 4 + boost;
    for (const r of runs(now, Infinity)) {
      el(
        "path",
        {
          d: poly(r),
          fill: "none",
          stroke: "#ffffff",
          "stroke-opacity": night ? 0.65 : 1,
          "stroke-width": roadW.toFixed(1),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": morphing ? "none" : "0.1 8.5",
        },
        pathG,
      );
    }
    for (const r of runs(-Infinity, now)) {
      el(
        "path",
        {
          d: poly(r),
          fill: "none",
          stroke: night ? "#cfe0ff" : "#ffd77a",
          "stroke-opacity": 0.4,
          "stroke-width": (roadW + 8).toFixed(1),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        pathG,
      );
      el(
        "path",
        {
          d: poly(r),
          fill: "none",
          stroke: night ? "#f2f6ff" : "#ffb648",
          "stroke-width": (roadW + 0.5).toFixed(1),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        pathG,
      );
    }
    // the hours still ahead, as small beads on Today's path
    if (kc > 0)
      for (let hr = Math.ceil(h.a / 60); hr * 60 < h.b; hr++) {
        const t = hr * 60;
        if (t <= now) continue;
        const q = at(t);
        if (q) el("circle", { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 2.6, fill: "#ffffff", opacity: (kc * (1 - flat)).toFixed(3) }, pathG);
      }
    // how long each thing takes, along the path
    for (const it of timed) {
      if (it.end == null || it.end < tL || it.start > tR) continue;
      for (const r of runs(it.start, it.end))
        el(
          "path",
          {
            d: poly(r),
            fill: "none",
            stroke: itemColor(it),
            "stroke-opacity": it.end <= now ? 0.5 : 0.95,
            "stroke-width": (lerp(10, 7, k) + boost).toFixed(1),
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          pathG,
        );
    }

    // ---- tiles: one per thing on Today's path (piles when they'd overlap); the next two carry their time
    const late = timed.filter((it) => isLate(it, now) && Math.floor(it.start / DAY) === Math.floor(now / DAY));
    const upcoming = timed.filter((it) => it.start > now && it.origin !== "milestone").sort((a, b) => a.start - b.start);
    const cur = timed.find((it) => it.end != null && it.start <= now && it.end > now);
    const nextIt = cur ?? upcoming[0];
    const placeOf = (it: ClockItem) => (isLate(it, now) ? now : it.start);
    const all = [
      ...timed.filter((it) => inHalf(it.start) && !isLate(it, now) && it.origin !== "milestone" && it.origin !== "goal" && it.origin !== "money_goal"),
      ...late,
    ].sort((a, b) => placeOf(a) - placeOf(b));
    const weight = (it: ClockItem) => (it === nextIt ? 9 : it.end != null ? 5 : isExam(it) ? 4 : it.origin === "assignment" || it.origin === "task" ? 3 : 1);
    const groups: ClockItem[][] = [];
    for (const it of all) {
      const gp = groups.find((x) => placeOf(x[0]) === placeOf(it) && isLate(x[0], now) === isLate(it, now));
      if (gp) gp.push(it);
      else groups.push([it]);
    }
    const list = groups.map((gp) => [...gp].sort((a, b) => weight(b) - weight(a)));
    const withTime = new Set(
      list
        .filter((gp) => placeOf(gp[0]) > now && !gp.includes(cur as ClockItem))
        .slice(0, 2)
        .map((gp) => gp[0].id),
    );
    const tw = (s: string, fs: number) => s.length * fs * 0.56;
    const tiles = new Map<string, Tile>();
    const placed: Tile[] = [];
    for (const gp of list) {
      const it = gp[0];
      const t = isLate(it, now) ? clamp(now + 1, h.a, h.b) : it.start;
      const [px, py] = closedPt(t);
      const hgt = it === nextIt ? 40 : isFinished(it, now) ? 28 : 34;
      const w = withTime.has(it.id) ? hgt + tw(fmt(it.start), 12) + 12 : hgt;
      const dx = W / 2 - px;
      const dy = g.hy - py;
      const len = Math.hypot(dx, dy) || 1;
      let spot: Tile | null = null;
      for (const lane of [0, 44]) {
        const x = px + (dx / len) * lane;
        const y = py + (dy / len) * lane;
        if (x - w / 2 < 6 || x + w / 2 > W - 6) continue;
        const r = [x - w / 2 - 3, y - hgt / 2 - 3, w + 6, hgt + 6];
        if (placed.some((q) => hit([q.x - q.w / 2 - 3, q.y - q.h / 2 - 3, q.w + 6, q.h + 6], r))) continue;
        spot = { id: it.id, it, x, y, w, h: hgt, ax: px, ay: py, lane: lane ? 1 : 0, count: gp.length - 1, head: true };
        break;
      }
      if (!spot) {
        let best: Tile | null = null;
        let bd = Infinity;
        for (const q of placed) {
          const d = Math.hypot(q.x - px, q.y - py);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) {
          best.count += gp.length;
          for (const o of gp.slice(1)) tiles.set(o.id, { ...best, it: o, id: o.id, head: false, of: best });
          // what's on now (or next) leads the pile
          if (it === nextIt) {
            const old = best.it;
            best.it = it;
            best.id = it.id;
            tiles.set(old.id, { ...best, it: old, id: old.id, head: false, of: best });
            tiles.set(it.id, best);
          } else tiles.set(it.id, { ...best, it, id: it.id, head: false, of: best });
          continue;
        }
        spot = { id: it.id, it, x: px, y: py, w, h: hgt, ax: px, ay: py, lane: 0, count: gp.length - 1, head: true };
      }
      tiles.set(it.id, spot);
      for (const o of gp.slice(1)) tiles.set(o.id, { ...spot, it: o, id: o.id, head: false, of: spot });
      placed.push(spot);
    }
    // where each one goes on the open line: its stop
    const stopOf = new Map<string, SkyNode>();
    if (geo) for (const n of geo.nodes) for (const id of n.ids) stopOf.set(id, n);
    const tileG = el("g", {}, pathG);
    const topG = el("g", {}, svg);
    const stemG = el("g", { opacity: morphing ? "0.3" : "1" }, svg);
    svg.insertBefore(stemG, pathG);
    const drawn: { x: number; y: number; w: number; h: number; lane: number }[] = [];
    const nt = night;
    for (const [, tl] of tiles) {
      const head = tl.head ? tl : (tl.of as Tile);
      const n = stopOf.get(tl.it.id);
      let x = head.x;
      let y = head.y;
      let w = head.w;
      let hh = head.h;
      let a = 1;
      if (geo && k > 0) {
        if (n) {
          x = lerp(head.x, n.x, k);
          y = lerp(head.y, n.y, k);
          w = lerp(head.w, 30, k);
          hh = lerp(head.h, 30, k);
        } else a = 1 - k;
      }
      if (P === 0) a *= 1 - flat;
      if (a <= 0.01) continue;
      const fin = isFinished(tl.it, now);
      const lt = isLate(tl.it, now);
      if (tl.head && Math.hypot(head.x - head.ax, head.y - head.ay) > 6 && kc > 0)
        el(
          "line",
          {
            x1: head.ax.toFixed(1),
            y1: head.ay.toFixed(1),
            x2: head.x.toFixed(1),
            y2: head.y.toFixed(1),
            stroke: itemColor(tl.it),
            "stroke-width": 1.8,
            "stroke-opacity": (a * 0.8 * kc).toFixed(2),
          },
          stemG,
        );
      if (!tl.head && k < 0.5) continue;
      el(
        "rect",
        {
          x: (x - w / 2).toFixed(1),
          y: (y - hh / 2).toFixed(1),
          width: w.toFixed(1),
          height: hh.toFixed(1),
          rx: (hh * 0.34).toFixed(1),
          fill: nt ? "#14223b" : "#ffffff",
          stroke: lt ? "#ef4444" : itemColor(tl.it),
          "stroke-width": tl.it === nextIt ? 2.6 : 2,
          opacity: (a * (fin ? 0.8 : 1)).toFixed(3),
          filter: morphing ? "none" : "url(#dc-sh)",
        },
        tileG,
      );
      if (!tl.head) continue;
      drawn.push({ x, y, w, h: hh, lane: tl.lane });
      const eo = morphing ? 0.5 + 0.5 * Math.abs(1 - 2 * P) : 1;
      const tg = el("g", { opacity: (a * eo * (fin ? 0.82 : 1)).toFixed(3) }, topG);
      txt(tg, x - w / 2 + hh / 2, y + hh * 0.19, tl.it.icon, { "font-size": (hh * 0.52).toFixed(1) });
      if (withTime.has(tl.it.id) && w > hh + 8 && k < 0.5)
        txt(tg, x - w / 2 + hh - 1, y + hh * 0.15, fmt(tl.it.start), {
          "text-anchor": "start",
          "font-size": (hh * 0.31).toFixed(1),
          "font-weight": 650,
          fill: nt ? "#eef3fb" : "#0f1a2a",
          "font-family": "var(--font-geist-sans), system-ui, sans-serif",
        });
      if (tl.count) {
        const cx = x + w / 2 - 2;
        const cy = y - hh / 2 + 2;
        el("circle", { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 8.5, fill: nt ? "#e6edf8" : "#0f1a2a" }, tg);
        txt(tg, cx, cy + 3.6, `+${tl.count}`, {
          "font-size": 10,
          "font-weight": 700,
          fill: nt ? "#0f1a2a" : "#fff",
          "font-family": "var(--font-geist-sans), system-ui, sans-serif",
        });
      } else if (lt) {
        const cx = x + w / 2 - 2;
        const cy = y - hh / 2 + 2;
        el("circle", { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 7.5, fill: "#ef4444" }, tg);
        txt(tg, cx, cy + 3.5, "!", { "font-size": 10, "font-weight": 800, fill: "#fff", "font-family": "var(--font-geist-sans), system-ui, sans-serif" });
      } else if (fin) el("path", { d: starPath(x + w / 2 - 3, y - hh / 2 + 3, 5.5), fill: "#ffd166", stroke: "#f2a93b", "stroke-width": 0.8 }, tg);
    }
    // the rest of the line's stops rise out of the water as it pours (they become the line's own stops at the end)
    if (geo && P > 0 && !reduce)
      for (const n of geo.nodes) {
        if (n.ids.some((id) => tiles.has(id))) continue;
        const r = reveal(n.t);
        if (!r.vis || r.kk <= 0.02) continue;
        const y = lerp(hy, n.y, r.kk);
        const s = 30 * (0.3 + 0.7 * r.kk);
        const nn = stripDark(n.t, { inWeek: geo.inWeek, rise, set }) > 0.5;
        el(
          "rect",
          {
            x: (n.x - s / 2).toFixed(1),
            y: (y - s / 2).toFixed(1),
            width: s.toFixed(1),
            height: s.toFixed(1),
            rx: (s * 0.34).toFixed(1),
            fill: nn ? "#14223b" : "#ffffff",
            opacity: r.kk.toFixed(3),
          },
          tileG,
        );
        txt(topG, n.x, y + s * 0.19, n.icon, { "font-size": (s * 0.52).toFixed(1), opacity: r.kk.toFixed(3) });
      }

    // sunrise and sunset where Today's path meets the horizon
    if (kc > 0) {
      const o = kc * (1 - flat);
      const [lx] = closedPt(h.a);
      const [rx2] = closedPt(h.b);
      const yL = night ? g.hy - 30 : g.hy + 24;
      const ink = night ? "#eef3fb" : getComputedStyle(root).getPropertyValue("--text").trim() || "#0f1a2a";
      const end = (x: number, kind: "rise" | "set", s: string, anchor: "start" | "end") => {
        const eg = el("g", { opacity: o.toFixed(3) }, svg);
        sunGlyph(defs, eg, anchor === "start" ? x + 7 : x - 7, yL - 4, kind);
        txt(eg, anchor === "start" ? x + 19 : x - 19, yL, s, {
          "text-anchor": anchor,
          "font-size": 11.5,
          "font-weight": 600,
          fill: ink,
          opacity: 0.72,
          "font-family": "var(--font-geist-sans), system-ui, sans-serif",
        });
      };
      end(lx - 8, night ? "set" : "rise", night ? `Sunset ${fmt(set)}` : `Sunrise ${fmt(rise)}`, "start");
      end(rx2 + 8, night ? "rise" : "set", night ? `Sunrise ${fmt(rise)}` : `Sunset ${fmt(set)}`, "end");
    }

    // at night, what you finished today shines as stars; opening, each flies home to its stop
    if (night && P < 1) {
      const fin = timed.filter((it) => Math.floor(it.start / DAY) === h.d && isFinished(it, now));
      const sg = el("g", {}, svg);
      const top2 = Math.max(40, g.hy - 118);
      fin.forEach((it, i) => {
        const n = fin.length;
        const sx = 50 + ((i + 0.5) / n) * (W - 100) + ((i * 37) % 23) - 11;
        const sy = top2 + 22 + ((i * 53) % Math.max(20, g.hy - top2 - 62));
        const stop = stopOf.get(it.id);
        const tx = stop ? stop.x + 12 : sx;
        const ty = stop ? stop.y - 12 : sy;
        const kf = reduce ? 0 : E(seg(P, 0.15, 0.85));
        el(
          "path",
          {
            d: starPath(lerp(sx, tx, kf), lerp(sy, ty, kf), lerp(8.5, 5.5, kf)),
            fill: "#ffd166",
            stroke: "#f2a93b",
            "stroke-width": 0.8,
            opacity: ((1 - flat) * (stop || P === 0 ? 1 : 1 - P) * (reduce ? 1 - P : 1)).toFixed(3),
          },
          sg,
        );
      });
      if (fin.length)
        txt(sg, W / 2, top2 + 4, `${fin.length} star${fin.length === 1 ? "" : "s"} ${Math.floor(now / DAY) > h.d ? "yesterday" : "today"}`, {
          "font-size": 12.5,
          "font-weight": 650,
          fill: "#eef3fb",
          opacity: (kc * (1 - flat) * 0.85).toFixed(3),
          "font-family": "var(--font-geist-sans), system-ui, sans-serif",
        });
    }

    // the words sit under the horizon (under the valley at night)
    const bottom = night ? g.hy - g.ry : g.hy;
    words.style.top = `${bottom + (night ? 46 : 38)}px`;
    words.style.opacity = String(reduce ? 1 - P : kc);
    words.style.transform = `translateY(${(36 * eOut(seg(P, 0, 0.45))).toFixed(1)}px)`;
    words.style.visibility = P > 0.4 ? "hidden" : "visible";

    // ---- the companion on the path at now: the sun by day, the moon at night, asleep late at night; it stands on
    // the tile of what you're doing (or about to)
    const q = at(now) ?? [W / 2, hy, 1];
    const wx = q[0];
    let wy = q[1];
    for (const d of drawn)
      if (!d.lane && Math.abs(wx - d.x) < d.w / 2 + 4 && wy > d.y - d.h / 2 - 6 && wy < d.y + d.h / 2 + 26) wy = Math.min(wy, d.y - d.h / 2 + 1);
    el("circle", { cx: wx.toFixed(1), cy: (wy - 22).toFixed(1), r: night ? 56 : lerp(100, 62, k), fill: "url(#dc-glow)", opacity: fade.toFixed(3) }, glowAt);
    const mm = mod(now);
    pose = night && (mm >= 23 * 60 || mm < rise) ? "sleep" : reduce ? "stand" : "walk";
    who.style.transform = `translate(${(wx - 24).toFixed(1)}px, ${(wy - 41).toFixed(1)}px)`;
    who.style.opacity = String(fade);
    paintWho();
  }

  const onResize = () => last && draw(last);
  window.addEventListener("resize", onResize);
  return {
    draw,
    paintNow: paintWho,
    destroy() {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      delete html.dataset.sky;
    },
  };
}
