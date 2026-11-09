/**
 * The day clock's motion engine (docs/design/clock/spec.md; prototype docs/design/clock/prototype.html).
 * React renders the static skeleton (day-clock.tsx); this draws the face, the timeline and every frame of the
 * clock-to-timeline motion as a pure function of one progress value p (0 clock .. 1 timeline), so it can be
 * played, pulled, scrubbed and reversed. The liquid outline is a signed-distance field in a WebGL shader.
 * Colours come from the app's theme tokens; only transform and opacity animate outside the shader.
 */
import { isExam, pileOf, type ClockData, type ClockItem } from "@/lib/day-clock";
import { wheelR, type DomeFace, type DomeState } from "./dome";

type Pt = [number, number];
type Arc = { a: number; b: number; past: boolean; lap: number; els: SVGPathElement[] };
type Mark = {
  it: ClockItem;
  t: number;
  label: string;
  past: boolean;
  /** 0: the inner ring (the next 12 hours); 1: the outer ring (the 12 after). */
  lap: number;
  /** After tonight's midnight. */
  tmrw: boolean;
  a0: number;
  a: number;
  cx: number;
  cy: number;
  ix: number;
  iy: number;
  line: SVGLineElement | null;
  lab: HTMLElement | null;
  /** How many more things share this marker (within half an hour on the same ring). */
  more: number;
  /** Everything this marker stands for (itself first). */
  group: ClockItem[];
  /** A small second line under the label ("11:59 PM" under "9 assignments due tonight"). */
  sub?: string;
};
/** ws..we: the 12 hours ahead (from the hand); ps: where the faded past starts (ps <= ws). */
type ClockModel = { arcs: Arc[]; marks: Mark[]; ps: number; ws: number; we: number; mid: number | null; word: number; ahead: boolean };
/** A stop on the line: one thing, or a stack of things at the same moment (`group`, led by `it`). */
type Node = { id: string; it: ClockItem; group: ClockItem[] | null; t: number; past: boolean; x: number; el: HTMLButtonElement | null };
/** item: a thing; mid: a midnight in the week; mark: a month, a year or "Someday" further out; now: the now pill. */
type Stop = { t: number; kind: "item" | "mid" | "mark" | "now"; n?: Node; d?: number; label?: string; x: number };
type TrackModel = { nodes: Node[]; stops: Stop[]; total: number; nowX: number; nowEl: HTMLButtonElement | null; somedayX: number };
type Morph = { m: Mark; p0: Pt; p2: Pt; th0: number; r0: number; phiEnd: number; el: HTMLDivElement; dim: boolean; off: boolean; inCap: boolean };
type Tile = { it: ClockItem; icon: "work" | "class" | "due"; name: string; time: string; label: string; ahead?: boolean };
type Bubble = { x: number; y: number; r: number; ax: number; ay: number; tx: number; ty: number; nr: number };
type Goo = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hw: number;
  hh: number;
  s: number;
  items: Bubble[];
  col: number[];
  a: number;
  glow: number;
  fill: number;
};

export type DayClockOptions = {
  /** "Open" on a card: go to the page that owns the item. */
  onOpen: (href: string) => void;
  /** "Done" on a to-do's or an assignment's card. */
  onDone: (it: ClockItem) => void;
  /** "Edit" on an event's, a shift's or an assignment's card: its editor, in place. */
  onEdit: (it: ClockItem) => void;
  /**
   * Morrow's dome (owner, 2026-11-09): when given, Today's face is drawn by it instead of the clock, on every change
   * and every frame of opening and closing (it flattens onto the line while the timeline fades in).
   */
  face?: (state: DomeState) => void;
  /** The day turned over while the page was open: fetch fresh data. */
  onNewDay: () => void;
  /** A tap on an empty spot of the open line: pin something at that time (minutes from the start of today). */
  onPin: (at: { start: number }) => void;
  reducedMotion: boolean;
};

export type DayClockHandle = {
  update: (data: ClockData) => void;
  destroy: () => void;
  /** Where "Pin something" pins: the time in the middle of the line in view (never earlier than now, today). */
  pinTime: () => number;
};

const NS = "http://www.w3.org/2000/svg";
// How far tomorrow's ring sits outside the clock's own ring.
const LAP = 11;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const eIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
const eBack = (t: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const ePlay = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const dayOf = (t: number) => Math.floor(t / 1440);
const t0 = (it: ClockItem) => it.start;
function fmt(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
}
const fmtShort = (min: number) => fmt(min).replace(":00", "");
/** "$45", "$14.20". */
const money = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;
const ang = (min: number) => (((((min / 60) % 12) + 12) % 12) / 12) * Math.PI * 2;
const pol = (a: number, r: number): Pt => [r * Math.sin(a), -r * Math.cos(a)];
function arcPath(a1: number, a2: number, r: number) {
  if (a2 < a1) a2 += Math.PI * 2;
  const [x1, y1] = pol(a1, r);
  const [x2, y2] = pol(a2, r);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
function html<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Wall-clock minutes from the start of `today` in tz, read from the device clock. */
export function nowMinutes(tz: string, today: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((o, p) => ((o[p.type] = p.value), o), {});
  const date = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  const [y, m, d] = today.split("-").map(Number);
  const days = Math.round((date - Date.UTC(y, m - 1, d)) / 86_400_000);
  return days * 1440 + (+parts.hour % 24) * 60 + +parts.minute;
}

/** A theme colour as [r, g, b] in 0..1, read through the browser so any CSS colour works. */
function rgbOf(probe: HTMLElement, cssVar: string): number[] {
  probe.style.color = `var(${cssVar})`;
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ["0", "0", "0"];
  return m.slice(0, 3).map((v) => +v / 255);
}

const TILE_ICONS = {
  work: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="4.5" width="13" height="9.5" rx="2.2"/><path d="M5.5 4.5V3.3c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.2M1.5 8.6h13"/></svg>',
  class:
    '<svg viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M9 2 1.2 6 9 10l7.8-4L9 2z"/><path d="M4.6 8v3.4c1.7 1.6 7.1 1.6 8.8 0V8M16.8 6v4"/></svg>',
  due: '<svg viewBox="0 0 15 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2.5 15V1.8M2.5 2.4h9.2L9.6 5.8l2.1 3.4H2.5"/></svg>',
};

const FRAG = `precision highp float;
uniform vec2 uSize; uniform float uDpr;
uniform vec4 uBody; uniform vec2 uCap; uniform float uMorph;
uniform vec4 uBub[8]; uniform vec4 uNeck[8]; uniform float uNeckR[8]; uniform float uN;
uniform vec4 uStroke; uniform float uGlow; uniform float uFill; uniform vec3 uFillCol; uniform vec3 uGlowCol;
float sdE(vec2 p, vec2 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/max(k1,1e-4); }
float sdS(vec2 p, vec2 h){ float a = max(h.x-h.y,0.0); p.x = max(abs(p.x)-a,0.0); return length(p)-h.y; }
float sdSeg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.0,1.0); return length(pa-ba*h)-r; }
float smin(float a, float b, float k){ float h=max(k-abs(a-b),0.0)/k; return min(a,b)-h*h*k*0.25; }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uSize.y*uDpr - gl_FragCoord.y)/uDpr;
  vec2 q = p - uBody.xy;
  float d = mix(sdE(q, uBody.zw), sdS(q, uCap), uMorph);
  float db = 1e5;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uN) break;
    float nr = uNeckR[i];
    if (nr > 0.05) d = smin(d, sdSeg(p, uNeck[i].xy, uNeck[i].zw, nr), 16.0);
    float r = uBub[i].z;
    if (r > 0.05) { float bi = length(p-uBub[i].xy)-r; db = min(db, bi); d = smin(d, bi, 12.0); }
  }
  float aa = 0.8/uDpr + 0.35;
  float line = 1.0 - smoothstep(1.0-aa, 1.0+aa, abs(d));
  float glow = exp(-abs(d)/8.0) * uGlow;
  float fill = (1.0 - smoothstep(-0.8, 0.8, db)) * uFill;
  float la = line*uStroke.a;
  vec3 col = uFillCol*fill*(1.0-la) + uStroke.rgb*la + uGlowCol*glow*(1.0-la);
  float al = max(fill*(1.0-la) + la, glow);
  gl_FragColor = vec4(col, al);
}`;

export function createDayClock(root: HTMLElement, initial: ClockData, opts: DayClockOptions): DayClockHandle {
  const reduce = opts.reducedMotion;
  const domeMode = !!opts.face;
  let FACE: DomeFace = { tag: "", text: "", stats: [] };
  // The wheel (dome mode): the time on top is now while it follows, or wherever it was turned to. The line's x for a
  // time on the open timeline lets the wheel unroll exactly onto it.
  const drawDome = () =>
    opts.face?.({
      p: S.p,
      now: S.now,
      view: S.follow ? S.now : S.view,
      data,
      items: DATED,
      face: FACE,
      lineY: G.lineY,
      lineX: (t: number) => xAt(t) - G.home,
    });
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>("[data-dc=goo]");
  const faceSvg = $<SVGSVGElement>("[data-dc=face]");
  const faceG = $<SVGGElement>("[data-dc=faceG]");
  const rimC = $<SVGPathElement>("[data-dc=rim]");
  const arcsG = $<SVGGElement>("[data-dc=arcs]");
  const ticksG = $<SVGGElement>("[data-dc=ticks]");
  const dayG = $<SVGGElement>("[data-dc=day]");
  const handsG = $<SVGGElement>("[data-dc=hands]");
  const hourH = $<SVGLineElement>("[data-dc=hour]");
  const minH = $<SVGLineElement>("[data-dc=minute]");
  const hubC = $<SVGCircleElement>("[data-dc=hub]");
  const stepsG = $<SVGGElement>("[data-dc=steps]");
  const pressG = $<SVGGElement>("[data-dc=press]");
  const haloC = $<SVGCircleElement>("[data-dc=halo]");
  const leaders = $<SVGGElement>("[data-dc=leaders]");
  const callouts = $("[data-dc=callouts]");
  const micons = $("[data-dc=micons]");
  const hit = $("[data-dc=hit]");
  const hint = $("[data-dc=hint]");
  const foot = $("[data-dc=foot]");
  const hintWrap = $("[data-dc=hintWrap]");
  const pinbar = $("[data-dc=pinbar]");
  const sub = $("[data-dc=sub]");
  const todayBtn = $<HTMLButtonElement>("[data-dc=today]");
  const backBtn = root.querySelector<HTMLButtonElement>("[data-dc=back]");
  const daysNav = $("[data-dc=days]");
  const chips = $("[data-dc=chips]");
  const trackWrap = $("[data-dc=trackWrap]");
  const track = $("[data-dc=track]");
  const detail = $("[data-dc=detail]");
  const hap = $<HTMLLabelElement>("[data-dc=hap]");
  const probe = $("[data-dc=probe]");

  let data = initial;
  let ITEMS: ClockItem[] = data.items;
  // The clock, its face and the tiles see only dated things; the undated wait on the line under "Someday".
  let DATED = ITEMS.filter((it) => !it.someday);
  const S = {
    now: nowMinutes(data.tz, data.today),
    p: 0,
    press: 0,
    open: false,
    anim: null as { id: number } | null,
    day: 0,
    sel: null as string | null,
    pressAnim: 0,
    dirty: false,
    // the wheel: the time on top (minutes from the start of today) and whether it follows now
    view: 0,
    follow: true,
    spin: 0,
  };
  const G = {
    W: 0,
    H: 0,
    R: 0,
    cx: 0,
    cy: 0,
    subY: 0,
    lineY: 0,
    wrapTop: 0,
    iconY: 0,
    chipY: 0,
    detailY: 0,
    ycap: 0,
    capHW: 0,
    capHH: 56,
    turn: 0,
    home: 0,
    wrapSl: null as number | null,
    rimFill: 1,
    hintHidden: false,
  };
  let CM: ClockModel = { arcs: [], marks: [], ps: 0, ws: 0, we: 720, mid: null, word: 0, ahead: false };
  let TM: TrackModel = { nodes: [], stops: [], total: 0, nowX: 0, nowEl: null, somedayX: Infinity };
  let MAP: Morph[] = [];
  const COL = { accent: [0.5, 0.88, 0.68], grey: [0.23, 0.24, 0.23], fill: [0.07, 0.08, 0.08] };
  // Listeners on long-lived elements and the document; ones on elements the engine redraws go away with them.
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    el: EventTarget,
    type: K | string,
    fn: (e: HTMLElementEventMap[K]) => void,
    o?: AddEventListenerOptions | boolean,
  ) => {
    el.addEventListener(type, fn as EventListener, o);
    cleanups.push(() => el.removeEventListener(type, fn as EventListener, o));
  };

  const dayInfo = (d: number) => data.days.find((x) => x.offset === d);
  const dayName = (d: number) => dayInfo(d)?.short ?? "";
  const dayLong = (d: number) => dayLongOf(d);
  function dayLongOf(d: number) {
    const info = dayInfo(d);
    if (info) return info.long;
    const [y, m, dd] = data.today.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, dd + d));
    const name = at.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
    return at.getUTCFullYear() === y ? name : `${name}, ${at.getUTCFullYear()}`;
  }
  const minDay = () => data.days[0]?.offset ?? 0;
  const maxDay = () => data.days[data.days.length - 1]?.offset ?? 0;
  const timeOf = (it: ClockItem) => (it.allDay ? (it.kind === "due" ? "Due" : "All day") : fmt(it.start));
  // what a money thing says beside its name: a bill due, a trial's first charge, pay expected (never counted), a money goal
  const billOf = (it: ClockItem) => {
    if (it.amountCents == null) return null;
    const m = money(it.amountCents);
    return it.origin === "pay" ? `${m} expected` : it.origin === "trial" ? `then ${m}` : it.origin === "money_goal" ? `${m} goal` : `${m} due`;
  };
  // a day in words from anywhere on the line: "today", "tomorrow", "Wed", "Nov 29", "Apr 7, 2027"
  const dayShort = (d: number) => (dayInfo(d) ? dayName(d) : dayLongOf(d));
  const dayWord = (d: number) => (d === dayOf(S.now) ? "today" : d === dayOf(S.now) + 1 ? "tomorrow" : dayShort(d));
  // when things pile up, the one that leads: a block of time, an exam, a deadline, a reminder or a plan, money, the rest
  const weight = (it: ClockItem) =>
    it.end != null
      ? 5
      : isExam(it)
        ? 4
        : it.origin === "assignment" || it.origin === "task"
          ? 3
          : it.origin === "reminder" || it.origin === "event"
            ? 2
            : it.amountCents != null
              ? 1
              : 0;
  const nodeName = (it: ClockItem) =>
    it.amountCents != null
      ? `${it.title} · ${billOf(it)}`
      : it.kind === "due" && !it.someday && (it.origin === "task" || it.origin === "assignment") && !isExam(it)
        ? `${it.title} due`
        : it.title;

  /* ---------- haptics: native vibration where it exists, the iOS 18 switch tap where it doesn't ---------- */
  function haptic(ms: number) {
    try {
      if (navigator.vibrate && navigator.vibrate(ms)) return;
    } catch {
      /* not supported */
    }
    try {
      hap.click();
    } catch {
      /* not available */
    }
  }

  /* ---------- theme ---------- */
  function readTheme() {
    COL.accent = rgbOf(probe, "--accent");
    const text = rgbOf(probe, "--text");
    const bg = rgbOf(probe, "--bg");
    COL.grey = text.map((v, i) => lerp(bg[i], v, 0.22));
    COL.fill = rgbOf(probe, "--surface");
  }

  /* ---------- geometry ---------- */
  function layout() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    G.W = W;
    G.H = H;
    G.subY = 0;
    G.lineY = 140;
    G.wrapTop = G.lineY - 70;
    G.iconY = G.lineY - 34;
    G.chipY = G.lineY + 92;
    G.detailY = G.chipY + 58 + 16;
    // The foot (the assistant's line) sits under the clock while it's closed; the face shares what's left.
    const footH = foot.offsetHeight ? foot.offsetHeight + 16 : 0;
    // The face takes the room between "Today" and the foot, less what the markers need above and below it.
    const avail = H - 50 - footH;
    G.R = Math.round(Math.max(70, Math.min(W * 0.28, 120, (avail - 150) / 2)));
    G.cx = W / 2;
    G.cy = Math.round(50 + avail / 2 + 2);
    G.ycap = G.lineY - 12;
    G.capHW = Math.min(W / 2 - 14, 420);
    sub.style.top = `${G.subY}px`;
    chips.style.top = `${G.chipY}px`;
    trackWrap.style.top = `${G.wrapTop}px`;
    detail.style.top = `${G.detailY}px`;
    pinbar.style.top = `${G.detailY}px`;
    hintWrap.style.top = `${G.detailY + 62}px`;
    // "Tap the clock" sits under the face, above the foot; with no room between the markers and the foot it steps out.
    const hintTop = Math.min(G.cy + G.R + 66, H - footH - 18);
    hint.style.top = `${hintTop}px`;
    hint.hidden = hintTop < G.cy + G.R + 50;
    G.hintHidden = hint.hidden;
    const hr = G.R + 54;
    Object.assign(hit.style, { left: `${G.cx - hr}px`, top: `${G.cy - hr}px`, width: `${hr * 2}px`, height: `${hr * 2}px` });
    // the dome draws Today itself: the clock's own layers step aside, and the whole sky is the place to tap
    if (domeMode) {
      for (const e of [canvas, faceSvg, callouts, micons, hint] as (HTMLElement | SVGSVGElement)[]) e.style.display = "none";
      Object.assign(hit.style, { left: "0px", top: "48px", width: `${W}px`, height: `${Math.round(H * 0.62)}px`, borderRadius: "28px" });
    }
    faceSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    faceSvg.setAttribute("width", String(W));
    faceSvg.setAttribute("height", String(H));
    glResize();
    buildStatic();
    rebuild();
  }

  function buildStatic() {
    const R = G.R;
    haloC.setAttribute("r", String(R));
    for (const c of pressG.querySelectorAll("circle")) c.setAttribute("r", String(R * 0.56));
    ticksG.textContent = "";
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      if (h % 3 === 0) {
        const [x, y] = pol(a, R - 27);
        const t = svg("text", { x: x.toFixed(1), y: (y + 6).toFixed(1), "text-anchor": "middle", class: "dc-num" }, ticksG);
        t.textContent = String(h);
      } else {
        const [x1, y1] = pol(a, R - 12);
        const [x2, y2] = pol(a, R - 19);
        svg("line", { x1, y1, x2, y2, class: "dc-tick" }, ticksG);
      }
    }
  }

  /* ---------- the clock: the next 24 hours, from the hand ---------- */
  // Inner ring: the next 12 hours. Outer ring: the 12 after. Every spot on the face holds the next time the hand reaches
  // it (inside) and the time after that (outside), so the clock rolls as the day goes: once 1 PM is done, the 1 o'clock
  // spot holds 1 AM, tinted and marked as tomorrow (owner, 2026-11-08: "it shows the 24 hours after... as he completes
  // 1:00, it goes to showing 1:00 am, but it's obvious"). It starts wherever the hand is when the person opens it.
  const MAX_MARKS = 6;
  function pickClock(now: number) {
    return clockModel(now);
  }
  function clockModel(now: number): ClockModel {
    const ws = now;
    const we = now + 1440;
    const half = now + 720;
    const mid = (dayOf(now) + 1) * 1440;
    const ringOf = (t: number) => (t < half ? 0 : 1);
    const arcs: Arc[] = [];
    let marks: Mark[] = [];
    const mark = (it: ClockItem, t: number, label: string): Mark => ({
      it,
      t,
      label,
      past: false,
      lap: 0,
      tmrw: false,
      a0: 0,
      a: 0,
      cx: 0,
      cy: 0,
      ix: 0,
      iy: 0,
      line: null,
      lab: null,
      more: 0,
      group: [it],
    });
    const arc = (a: number, b: number) => arcs.push({ a, b, past: false, lap: 0, els: [] });
    for (const it of DATED) {
      // a to-do or an assignment still open after its time belongs to now: one "overdue" marker at the hand
      if ((it.origin === "task" || it.origin === "assignment") && t0(it) + (it.allDay ? 1439 : 0) < now) {
        marks.push(mark(it, now + 1, "overdue"));
        continue;
      }
      if (it.allDay && it.origin === "event") {
        // an all-day plan (a birthday, a trip): at the hand while it's today, at midnight when it's tomorrow
        if (dayOf(it.start) < dayOf(now) || it.start > we) continue;
        marks.push(mark(it, Math.max(it.start, now + 1), "all day"));
        continue;
      }
      if (it.allDay) {
        // an all-day deadline or bill is due by the end of its day (a milestone already happened: it lives on the line)
        if (it.kind !== "due" || it.origin === "milestone") continue;
        const t = dayOf(it.start) * 1440 + 1439;
        if (t < now || t > we) continue;
        const what = it.amountCents != null ? money(it.amountCents) : it.origin === "goal" || it.origin === "money_goal" ? "goal" : null;
        marks.push(mark(it, t, what ?? (dayOf(t) === dayOf(now) ? "tonight" : "all day")));
        continue;
      }
      if (it.end != null) {
        if (it.end <= now || it.start >= we) continue;
        const s = Math.max(it.start, now);
        const e = Math.min(it.end, we);
        // one piece per ring: a block that runs past the 12-hour seam continues on the outer ring
        if (s < half && e > half) {
          arc(s, half);
          arc(half, e);
        } else arc(s, e);
        if (it.start >= now) marks.push(mark(it, it.start, fmt(it.start)));
        else marks.push(mark(it, (now + Math.min(e, half)) / 2, `till ${fmtShort(it.end)}`));
      } else {
        if (it.start < now || it.start > we) continue;
        marks.push(mark(it, it.start, it.amountCents != null ? money(it.amountCents) : fmt(it.start)));
      }
    }
    // Things within half an hour of each other on the same ring are one marker: the one that matters most leads and
    // "+2" says the rest (five deadlines at 11:59 PM read as one), so the rim never fills with leader lines.
    marks.sort((a, b) => a.t - b.t);
    marks = marks.reduce<Mark[]>((out, m) => {
      const last = out[out.length - 1];
      if (!last || ringOf(m.t) !== ringOf(last.t) || m.t - last.t >= 30 || (m.label === "overdue") !== (last.label === "overdue")) out.push(m);
      else {
        last.more += 1;
        last.group.push(m.it);
        if (weight(m.it) > weight(last.it)) Object.assign(last, { it: m.it, label: m.label });
      }
      return out;
    }, []);
    for (const m of marks) {
      const pile = pileOf(m.group);
      if (!pile) continue;
      const at = m.group[0];
      const same = m.group.every((x) => x.start === at.start && x.allDay === at.allDay);
      m.more = 0;
      const tonight = dayOf(at.start) === dayOf(now) && (at.allDay || at.start % 1440 >= 17 * 60);
      // "5 assignments" over "11:59 PM": what and when, nothing else
      if (m.label === "overdue") m.sub = "overdue";
      else if (same) m.sub = at.allDay ? (tonight ? "tonight" : "all day") : fmt(at.start);
      m.label = pile;
    }
    // A very full day keeps a mix: the soonest of each kind first (a block of time, a deadline, a plan, money, a goal),
    // then the next of each, so one kind can never fill the clock. Every busy stretch still shows as an arc.
    if (marks.length > MAX_MARKS) {
      const kindOf = (m: Mark) => weight(m.it);
      const byKind = new Map<number, Mark[]>();
      for (const m of [...marks].sort((a, b) => a.t - b.t)) byKind.set(kindOf(m), [...(byKind.get(kindOf(m)) ?? []), m]);
      const keep: Mark[] = [];
      for (let round = 0; keep.length < MAX_MARKS; round++) {
        let added = false;
        for (const list of byKind.values())
          if (list[round] && keep.length < MAX_MARKS) {
            keep.push(list[round]);
            added = true;
          }
        if (!added) break;
      }
      marks = keep;
    }
    for (const m of marks) {
      m.lap = ringOf(m.t);
      m.tmrw = m.t >= mid;
    }
    // "TOMORROW" is written outside the rings from midnight on; markers keep clear of it.
    const word = 0.8;
    const am = ang(mid);
    // Spread markers so they never overlap; the hairline still points at the real time. The word holds its place.
    type Slot = { a: number; fixed: boolean; room: boolean; m?: Mark };
    marks.forEach((m) => {
      m.a0 = ang(m.t);
      m.a = m.a0;
    });
    const slots: Slot[] = marks.map((m) => ({ a: m.a, fixed: false, room: false, m }));
    slots.push({ a: (am + 0.07 + word / 2) % (Math.PI * 2), fixed: true, room: true });
    slots.sort((x, y) => x.a - y.a);
    for (let k = 0; k < 60 && slots.length > 1; k++) {
      let moved = false;
      for (let i = 0; i < slots.length; i++) {
        const A = slots[i];
        const B = slots[(i + 1) % slots.length];
        let d = B.a - A.a;
        if (i === slots.length - 1) d += Math.PI * 2;
        const need = A.room || B.room ? 0.74 : 0.46;
        if (d < need) {
          const push = ((need - d) / 2) * 0.6;
          if (A.fixed) B.a += push * 2;
          else if (B.fixed) A.a -= push * 2;
          else {
            A.a -= push;
            B.a += push;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const s of slots) if (s.m) s.m.a = s.a;
    for (const a of arcs) a.lap = ringOf(a.a);
    return { arcs, marks, ps: now, ws, we, mid, word, ahead: false };
  }

  // Inside the face: what's happening now (or next), and today's numbers. Only what the person's data says.
  // The small line says when ("NOW · TILL 10", "NEXT · 9 AM", "TOMORROW · 8 AM"); the big line is just the name.
  function faceNow(now: number, we: number) {
    const live = DATED.find((it) => !it.allDay && it.end != null && it.start <= now && it.end > now);
    if (live) {
      const e = live.end ?? now;
      const end = fmt(e).slice(-2) === fmt(now).slice(-2) ? fmtShort(e).slice(0, -3) : fmtShort(e);
      return { tag: `Now · till ${end}`, text: live.title, it: live };
    }
    const next = DATED.filter((it) => !it.allDay && it.start > now && it.start <= we).sort((a, b) => a.start - b.start)[0];
    if (next) {
      const pile = pileOf(DATED.filter((it) => !it.allDay && it.start === next.start));
      return { tag: `${dayOf(next.start) > dayOf(now) ? "Tomorrow" : "Next"} · ${fmtShort(next.start)}`, text: pile ? `${pile} due` : next.title, it: next };
    }
    // Nothing in the next 24 hours: the next thing on the calendar, whenever it is (a deadline counts by its day).
    const later = DATED.filter((it) => (it.allDay ? (dayOf(it.start) + 1) * 1440 : it.start) > now).sort((a, b) => a.start - b.start)[0];
    if (later) {
      const d = dayOf(later.start);
      const when = later.allDay ? (billOf(later) ?? (later.origin === "goal" ? "goal" : "due")) : fmtShort(later.start);
      const day = d === dayOf(now) ? "Later" : d === dayOf(now) + 1 ? "Tomorrow" : dayLong(d).split(",")[0];
      return { tag: `${day} · ${when}`, text: later.title, it: later };
    }
    // Truly nothing ahead this week: say so, plainly, instead of an empty face.
    return { tag: "Next 3 days", text: "Nothing planned yet", it: null };
  }
  function faceStats() {
    const first: string[] = [];
    if (data.steps != null) first.push(`${data.steps.toLocaleString("en-US")} steps`);
    if (data.sleepHours != null) first.push(`${Math.floor(data.sleepHours)}h ${String(Math.round((data.sleepHours % 1) * 60)).padStart(2, "0")}m sleep`);
    const lines = first.length ? [first.join(" · ")] : [];
    if (data.spentTodayCents != null) lines.push(`${money(data.spentTodayCents)} spent today`);
    if (!lines.length) {
      // Nothing measured today: the next three days, counted from the calendar ("3 classes · 2 shifts · 4 due").
      const soon = DATED.filter((it) => it.start >= S.now - (S.now % 1440) && it.start < (dayOf(S.now) + 3) * 1440 && (it.end ?? it.start + 1) > S.now);
      const n = (cat: string) => soon.filter((it) => it.cat === cat).length;
      const parts = [
        [n("class"), "class", "classes"],
        [n("work"), "shift", "shifts"],
        [n("due"), "due", "due"],
      ]
        .filter(([c]) => (c as number) > 0)
        .map(([c, one, many]) => `${c} ${c === 1 ? one : many}`);
      const other = soon.filter((it) => it.cat === "other").length;
      if (other) parts.push(`${other} more`);
      if (parts.length) lines.push(`Next 3 days: ${parts.join(" · ")}`);
      else {
        // nothing in the next days either: what the line holds, so the face still speaks for the person's life
        const c = (f: (it: ClockItem) => boolean) => ITEMS.filter(f).length;
        const on = [
          [c((it) => it.origin === "task"), "to-do", "to-dos"],
          [c((it) => it.origin === "goal" || it.origin === "money_goal"), "goal", "goals"],
          [c((it) => it.origin === "milestone"), "milestone", "milestones"],
        ]
          .filter(([k]) => (k as number) > 0)
          .map(([k, one, many]) => `${k} ${k === 1 ? one : many}`);
        if (on.length) lines.push(`On your line: ${on.join(" · ")}`);
      }
    }
    return lines;
  }

  function rebuildClock() {
    const R = G.R;
    const now = S.now;
    CM = pickClock(now);
    const ha = ang(now);
    const ma = ((now % 60) / 60) * Math.PI * 2;
    const [hx, hy] = pol(ha, R * 0.47);
    const [mx, my] = pol(ma, R * 0.8);
    const [tx, ty] = pol(ma + Math.PI, R * 0.09);
    for (const [k, v] of Object.entries({ x1: 0, y1: 0, x2: hx, y2: hy })) hourH.setAttribute(k, String(v));
    for (const [k, v] of Object.entries({ x1: tx, y1: ty, x2: mx, y2: my })) minH.setAttribute(k, String(v));
    // Two rings: the clock's own (the next 12 hours) and, just outside it, the 12 after. A short step at the hand joins
    // them (round once inside, step out, round again). Tomorrow's stretch is tinted from midnight on, with a tick and
    // the word TOMORROW where it starts, on whichever ring midnight falls.
    const circle = (r: number) => `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}`;
    const r2 = R + LAP;
    rimC.setAttribute("d", circle(R));
    dayG.textContent = "";
    svg("path", { d: circle(r2), class: "dc-outer-ring" }, dayG);
    const ah = ang(now);
    if (CM.mid != null) {
      const am = ang(CM.mid);
      const onInner = CM.mid < now + 720;
      // tomorrow's part of the rings, faintly in the accent: midnight to the seam inside and all of the outer ring, or
      // midnight to the seam on the outer ring only
      if (onInner) {
        svg("path", { d: arcPath(am, ah, R), class: "dc-tmrw-track" }, dayG);
        svg("path", { d: circle(r2), class: "dc-tmrw-track" }, dayG);
      } else svg("path", { d: arcPath(am, ah, r2), class: "dc-tmrw-track" }, dayG);
      const rm = onInner ? R : r2;
      const [tx1, ty1] = pol(am, rm - 5);
      const [tx2, ty2] = pol(am, rm + 5);
      svg("line", { x1: tx1, y1: ty1, x2: tx2, y2: ty2, class: "dc-step" }, dayG);
      const rt = r2 + 8;
      const [px, py] = pol(am + 0.07, rt);
      const [qx, qy] = pol(am + 0.07 + CM.word, rt);
      svg("path", { id: "dc-tmrw", d: `M${px.toFixed(2)} ${py.toFixed(2)}A${rt} ${rt} 0 0 1 ${qx.toFixed(2)} ${qy.toFixed(2)}`, fill: "none" }, dayG);
      const t = svg("text", { class: "dc-word" }, dayG);
      svg("textPath", { href: "#dc-tmrw" }, t).textContent = "TOMORROW";
    }
    // the seam at the hand: where the next 12 hours end and the 12 after begin
    const [h1x, h1y] = pol(ah, R);
    const [h2x, h2y] = pol(ah, r2);
    svg("line", { x1: h1x, y1: h1y, x2: h2x, y2: h2y, class: "dc-seam" }, dayG);
    arcsG.textContent = "";
    for (const a of CM.arcs) {
      const d = arcPath(ang(a.a), ang(a.b), R + a.lap * LAP);
      // the 12 after (outer ring) is quieter than the 12 coming
      const op = a.past ? 0.32 : a.lap ? 0.62 : 1;
      a.els = [];
      if (!a.past && !a.lap) a.els.push(svg("path", { d, class: "dc-arc-glow", opacity: op * 0.55, filter: "url(#dc-soft)" }, arcsG));
      a.els.push(svg("path", { d, class: "dc-arc", opacity: op }, arcsG));
    }
    G.rimFill = 1;
    // Inside the face: what's happening now (or next) at the top, today's numbers at the bottom. Never a made-up number.
    stepsG.textContent = "";
    const fn = faceNow(now, CM.we);
    const maxChars = Math.max(11, Math.floor(R * 0.2));
    const cut = (x: string) => (x.length > maxChars ? `${x.slice(0, maxChars - 1).trimEnd()}…` : x);
    if (fn) {
      // between the 12 and the hub, clear of both
      const y = -R * 0.27;
      svg("text", { x: 0, y: y - 14, "text-anchor": "middle", class: "dc-face-tag" }, stepsG).textContent = fn.tag;
      svg("text", { x: 0, y, "text-anchor": "middle", class: "dc-face-now" }, stepsG).textContent = cut(fn.text);
    }
    const stats = faceStats();
    FACE = { tag: fn?.tag ?? "", text: fn?.text ?? "", stats };
    stats.forEach((line, i) => {
      svg("text", { x: 0, y: R * 0.3 + i * 14, "text-anchor": "middle", class: "dc-steps" }, stepsG).textContent = line;
    });
    // markers: a hairline and one line of text (icons live in the morph layer)
    leaders.textContent = "";
    callouts.textContent = "";
    for (const m of CM.marks) {
      const u: Pt = [Math.sin(m.a), -Math.cos(m.a)];
      const lab = html("div", m.lap ? "dc-co dc-later" : "dc-co", callouts);
      lab.textContent = m.label;
      if (m.more) html("b", "dc-more", lab).textContent = `+${m.more}`;
      if (m.sub) html("span", "dc-co-sub", lab).textContent = m.sub;
      if (m.tmrw) lab.classList.add("dc-tmrw");
      const w = lab.offsetWidth;
      // the icon (about 30 px) sits above the label; the pair is the box that must clear the rings
      const sup = (Math.abs(u[0]) * Math.max(66, w)) / 2 + (Math.abs(u[1]) * Math.max(50, lab.offsetHeight + 30)) / 2;
      const rc = R + 14 + sup + m.lap * LAP;
      m.cx = clamp(G.cx + u[0] * rc, w / 2 + 8, G.W - w / 2 - 8);
      m.cy = G.cy + u[1] * rc;
      m.ix = m.cx;
      m.iy = m.cy - 9;
      const [lx1, ly1] = pol(m.a0, R + 5 + m.lap * LAP);
      const dx0 = m.cx - G.cx;
      const dy0 = m.cy - G.cy;
      const dl = Math.hypot(dx0, dy0) || 1;
      const ex = m.cx - (dx0 / dl) * (sup + 3);
      const ey = m.cy - (dy0 / dl) * (sup + 3);
      m.line = svg("line", { x1: G.cx + lx1, y1: G.cy + ly1, x2: ex, y2: ey, class: "dc-leader" }, leaders);
      lab.style.transform = `translate(${(m.cx - w / 2).toFixed(1)}px, ${(m.cy + 9).toFixed(1)}px)`;
      m.lab = lab;
    }
    // "Tap the clock" steps out when a marker's label sits where it would go
    const hintTop = parseFloat(hint.style.top) || 0;
    const hw = hint.textContent ? hint.textContent.length * 3.4 : 0;
    hint.hidden =
      G.hintHidden || CM.marks.some((m) => m.lab && m.cy + 9 + m.lab.offsetHeight + 4 > hintTop && Math.abs(m.cx - G.cx) < hw + m.lab.offsetWidth / 2);
    const next = DATED.filter((it) => !it.allDay && t0(it) > now).sort((a, b) => t0(a) - t0(b))[0];
    hit.setAttribute(
      "aria-label",
      `Today. Now ${fmt(now)}.${fn ? ` ${fn.tag}: ${fn.text}.` : next ? ` Next: ${next.title} at ${fmt(t0(next))}${dayOf(t0(next)) > dayOf(now) ? " tomorrow" : ""}.` : ""}${
        stats.length ? ` ${stats.join(". ")}.` : ""
      } Open your day as a timeline.`,
    );
    drawDome();
  }

  /* ---------- the line through the week ---------- */
  // The line is the whole timeline: the week day by day, and beyond it months and years marked once each, so long empty
  // stretches stay short (a gap is never more than ~126 px). Undated things wait at the far end, under "Someday".
  const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function eraOf(d: number) {
    const [y, m, dd] = data.today.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, dd + d));
    const yr = at.getUTCFullYear();
    if (Math.abs(yr - y) > 1) return String(yr);
    return yr === y ? MO[at.getUTCMonth()] : `${MO[at.getUTCMonth()]} ${yr}`;
  }
  // Things at the same moment in the week, or on the same day further out, are one stop: the one that matters most
  // leads with "+2", and its card lists them all. However full a life gets, the line stays one calm row.
  const nodeFor = (group: ClockItem[], t: number, now: number): Node => {
    const it = group.reduce((a, b) => (weight(b) > weight(a) ? b : a));
    const past = group.every((g) => (g.end ?? g.start) <= now && t0(g) <= now) && !it.someday;
    return { id: group.length > 1 ? `stack:${group[0].id}` : it.id, it, group: group.length > 1 ? group : null, t, past, x: 0, el: null };
  };
  /** The day "in view" while Someday is: no day is lit and there are no tiles. */
  const SOMEDAY = 1e6;
  const nodeOf = (id: string | null) => (id ? TM.nodes.find((n) => n.id === id || n.it.id === id || n.group?.some((g) => g.id === id)) : undefined);
  function trackModel(now: number): TrackModel {
    const inWeek = (d: number) => d >= minDay() && d <= maxDay();
    const slot = (it: ClockItem) => (inWeek(dayOf(t0(it))) ? `t${t0(it)}` : `d${dayOf(t0(it))}`);
    const nodes: Node[] = [];
    let group: ClockItem[] = [];
    for (const it of ITEMS.filter((x) => !x.someday).sort((x, y) => t0(x) - t0(y))) {
      if (group.length && slot(group[0]) !== slot(it)) {
        nodes.push(nodeFor(group, t0(group[0]), now));
        group = [];
      }
      group.push(it);
    }
    if (group.length) nodes.push(nodeFor(group, t0(group[0]), now));
    const stops: Stop[] = nodes.map((n) => ({ t: n.t, kind: "item" as const, n, x: 0 }));
    for (let d = minDay(); d <= maxDay() + 1; d++) stops.push({ t: d * 1440, kind: "mid", d, x: 0 });
    // a month (or year) mark before the first thing in it, outside the week
    let era = "";
    for (const n of nodes) {
      const d = dayOf(n.t);
      if (inWeek(d)) {
        era = "";
        continue;
      }
      const e = eraOf(d);
      if (e !== era) stops.push({ t: n.t - 0.5, kind: "mark", label: e, x: 0 });
      era = e;
    }
    stops.push({ t: now, kind: "now", x: 0 });
    const ord = { mid: 0, mark: 0, item: 1, now: 2 };
    stops.sort((a, b) => a.t - b.t || ord[a.kind] - ord[b.kind]);
    const gap = (a: Stop, b: Stop) => {
      const dt = b.t - a.t;
      if (a.kind === "mark" || b.kind === "mark") return 58;
      // tonight's midnight carries the word "Tomorrow", so it gets room for it either side, and more beside the now pill
      if (a.kind === "mid" || b.kind === "mid") {
        const next = (a.kind === "mid" ? a : b).d === dayOf(now) + 1;
        const base = next ? (a.kind === "now" || b.kind === "now" ? 108 : 66) : 44;
        return base + clamp(((dt - 120) / 60) * 4, 0, 26);
      }
      if (a.kind === "now" || b.kind === "now") return 66 + clamp(((dt - 60) / 60) * 5, 0, 24);
      return 96 + clamp(((dt - 180) / 60) * 6, 0, 30);
    };
    const pad = G.W / 2;
    let x = pad;
    stops.forEach((st, i) => {
      if (i) x += gap(stops[i - 1], st);
      st.x = x;
    });
    // Someday: the undated, in a row at the very end (their times are only places on the line, never shown); past the
    // first seven, the rest wait in one stack
    const later = ITEMS.filter((it) => it.someday);
    let somedayX = Infinity;
    if (later.length) {
      let t = stops[stops.length - 1].t + 1;
      x += 70;
      somedayX = x;
      stops.push({ t, kind: "mark", label: "Someday", x });
      const rows = later.length > 8 ? [...later.slice(0, 7).map((it) => [it]), later.slice(7)] : later.map((it) => [it]);
      for (const g of rows) {
        t += 1;
        x += 96;
        const n = { ...nodeFor(g, t, now), x };
        nodes.push(n);
        stops.push({ t, kind: "item", n, x });
      }
    }
    for (const st of stops) if (st.n) st.n.x = st.x;
    return { nodes, stops, total: x + pad, nowX: stops.find((st) => st.kind === "now")?.x ?? pad, nowEl: null, somedayX };
  }
  function xAt(t: number) {
    const st = TM.stops;
    if (t <= st[0].t) return st[0].x - (st[0].t - t) * 0.5;
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i];
      const b = st[i + 1];
      if (t >= a.t && t <= b.t) return b.t === a.t ? a.x : a.x + ((t - a.t) / (b.t - a.t)) * (b.x - a.x);
    }
    const l = st[st.length - 1];
    return l.x + (t - l.t) * 0.5;
  }
  function tAt(x: number) {
    const st = TM.stops;
    if (x <= st[0].x) return st[0].t;
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i];
      const b = st[i + 1];
      if (x >= a.x && x <= b.x) return b.x === a.x ? a.t : a.t + ((x - a.x) / (b.x - a.x)) * (b.t - a.t);
    }
    return st[st.length - 1].t;
  }
  function homeScroll() {
    let x = TM.nowX - G.W * 0.5;
    for (const n of TM.nodes) {
      const v = n.x - x;
      if (v > -46 && v < 44) {
        x = n.x - 44;
        break;
      }
    }
    return clamp(x, 0, TM.total - G.W);
  }

  function rebuildTrack() {
    TM = trackModel(S.now);
    track.textContent = "";
    track.style.width = `${TM.total}px`;
    const line = html("div", "dc-line", track);
    line.style.width = `${TM.total}px`;
    line.style.setProperty("--now-x", `${TM.nowX}px`);
    for (const n of TM.nodes)
      for (const it of n.group ?? [n.it]) {
        if (it.end == null) continue;
        const b = html("div", "dc-band", track);
        const x1 = xAt(it.start);
        const x2 = xAt(it.end);
        b.style.left = `${x1}px`;
        b.style.width = `${Math.max(6, x2 - x1)}px`;
      }
    for (const s of TM.stops) {
      if (s.kind === "mark") {
        const m = html("div", "dc-mid dc-era", track);
        m.style.left = `${s.x}px`;
        html("span", "", m).textContent = s.label ?? "";
        continue;
      }
      if (s.kind !== "mid" || s.d == null || s.d < minDay()) continue;
      const tmrw = s.d === dayOf(S.now) + 1;
      const m = html("div", `dc-mid${tmrw ? " dc-next" : ""}`, track);
      m.style.left = `${s.x}px`;
      const info = dayInfo(s.d);
      const label = s.d === 0 ? "Today" : tmrw ? "Tomorrow" : info ? `${info.short} ${Number(info.date.slice(8))}` : "";
      html("span", "", m).textContent = label;
    }
    for (const n of TM.nodes) {
      const it = n.it;
      const b = html("button", `dc-node ${n.past ? "dc-past" : "dc-future"}${it.someday ? " dc-someday" : ""}`, track);
      b.type = "button";
      b.style.left = `${n.x}px`;
      // further from now, quieter: the week is full strength, months away fade to half
      const far = Math.abs(dayOf(n.t)) - 7;
      if (!it.someday && far > 0) b.style.opacity = String(Math.max(0.5, 1 - far / 90));
      b.dataset.id = n.id;
      const pile = n.group ? pileOf(n.group) : null;
      const more = n.group && !pile ? n.group.length - 1 : 0;
      const name = pile ? `${pile} due` : nodeName(it);
      const time = it.someday ? "No day yet" : (it.when ?? (Math.abs(dayOf(n.t)) > 6 ? dayLongOf(dayOf(n.t)) : timeOf(it)));
      b.innerHTML = `<span class="dc-n-ic" aria-hidden="true">${esc(it.icon)}${more ? `<b class="dc-n-more">+${more}</b>` : ""}</span><span class="dc-n-dot"></span><span class="dc-n-t">${esc(time)}</span><span class="dc-n-n">${esc(name)}</span>`;
      const said = more ? `${name} and ${more} more` : name;
      if (pile) b.classList.add("dc-pile");
      b.setAttribute(
        "aria-label",
        it.someday ? `${said}, no day yet` : time === dayLongOf(dayOf(n.t)) || it.when ? `${said}, ${time}` : `${said}, ${dayLong(dayOf(n.t))}, ${time}`,
      );
      b.addEventListener("click", () => select(n.id));
      n.el = b;
    }
    const np = html("button", "dc-now", track);
    np.type = "button";
    np.style.left = `${TM.nowX}px`;
    const mDeg = ((S.now % 60) / 60) * 360;
    const hDeg = (((S.now / 60) % 12) / 12) * 360;
    np.innerHTML = `<span class="dc-now-pill"><svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 7V3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" transform="rotate(${mDeg.toFixed(1)} 7 7)"/><path d="M7 7V4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" transform="rotate(${hDeg.toFixed(1)} 7 7)"/></svg><span>${fmt(S.now)}</span></span><i></i>`;
    np.setAttribute("aria-label", `Now, ${fmt(S.now)}. Back to the clock`);
    np.addEventListener("click", () => close());
    TM.nowEl = np;
  }

  /* ---------- map clock markers onto line nodes for the morph ---------- */
  function prepMorph(keepScroll = false) {
    // the wheel opens at the time on top and wraps back at the time in the middle of the line, so nothing jumps
    if (domeMode && keepScroll) {
      S.view = clamp(tAt(trackWrap.scrollLeft + G.W / 2), minDay() * 1440, (maxDay() + 1) * 1440 - 1);
      S.follow = Math.abs(S.view - S.now) < 10;
    }
    const sl = domeMode && keepScroll ? trackWrap.scrollLeft : domeMode && !S.follow ? clamp(xAt(S.view) - G.W / 2, 0, TM.total - G.W) : homeScroll();
    G.home = sl;
    if (keepScroll && Math.abs(trackWrap.scrollLeft - sl) > 1) G.wrapSl = trackWrap.scrollLeft;
    else {
      G.wrapSl = null;
      trackWrap.scrollLeft = sl;
    }
    micons.textContent = "";
    for (const n of TM.nodes) n.el?.classList.remove("dc-mapped");
    const capL = G.cx - G.capHW + 18;
    const capR = G.cx + G.capHW - 18;
    let turn = Math.PI - ang(CM.ps);
    turn = ((((turn + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    G.turn = turn;
    // with the dome there are no flying markers: the dome flattens onto the line by itself
    if (domeMode) {
      MAP = [];
      return;
    }
    MAP = CM.marks.map((m) => {
      const node = nodeOf(m.it.id);
      // a marker whose place on the line is off screen slides just past the edge and fades, instead of stretching out to it
      const xr = node ? node.x - sl : m.ix < G.cx ? -40 : G.W + 40;
      const off = xr < 12 || xr > G.W - 12;
      const x2 = clamp(xr, -36, G.W + 36);
      const th0 = Math.atan2(m.ix - G.cx, -(m.iy - G.cy));
      const r0 = Math.hypot(m.ix - G.cx, m.iy - G.cy);
      // where this marker sits once the ring has turned (the window's seam at the bottom): earlier is left, later is right
      const rel = clamp((m.t - CM.ps) / (CM.we - CM.ps), 0, 1);
      const e = html("div", "dc-mi", micons);
      e.textContent = m.it.icon;
      node?.el?.classList.add("dc-mapped");
      return {
        m,
        p0: [m.ix, m.iy] as Pt,
        p2: [x2, G.iconY] as Pt,
        th0,
        r0,
        phiEnd: rel * Math.PI * 2 - Math.PI,
        el: e,
        dim: m.past,
        off,
        inCap: x2 > capL && x2 < capR,
      };
    });
  }

  /* ---------- day picker, tiles, card ---------- */
  function buildDays() {
    daysNav.innerHTML = "";
    const arrow = (label: string, path: string, d: number) => {
      const b = html("button", "dc-arrow", daysNav);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.innerHTML = `<svg width="9" height="15" viewBox="0 0 9 15" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      b.addEventListener("click", () => goDay(S.day + d));
    };
    arrow("Previous day", "M7.5 1.5 1.5 7.5l6 6", -1);
    for (const day of data.days) {
      const d = day.offset;
      const b = html("button", "dc-day", daysNav);
      b.type = "button";
      b.textContent = day.short;
      b.dataset.d = String(d);
      b.setAttribute("aria-label", d === 0 ? "Today" : day.long);
      b.addEventListener("click", () => {
        if (d === 0 && S.day === 0 && Math.abs(trackWrap.scrollLeft - homeScroll()) < 30) close();
        else goDay(d);
      });
    }
    arrow("Next day", "M1.5 1.5l6 6-6 6", 1);
  }
  function markDay() {
    for (const b of daysNav.querySelectorAll<HTMLButtonElement>("button[data-d]")) {
      const sel = Number(b.dataset.d) === S.day;
      b.classList.toggle("dc-on", sel);
      b.setAttribute("aria-current", sel ? "date" : "false");
    }
  }
  function goDay(d: number) {
    d = clamp(d, minDay(), maxDay());
    let x: number;
    if (d === 0) x = homeScroll();
    else {
      const first = TM.nodes.find((n) => dayOf(n.t) === d);
      x = (first ? first.x : xAt(d * 1440 + 480)) - G.W * 0.22;
    }
    S.sel = null;
    trackWrap.scrollTo({ left: clamp(x, 0, TM.total - G.W), behavior: reduce ? "auto" : "smooth" });
    setDay(d);
  }
  function setDay(d: number) {
    if (d === S.day && chips.childElementCount) return;
    S.day = d;
    markDay();
    buildChips();
    showDetail();
  }

  // The tiles round up the day in view with what's tied to the clock: its shift, its class, its deadline.
  // Only real items; a kind the day doesn't have gets no tile. Today and later days also show the next deadline ahead.
  function dayTiles(d: number): Tile[] {
    if (d === SOMEDAY) return [];
    const now = S.now;
    const inDay = (it: ClockItem) => dayOf(t0(it)) === d;
    const live = (it: ClockItem) => it.end != null && it.start <= now && it.end > now;
    const pick = (list: ClockItem[]) => list.find(live) || (d === 0 && list.find((it) => t0(it) > now)) || list[0];
    const byTime = (a: ClockItem, b: ClockItem) => t0(a) - t0(b);
    const endsAt = (e: number) => (fmt(e).slice(-2) === fmt(now).slice(-2) ? fmtShort(e).slice(0, -3) : fmtShort(e));
    const hrs = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
    const out: Tile[] = [];
    const work = DATED.filter((it) => it.cat === "work" && !it.allDay && it.end != null && inDay(it)).sort(byTime);
    if (work.length) {
      const w = pick(work);
      const end = w.end ?? w.start;
      // running: when it ends; over: the hours it took (from the schedule, never pay); later: when it starts
      const [name, time] = live(w) ? ["Work till", endsAt(end)] : end <= now ? ["Worked", hrs(end - w.start)] : ["Work", fmtShort(w.start)];
      out.push({ it: w, icon: "work", name, time, label: `Work, ${fmt(w.start)} to ${fmt(end)}` });
    }
    const cls = DATED.filter((it) => it.cat === "class" && !it.allDay && inDay(it)).sort(byTime);
    if (cls.length) {
      const c = pick(cls);
      const end = c.end ?? c.start;
      const time = live(c) ? `till ${endsAt(end)}` : d === dayOf(now) && end <= now ? "done" : fmtShort(c.start);
      out.push({ it: c, icon: "class", name: c.title, time, label: `${c.title}, ${fmt(c.start)} to ${fmt(end)}` });
    }
    let due = DATED.filter((it) => it.cat === "due" && inDay(it)).sort(byTime)[0];
    let ahead = false;
    if (!due && d >= 0) {
      due = DATED.filter((it) => it.cat === "due" && t0(it) >= (d + 1) * 1440).sort(byTime)[0];
      ahead = true;
    }
    if (due) {
      const t = t0(due);
      const time = ahead ? dayShort(dayOf(t)) : (billOf(due) ?? (due.allDay ? "today" : fmtShort(t)));
      const pile = pileOf(DATED.filter((it) => it.cat === "due" && it.start === due.start && it.allDay === due.allDay));
      const name = pile ?? due.title;
      out.push({ it: due, icon: "due", name, time, label: `${name}, due ${dayLong(dayOf(t))}${due.allDay ? "" : ` at ${fmt(t)}`}`, ahead });
    }
    // in the order they happen; a deadline on a later day goes last
    return out.sort((a, b) => (a.ahead ? 1e9 : t0(a.it)) - (b.ahead ? 1e9 : t0(b.it)));
  }
  function buildChips() {
    chips.textContent = "";
    for (const c of dayTiles(S.day)) {
      const b = html("button", "dc-tile", chips);
      b.type = "button";
      b.dataset.id = c.it.id;
      b.innerHTML = `${TILE_ICONS[c.icon]}<span class="dc-tx"><span class="dc-tn">${esc(c.name)}</span><span class="dc-tt">${esc(c.time)}</span></span>`;
      b.setAttribute("aria-label", c.label);
      b.addEventListener("click", () => {
        select(c.it.id);
        // same day: bring its node into view; a later day's deadline just opens its card
        const n = nodeOf(c.it.id);
        if (n && dayOf(n.t) === S.day) {
          const v = n.x - trackWrap.scrollLeft;
          if (v < 50 || v > G.W - 50) trackWrap.scrollTo({ left: clamp(n.x - G.W / 2, 0, TM.total - G.W), behavior: reduce ? "auto" : "smooth" });
        }
      });
    }
    if (S.open) for (const c of chips.querySelectorAll<HTMLElement>(".dc-tile")) c.style.opacity = "1";
    fitChips();
    markSel();
  }
  // Too tight for the row: let the widest tile give way first ("…"), then the next widest.
  function fitChips() {
    const list = [...chips.querySelectorAll<HTMLElement>(".dc-tile")];
    for (const c of list) c.style.minWidth = "";
    const fits = () => chips.scrollWidth <= chips.clientWidth + 0.5;
    list.sort((a, b) => b.offsetWidth - a.offsetWidth);
    for (const c of list) {
      if (fits()) break;
      c.style.minWidth = "0";
    }
  }
  function markSel() {
    const sel = nodeOf(S.sel);
    for (const n of TM.nodes) n.el?.classList.toggle("dc-sel", n === sel);
    for (const c of chips.querySelectorAll<HTMLElement>(".dc-tile")) c.setAttribute("aria-pressed", String(c.dataset.id === S.sel));
  }
  // One quiet card, only when you ask for it: tap a node or a tile; tap it again to put it away.
  function select(id: string) {
    S.sel = S.sel === id ? null : id;
    showDetail();
    markSel();
    if (S.sel && !reduce && detail.animate)
      detail.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
  }
  const openLabel = (href: string) =>
    href.startsWith("/calendar")
      ? "Open in calendar"
      : href.startsWith("/work")
        ? "Open work"
        : href.startsWith("/school")
          ? "Open the class"
          : href.startsWith("/tasks")
            ? "Open to-dos"
            : href.startsWith("/finances")
              ? "Open bills"
              : "Open";
  const agoOf = (d: number) =>
    d <= 0
      ? "Today"
      : d === 1
        ? "Yesterday"
        : d < 60
          ? `${d} days ago`
          : d < 730
            ? `${Math.round(d / 30.44)} months ago`
            : `${Math.floor(d / 365.25)} years ago`;
  // A stack's card: what's there, one row each; a row opens that thing's own card (tap the stop again for the list).
  function showStack(n: Node, g: ClockItem[]) {
    const d = dayOf(n.t);
    const sameTime = g.every((x) => t0(x) === t0(g[0]) && !x.allDay);
    const kick = `${pileOf(g) ?? `${g.length} things`} · ${n.it.someday ? "Someday" : `${dayLong(d)}${sameTime ? ` · ${fmt(t0(g[0]))}` : ""}`}`;
    const rows = g
      .map(
        (x) =>
          `<button type="button" class="dc-d-row" data-id="${esc(x.id)}"><span class="dc-r-ic" aria-hidden="true">${esc(x.icon)}</span><span class="dc-r-n">${esc(
            nodeName(x),
          )}</span>${sameTime || x.someday ? "" : `<span class="dc-r-t">${esc(timeOf(x))}</span>`}</button>`,
      )
      .join("");
    detail.innerHTML = `<div class="dc-d-ic" aria-hidden="true">${esc(n.it.icon)}</div><div class="dc-d-body"><div class="dc-d-k">${esc(kick)}</div><div class="dc-d-list">${rows}</div></div>`;
    for (const r of detail.querySelectorAll<HTMLElement>(".dc-d-row")) r.addEventListener("click", () => select(r.dataset.id ?? ""));
    const list = detail.querySelector<HTMLElement>(".dc-d-list");
    const over = detail.offsetHeight - (G.H - G.detailY - 12);
    if (list && over > 0) list.style.maxHeight = `${Math.max(66, Math.floor((list.offsetHeight - over - 22) / 44) * 44 + 22)}px`;
    wrapHint(S.open ? 1 : S.p);
  }
  function showDetail() {
    const stack = S.sel?.startsWith("stack:") ? TM.nodes.find((n) => n.id === S.sel) : undefined;
    if (stack?.group) return showStack(stack, stack.group);
    const it = S.sel ? ITEMS.find((x) => x.id === S.sel) : undefined;
    if (!it) {
      detail.innerHTML = "";
      wrapHint(S.open ? 1 : S.p);
      return;
    }
    const t = t0(it);
    let kick = it.when ?? dayLong(dayOf(t));
    if (it.someday) kick = "Someday";
    else if (dayOf(t) === 0 && !it.allDay) kick = it.end != null && t <= S.now && it.end > S.now ? "Now" : t > S.now ? "Up next" : "Earlier today";
    else if (dayOf(t) > 0 && S.day === 0) kick += dayOf(t) === 1 ? " · tomorrow" : ` · in ${dayOf(t)} days`;
    const when = it.someday
      ? "No day yet. Pin it to a day when you know."
      : it.origin === "milestone"
        ? agoOf(-dayOf(t))
        : it.origin === "goal" || it.origin === "money_goal"
          ? `${it.amountCents != null ? `${money(it.amountCents)}, y` : "Y"}our goal by the end of this day`
          : it.origin === "reminder"
            ? `Reminder at ${fmt(it.start)}`
            : it.origin === "trial"
              ? `Trial ends ${dayWord(dayOf(t))}, then ${money(it.amountCents ?? 0)}`
              : billOf(it)
                ? `${billOf(it)} ${dayWord(dayOf(t))}`
                : it.allDay
                  ? it.kind === "due"
                    ? "Due by the end of the day"
                    : "All day"
                  : it.end != null
                    ? `${fmt(it.start)} – ${fmt(it.end)}`
                    : `Due ${fmt(it.start)}`;
    const sub = [it.subtitle, it.source].filter(Boolean).join(" · ");
    const canDo = (it.origin === "task" || it.origin === "reminder" || it.origin === "assignment") && !!it.ref;
    const inPlace = it.origin === "event" || it.origin === "shift" || it.origin === "assignment";
    const onPage = it.origin === "task" || it.origin === "reminder" || it.origin === "goal" || it.origin === "milestone";
    const acts = `${canDo ? '<button type="button" class="dc-d-done">Done</button>' : ""}${inPlace ? '<button type="button" class="dc-d-edit">Edit</button>' : ""}<button type="button" class="dc-d-open">${esc(onPage ? "Edit" : openLabel(it.href))}</button>`;
    detail.innerHTML = `<div class="dc-d-ic" aria-hidden="true">${esc(it.icon)}</div><div class="dc-d-body"><div class="dc-d-k">${esc(kick)}</div><div class="dc-d-t">${esc(
      it.title,
    )}</div><div class="dc-d-w">${esc(when)}</div><div class="dc-d-s">${esc(sub)}</div><div class="dc-d-acts">${acts}</div></div>`;
    detail.querySelector(".dc-d-open")?.addEventListener("click", () => opts.onOpen(it.href));
    detail.querySelector(".dc-d-edit")?.addEventListener("click", () => opts.onEdit(it));
    detail.querySelector(".dc-d-done")?.addEventListener("click", () => {
      S.sel = null;
      showDetail();
      markSel();
      opts.onDone(it);
    });
    wrapHint(S.open ? 1 : S.p);
  }

  /* ---------- WebGL: the liquid outline (signed-distance union of body, necks, bubbles) ---------- */
  let gl: WebGLRenderingContext | null = null;
  const U: Record<string, WebGLUniformLocation | null> = {};
  let dpr = 1;
  (function initGL() {
    try {
      gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    } catch {
      gl = null;
    }
    if (!gl) return;
    const g = gl;
    const sh = (type: number, src: string) => {
      const s = g.createShader(type);
      if (!s) return null;
      g.shaderSource(s, src);
      g.compileShader(s);
      return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : null;
    };
    const v = sh(g.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }");
    const f = sh(g.FRAGMENT_SHADER, FRAG);
    const prog = g.createProgram();
    if (!v || !f || !prog) {
      gl = null;
      return;
    }
    g.attachShader(prog, v);
    g.attachShader(prog, f);
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
      gl = null;
      return;
    }
    g.useProgram(prog);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const a = g.getAttribLocation(prog, "a");
    g.enableVertexAttribArray(a);
    g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0);
    for (const n of ["uSize", "uDpr", "uBody", "uCap", "uMorph", "uBub", "uNeck", "uNeckR", "uN", "uStroke", "uGlow", "uFill", "uFillCol", "uGlowCol"])
      U[n] = g.getUniformLocation(prog, n) || g.getUniformLocation(prog, `${n}[0]`);
    g.clearColor(0, 0, 0, 0);
  })();
  function glResize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(G.W * dpr);
    canvas.height = Math.round(G.H * dpr);
    gl?.viewport(0, 0, canvas.width, canvas.height);
  }
  const bub = new Float32Array(32);
  const neck = new Float32Array(32);
  const neckR = new Float32Array(8);
  function drawGoo(u: Goo | null) {
    const g = gl;
    if (!g) return;
    g.clear(g.COLOR_BUFFER_BIT);
    if (!u) {
      canvas.style.visibility = "hidden";
      return;
    }
    canvas.style.visibility = "visible";
    g.uniform2f(U.uSize, G.W, G.H);
    g.uniform1f(U.uDpr, dpr);
    g.uniform4f(U.uBody, u.cx, u.cy, u.rx, u.ry);
    g.uniform2f(U.uCap, u.hw, u.hh);
    g.uniform1f(U.uMorph, u.s);
    bub.fill(0);
    neck.fill(0);
    neckR.fill(0);
    u.items.slice(0, 8).forEach((b, i) => {
      bub.set([b.x, b.y, b.r, 0], i * 4);
      neck.set([b.ax, b.ay, b.tx, b.ty], i * 4);
      neckR[i] = b.nr;
    });
    g.uniform4fv(U.uBub, bub);
    g.uniform4fv(U.uNeck, neck);
    g.uniform1fv(U.uNeckR, neckR);
    g.uniform1f(U.uN, Math.min(8, u.items.length));
    g.uniform4f(U.uStroke, u.col[0] * u.a, u.col[1] * u.a, u.col[2] * u.a, u.a);
    g.uniform1f(U.uGlow, u.glow);
    g.uniform1f(U.uFill, u.fill);
    g.uniform3f(U.uFillCol, COL.fill[0], COL.fill[1], COL.fill[2]);
    g.uniform3f(U.uGlowCol, COL.accent[0], COL.accent[1], COL.accent[2]);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  /* ---------- one frame of the motion, a pure function of p ---------- */
  // The rim's busy arcs, drawn up to a share f of its 12-hour window (from its start, clockwise).
  function fillRim(f: number) {
    if (G.rimFill === f) return;
    G.rimFill = f;
    const rt = CM.ps + f * (CM.we - CM.ps);
    for (const a of CM.arcs) {
      const e = Math.min(a.b, rt);
      const vis = e > a.a + 1;
      const d = vis ? arcPath(ang(a.a), ang(e), G.R + a.lap * LAP) : "";
      for (const x of a.els) {
        x.style.visibility = vis ? "visible" : "hidden";
        if (vis) x.setAttribute("d", d);
      }
    }
  }
  function wrapHint(P: number) {
    hintWrap.style.opacity = String(detail.innerHTML ? 0 : seg(P, 0.92, 1));
  }
  function render() {
    const P = clamp(S.p, 0, 1);
    const pr = S.press;
    const prC = clamp(pr, 0, 1);
    const R = G.R;
    // wrapping back from another part of the line: it rewinds to now in the first part of the same motion
    if (G.wrapSl != null) trackWrap.scrollLeft = lerp(G.home, G.wrapSl, eIO(seg(P, 0.78, 1)));
    const shift = G.wrapSl != null ? G.home - trackWrap.scrollLeft : 0;
    if (reduce || domeMode) {
      renderReduced(P);
      drawDome();
      return;
    }
    const s = eIO(seg(P, 0.36, 0.78));
    const sq = eOut(seg(P, 0.05, 0.34)) * (1 - s);
    const rx = R * (1 + 0.075 * sq);
    const ry = R * (1 - 0.065 * sq);
    const by = lerp(G.cy, G.ycap, eIO(seg(P, 0.26, 0.7)));
    const fScale = 1 - 0.14 * seg(P, 0.3, 0.56);
    const dip = 1 - 0.02 * pr * (1 - seg(P, 0, 0.15));
    faceG.setAttribute("transform", `translate(${G.cx} ${by}) scale(${(rx / R) * fScale * dip} ${(ry / R) * fScale * dip})`);
    rimC.style.opacity = String(1 - seg(P, 0, 0.05));
    // the rim empties as the clock stretches open, and refills clockwise as the timeline wraps back in
    fillRim(Math.round(eIO(1 - seg(P, 0.1, 0.34)) * 400) / 400);
    arcsG.style.opacity = String(1 - seg(P, 0.3, 0.4));
    ticksG.style.opacity = handsG.style.opacity = String(1 - seg(P, 0.3, 0.5));
    stepsG.style.opacity = String((1 - seg(P, 0.02, 0.2)) * (1 - 0.6 * prC));
    pressG.setAttribute("opacity", String(prC * (1 - seg(P, 0.3, 0.5))));
    haloC.setAttribute("opacity", String(0.35 * prC * (1 - seg(P, 0.05, 0.3))));
    const hc = `color-mix(in srgb, var(--accent) ${Math.round(prC * 100)}%, var(--text))`;
    hourH.style.stroke = hc;
    minH.style.stroke = hc;
    hubC.style.fill = hc;
    // markers
    const lab = 1 - seg(P, 0, 0.12);
    for (const m of CM.marks) {
      const o = lab * (m.past ? 0.5 : 1);
      if (m.lab) m.lab.style.opacity = String(o);
      m.line?.setAttribute("opacity", String(o));
    }
    hint.style.opacity = String(1 - seg(P, 0, 0.1));
    foot.style.opacity = String(1 - seg(P, 0, 0.18));
    foot.style.transform = `translateY(${(14 * eOut(seg(P, 0, 0.25))).toFixed(2)}px)`;
    foot.style.visibility = P > 0.25 ? "hidden" : "visible";
    dayG.style.opacity = String(lab);
    // icons, bubbles, necks
    const ta = eIO(seg(P, 0.06, 0.44));
    const tb = eIO(seg(P, 0.38, 0.88));
    const rOrb = R + 50;
    const grow = eOut(seg(P, 0.02, 0.15));
    const life = seg(P, 0.005, 0.04) * (1 - seg(P, 0.48, 0.68));
    const items: Bubble[] = [];
    for (const k of MAP) {
      const th = k.th0 + G.turn * ta;
      const rr = lerp(k.r0, rOrb, eOut(seg(P, 0.04, 0.3)));
      const phi = k.phiEnd - G.turn * (1 - ta);
      let ox = lerp(G.cx + Math.sin(th) * rr, G.cx + (G.W / 2 - 30) * Math.sin(phi / 2), ta);
      let oy = by - Math.cos(th) * rr * lerp(1, 0.9, ta);
      // keep every marker outside the rim while it travels
      const gap = lerp(Math.min(k.r0 - R, 44), 44, eOut(seg(P, 0.04, 0.3)));
      const ex = (ox - G.cx) / (rx + gap);
      const ey = (oy - by) / (ry + gap);
      const dd = Math.hypot(ex, ey);
      if (dd < 1 && dd > 1e-3) {
        ox = G.cx + (ex / dd) * (rx + gap);
        oy = by + (ey / dd) * (ry + gap);
      }
      ox = clamp(ox, 24, G.W - 24);
      const x = lerp(ox, k.p2[0] + shift, tb);
      const y = lerp(oy, k.p2[1], tb);
      const sc = lerp(lerp(1, 0.86, seg(P, 0.05, 0.25)), 1.04, seg(P, 0.6, 0.9));
      const op = lerp(k.dim ? 0.5 : 1, 1, seg(P, 0.05, 0.3));
      k.el.style.transform = `translate3d(${(x - 15).toFixed(2)}px, ${(y - 15).toFixed(2)}px, 0) scale(${sc.toFixed(3)})`;
      const offF = k.off ? 1 - seg(P, 0.4, 0.56) : 1;
      k.el.style.opacity = String(op * (k.off ? 1 - seg(P, 0.46, 0.66) : 1));
      const r = 22 * eOut(seg(P, 0.08, 0.22)) * (1 - seg(P, 0.8, 0.94)) * (k.inCap ? 1 : 1 - seg(P, 0.5, 0.68)) * offF;
      const dx = x - G.cx;
      const dy = y - by;
      const len0 = Math.hypot(dx, dy) || 1;
      const ux = dx / len0;
      const uy = dy / len0;
      const ra = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);
      const ax = G.cx + ux * (ra - 8);
      const ay = by + uy * (ra - 8);
      const len = Math.hypot(x - ax, y - ay);
      const nr = life * clamp(8 - len * 0.035, 2.2, 7.5) * offF;
      items.push({ x, y, r, ax, ay, tx: lerp(ax, x, grow), ty: lerp(ay, y, grow), nr });
    }
    const rel = eOut(seg(P, 0.84, 1));
    const g = seg(P, 0.04, 0.22);
    const col = COL.grey.map((v, i) => lerp(v, COL.accent[i], 0.85 * g));
    const a = seg(P, 0, 0.04) * (1 - seg(P, 0.84, 0.98));
    if (P > 0 && P < 1 && gl)
      drawGoo({
        cx: G.cx,
        cy: by,
        rx,
        ry,
        hw: G.capHW + 14 * rel,
        hh: G.capHH + 18 * rel,
        s,
        items,
        col,
        a,
        glow: 0.42 * seg(P, 0.03, 0.2) * (1 - seg(P, 0.84, 0.98)),
        fill: 0.95 * (1 - seg(P, 0.8, 0.94)),
      });
    else drawGoo(null);
    // the line, labels and header
    let X = 50;
    if (P >= 0.52) X = P < 0.84 ? lerp(50, 7, eIO(seg(P, 0.52, 0.8))) : lerp(7, 0, seg(P, 0.84, 0.97));
    trackWrap.style.clipPath = P >= 1 ? "none" : `inset(0 ${X.toFixed(2)}% 0 ${X.toFixed(2)}%)`;
    // what isn't on screen isn't there for taps, the tab key or screen readers either
    trackWrap.style.visibility = P > 0 ? "visible" : "hidden";
    trackWrap.style.setProperty("--tlab", seg(P, 0.82, 1).toFixed(3));
    const tN = seg(P, 0.88, 1);
    if (TM.nowEl) {
      TM.nowEl.style.opacity = String(tN);
      TM.nowEl.style.transform = `translateX(-50%) translateY(${(-16 * (1 - eBack(tN))).toFixed(2)}px)`;
    }
    // "Today ⌄" leaves before the day picker arrives, so the two never overlap
    todayBtn.style.opacity = String(1 - seg(P, 0.66, 0.77));
    todayBtn.style.visibility = P > 0.77 ? "hidden" : "visible";
    const pk = seg(P, 0.78, 0.94);
    daysNav.style.opacity = String(pk);
    daysNav.style.transform = `translateY(${(-8 * (1 - pk)).toFixed(2)}px)`;
    daysNav.style.visibility = pk > 0 ? "visible" : "hidden";
    chips.style.visibility = P > 0.78 ? "visible" : "hidden";
    chips.querySelectorAll<HTMLElement>(".dc-tile").forEach((c, i) => {
      const t = seg(P, 0.8 + i * 0.03, 0.95 + i * 0.02);
      c.style.opacity = String(t);
      c.style.transform = `translateY(${(10 * (1 - eOut(t))).toFixed(2)}px)`;
    });
    const dt = seg(P, 0.86, 1);
    detail.style.opacity = String(dt);
    detail.style.transform = `translateY(${(12 * (1 - eOut(dt))).toFixed(2)}px)`;
    wrapHint(P);
  }
  // Reduced motion: a calm crossfade between the two, no liquid.
  function renderReduced(P: number) {
    faceG.setAttribute("transform", `translate(${G.cx} ${G.cy})`);
    faceSvg.style.opacity = String(1 - P);
    callouts.style.opacity = String(1 - P);
    hint.style.opacity = String(1 - P);
    foot.style.opacity = String(1 - P);
    foot.style.visibility = P > 0.5 ? "hidden" : "visible";
    for (const k of MAP) {
      k.el.style.transform = `translate3d(${k.p0[0] - 15}px, ${k.p0[1] - 15}px, 0)`;
      k.el.style.opacity = String((1 - P) * (k.dim ? 0.5 : 1));
    }
    for (const m of CM.marks) if (m.lab) m.lab.style.opacity = m.past ? "0.5" : "1";
    dayG.style.opacity = String(1 - P);
    drawGoo(null);
    trackWrap.style.clipPath = "none";
    // the wheel unrolls onto the line first; the line's own stops come in as it lands
    trackWrap.style.opacity = String(domeMode && !reduce ? seg(P, 0.55, 1) : P);
    trackWrap.style.visibility = P > 0 ? "visible" : "hidden";
    daysNav.style.visibility = P > 0 ? "visible" : "hidden";
    chips.style.visibility = P > 0 ? "visible" : "hidden";
    trackWrap.style.setProperty("--tlab", "1");
    for (const n of TM.nodes) n.el?.classList.remove("dc-mapped");
    if (TM.nowEl) TM.nowEl.style.opacity = "1";
    todayBtn.style.opacity = String(1 - P);
    todayBtn.style.visibility = P > 0.5 ? "hidden" : "visible";
    daysNav.style.opacity = String(P);
    for (const c of chips.querySelectorAll<HTMLElement>(".dc-tile")) c.style.opacity = String(P);
    detail.style.opacity = String(P);
    wrapHint(P);
  }

  /* ---------- driving the motion ---------- */
  function setInteractive(open: boolean) {
    root.dataset.open = open ? "true" : "false";
    hit.style.display = open ? "none" : "block";
  }
  // What the clock is doing, for tests and assistive tech: "clock", "moving" or "timeline".
  const setState = (st: "clock" | "moving" | "timeline") => {
    root.dataset.state = st;
  };
  function finishOpen() {
    S.open = true;
    setState("timeline");
    G.wrapSl = null;
    for (const n of TM.nodes) n.el?.classList.remove("dc-mapped");
    micons.style.visibility = "hidden";
    drawGoo(null);
    setInteractive(true);
    markSel();
  }
  function animateTo(target: number, ms: number, ease: (t: number) => number, done?: () => void) {
    const from = S.p;
    const start = performance.now();
    const marks: [number, number][] =
      target > from
        ? [
            [0.18, 7],
            [0.97, 12],
          ]
        : [
            [0.5, 7],
            [0.02, 10],
          ];
    const a = { id: 0 };
    S.anim = a;
    setState("moving");
    const step = (now: number) => {
      if (S.anim !== a) return;
      const t = clamp((now - start) / ms, 0, 1);
      const prev = S.p;
      S.p = from + (target - from) * ease(t);
      for (const [m, ms2] of marks) if ((prev < m && S.p >= m) || (prev > m && S.p <= m)) haptic(ms2);
      render();
      if (t < 1) a.id = requestAnimationFrame(step);
      else {
        S.anim = null;
        done?.();
      }
    };
    a.id = requestAnimationFrame(step);
  }
  function pressTo(v: number, ms = 140) {
    const from = S.press;
    const start = performance.now();
    cancelAnimationFrame(S.pressAnim);
    const step = (now: number) => {
      const t = clamp((now - start) / ms, 0, 1);
      S.press = from + (v - from) * eOut(t);
      if (!S.open) render();
      if (t < 1) S.pressAnim = requestAnimationFrame(step);
    };
    S.pressAnim = requestAnimationFrame(step);
  }
  function open() {
    if (S.open || S.anim) return;
    stopSpin();
    prepMorph();
    micons.style.visibility = "visible";
    S.day = domeMode && !S.follow ? clamp(dayOf(S.view), minDay(), maxDay()) : 0;
    S.sel = null;
    buildChips();
    markDay();
    showDetail();
    if (S.press < 1) pressTo(1, 110);
    haptic(8);
    animateTo(1, reduce ? 240 : domeMode ? 900 : 1300, reduce ? (t) => t : ePlay, finishOpen);
  }
  // Wrapping the timeline back into the clock: the exact path of the open, run backwards as one motion.
  function beginWrap() {
    stopSpin();
    setState("moving");
    S.open = false;
    S.sel = null;
    showDetail();
    markSel();
    if (S.press < 1) S.press = 1;
    prepMorph(true);
    micons.style.visibility = "visible";
  }
  function finishClose() {
    setInteractive(false);
    G.wrapSl = null;
    trackWrap.scrollLeft = G.home;
    S.day = domeMode && !S.follow ? clamp(dayOf(S.view), minDay(), maxDay()) : 0;
    markDay();
    buildChips();
    if (S.dirty) {
      S.dirty = false;
      rebuild();
    }
    render();
    // the landing: the press lets go with a slight overshoot, so the clock settles instead of stopping
    const from = S.press;
    const start = performance.now();
    const ms = reduce ? 160 : 520;
    cancelAnimationFrame(S.pressAnim);
    const step = (now: number) => {
      const t = clamp((now - start) / ms, 0, 1);
      S.press = from * (1 - (reduce ? eOut(t) : eBack(t)));
      if (!S.open) render();
      if (t < 1) S.pressAnim = requestAnimationFrame(step);
    };
    S.pressAnim = requestAnimationFrame(step);
    setState("clock");
  }
  function close() {
    if (!S.open || S.anim) return;
    const dist = Math.abs(trackWrap.scrollLeft - homeScroll());
    beginWrap();
    setInteractive(false);
    animateTo(0, reduce ? 260 : domeMode ? 860 : 1150 + Math.min(450, dist * 0.12), reduce ? eIO : ePlay, finishClose);
  }

  /* ---------- the wheel (dome mode): turn it through time; one button rolls it back to now ---------- */
  // A finger's move along the top of the wheel moves the rim the same distance: minutes per pixel.
  const minPerPx = () => 1440 / (2 * Math.PI * wheelR(G.W));
  const viewMin = () => minDay() * 1440;
  const viewMax = () => (maxDay() + 1) * 1440 - 1;
  function setView(t: number) {
    S.view = clamp(t, viewMin(), viewMax());
    S.follow = Math.abs(S.view - S.now) < 0.5;
    drawDome();
  }
  function stopSpin() {
    cancelAnimationFrame(S.spin);
    S.spin = 0;
  }
  // a minute that turned over while the wheel was spinning is caught up once it stops
  function afterSpin() {
    if (S.dirty && !S.open && !S.anim && !drag) {
      S.dirty = false;
      rebuild();
    }
  }
  // back to now, smoothly: the farther away, the longer (never more than 1.4 s)
  function goNow() {
    stopSpin();
    if (S.follow) return afterSpin();
    const from = S.view;
    const ms = reduce ? 0 : clamp(380 + Math.abs(S.now - from) * 0.3, 380, 1400);
    const start = performance.now();
    const step = (t: number) => {
      const k = ms ? clamp((t - start) / ms, 0, 1) : 1;
      S.view = lerp(from, S.now, eIO(k));
      drawDome();
      if (k < 1) S.spin = requestAnimationFrame(step);
      else {
        S.spin = 0;
        S.follow = true;
        drawDome();
        haptic(10);
        afterSpin();
      }
    };
    S.spin = requestAnimationFrame(step);
  }
  // let go while turning: it keeps going and slows down, and settles on now when it passes close to it
  function fling(v0: number) {
    stopSpin();
    // even the hardest flick coasts about half a day, never further
    let v = clamp(v0, -2, 2);
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      v *= Math.pow(0.93, dt / 16);
      setView(S.view + v * dt);
      if (Math.abs(v) > 0.004 && S.view > viewMin() && S.view < viewMax()) S.spin = requestAnimationFrame(step);
      else {
        S.spin = 0;
        if (Math.abs(S.view - S.now) < 12) goNow();
        else afterSpin();
      }
    };
    if (!reduce) S.spin = requestAnimationFrame(step);
    else if (Math.abs(S.view - S.now) < 12) goNow();
    else afterSpin();
  }
  if (backBtn) on(backBtn, "click", () => goNow());

  /* pull the clock sideways to open (the wheel: turn it); tap to open */
  let drag: { x: number; y: number; id: number; moved: boolean; lastP: number; lastT: number; v: number; v0: number; caught: boolean } | null = null;
  on(hit, "pointerdown", (e: PointerEvent) => {
    if (S.open || S.anim) return;
    const caught = domeMode && S.spin !== 0;
    if (domeMode) stopSpin();
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, lastP: 0, lastT: performance.now(), v: 0, v0: S.follow ? S.now : S.view, caught };
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pressTo(1);
    haptic(8);
  });
  on(hit, "pointermove", (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (domeMode) {
      if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.moved = true;
        drag.lastP = drag.v0;
        drag.lastT = performance.now();
      }
      if (!drag.moved) return;
      // finger to the right goes back in time; to the left, ahead
      const now = performance.now();
      const t = drag.v0 - dx * minPerPx();
      drag.v = ((t - drag.lastP) / Math.max(1, now - drag.lastT)) * 0.6 + drag.v * 0.4;
      drag.lastP = t;
      drag.lastT = now;
      setView(t);
      return;
    }
    if (!drag.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      drag.moved = true;
      prepMorph();
      micons.style.visibility = "visible";
      S.day = 0;
      S.sel = null;
      buildChips();
      markDay();
      showDetail();
    }
    if (drag.moved) {
      const now = performance.now();
      const p = clamp((Math.abs(dx) - 10) / 210, 0, 1);
      drag.v = ((p - drag.lastP) / Math.max(1, now - drag.lastT)) * 1000;
      drag.lastP = p;
      drag.lastT = now;
      S.p = p;
      render();
    }
  });
  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      if (cancelled || d.caught) pressTo(0);
      else open();
      if (d.caught) afterSpin();
      return;
    }
    if (domeMode) {
      pressTo(0, 220);
      fling(cancelled || performance.now() - d.lastT > 90 ? 0 : d.v);
      return;
    }
    const v = performance.now() - d.lastT > 90 ? 0 : d.v;
    if (!cancelled && (S.p > 0.35 || v > 1.6)) animateTo(1, 700 * (1 - S.p) + 250, eOut, finishOpen);
    else
      animateTo(0, 600 * S.p + 150, eOut, () => {
        setState("clock");
        pressTo(0, 220);
      });
  };
  on(hit, "pointerup", (e: PointerEvent) => endDrag(e, false));
  on(hit, "pointercancel", (e: PointerEvent) => endDrag(e, true));
  on(hit, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    } else if (domeMode && !S.anim && !S.open && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // the keyboard turns the wheel an hour at a time; Home goes back to now
      e.preventDefault();
      setView((S.follow ? S.now : S.view) + (e.key === "ArrowLeft" ? -60 : 60));
    } else if (domeMode && !S.anim && !S.open && e.key === "Home") {
      e.preventDefault();
      goNow();
    }
  });
  on(todayBtn, "click", () => open());
  on(document, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && S.open) close();
  });

  /* pull the line down, or pinch it, to wrap it back into the clock; it follows the finger and settles on release */
  const pts = new Map<number, { x: number; y: number }>();
  let wrap: { kind: "pull" | "pinch" | null; x: number; y: number; id: number; lastP: number; lastT: number; v: number; armed: boolean; d0: number } | null =
    null;
  let wrapSuppressClick = 0;
  on(trackWrap, "pointerdown", (e: PointerEvent) => {
    if (!S.open || S.anim) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) wrap = { kind: null, x: e.clientX, y: e.clientY, id: e.pointerId, lastP: 1, lastT: performance.now(), v: 0, armed: false, d0: 0 };
    else if (pts.size === 2 && wrap && wrap.kind !== "pull") {
      const [a, b] = [...pts.values()];
      wrap.kind = "pinch";
      wrap.d0 = Math.max(40, Math.hypot(a.x - b.x, a.y - b.y));
      beginWrap();
    }
  });
  on(trackWrap, "pointermove", (e: PointerEvent) => {
    if (!pts.has(e.pointerId) || !wrap) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    let p: number | null = null;
    if (wrap.kind === "pinch" && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      p = clamp(1 - (1 - Math.hypot(a.x - b.x, a.y - b.y) / wrap.d0) * 1.6, 0, 1);
    } else if (e.pointerId === wrap.id) {
      const dx = e.clientX - wrap.x;
      const dy = e.clientY - wrap.y;
      if (!wrap.kind && dy > 10 && dy > Math.abs(dx) * 1.2) {
        wrap.kind = "pull";
        try {
          trackWrap.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        beginWrap();
      }
      if (wrap.kind === "pull") p = clamp(1 - (dy - 10) / 250, 0, 1);
    }
    if (p == null) return;
    const now = performance.now();
    wrap.v = ((p - wrap.lastP) / Math.max(1, now - wrap.lastT)) * 1000;
    wrap.lastP = p;
    wrap.lastT = now;
    // one tick when the pull has gone far enough to wrap on release
    if (!wrap.armed && p < 0.7) {
      wrap.armed = true;
      haptic(6);
    } else if (wrap.armed && p > 0.74) wrap.armed = false;
    S.p = p;
    render();
  });
  const endWrap = (e: PointerEvent, cancelled: boolean) => {
    pts.delete(e.pointerId);
    if (!wrap || (wrap.kind !== "pinch" && e.pointerId !== wrap.id) || (wrap.kind === "pinch" && pts.size)) {
      if (!pts.size) wrap = null;
      return;
    }
    const w = wrap;
    wrap = null;
    pts.clear();
    if (!w.kind) return;
    wrapSuppressClick = performance.now();
    // a flick counts only if the finger was still moving when it let go
    const v = performance.now() - w.lastT > 90 ? 0 : w.v;
    if (!cancelled && (S.p < 0.7 || v < -2)) animateTo(0, 760 * S.p + 260, eOut, finishClose);
    else animateTo(1, 420 * (1 - S.p) + 180, eOut, finishOpen);
  };
  on(trackWrap, "pointerup", (e: PointerEvent) => endWrap(e, false));
  on(trackWrap, "pointercancel", (e: PointerEvent) => endWrap(e, true));
  // a pull that started on a node is not a tap on it
  on(
    trackWrap,
    "click",
    (e: MouseEvent) => {
      if (performance.now() - wrapSuppressClick < 350) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
  /* a tap on an empty spot of the open line pins something there, at the nearest quarter hour */
  const quarter = (t: number) => Math.round(t / 15) * 15;
  on(track, "click", (e: MouseEvent) => {
    if (!S.open) return;
    if ((e.target as HTMLElement).closest(".dc-node, .dc-now")) return;
    const r = trackWrap.getBoundingClientRect();
    const x = trackWrap.scrollLeft + (e.clientX - r.left);
    if (x >= TM.somedayX - 30) return;
    opts.onPin({ start: quarter(tAt(x)) });
  });
  /* the day under the middle of the line drives the picker and the tiles */
  let scrollRaf = 0;
  on(
    trackWrap,
    "scroll",
    () => {
      if (!S.open || scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const x = trackWrap.scrollLeft + G.W / 2;
        const d = x >= TM.somedayX ? SOMEDAY : dayOf(tAt(x));
        if (d !== S.day) {
          // the card stays while its node is still on screen (a tap near the edge scrolls it in)
          const sel = nodeOf(S.sel);
          if (!sel || sel.x < trackWrap.scrollLeft || sel.x > trackWrap.scrollLeft + G.W) S.sel = null;
          setDay(d);
          markSel();
        }
      });
    },
    { passive: true },
  );

  /* ---------- building everything ---------- */
  function rebuild() {
    rebuildClock();
    rebuildTrack();
    buildDays();
    markDay();
    buildChips();
    showDetail();
    if (S.open) {
      S.p = 1;
      finishOpen();
      trackWrap.scrollLeft = homeScroll();
      S.day = 0;
      markDay();
      buildChips();
    } else prepMorph();
    render();
  }

  // The clock follows the real time: a quiet check every 20 seconds, redrawn when the minute changes.
  // While the timeline is open (or moving) the redraw waits, so the line never jumps under a finger.
  const tick = window.setInterval(() => {
    const n = nowMinutes(data.tz, data.today);
    if (n === S.now) return;
    if (n >= 1440) {
      opts.onNewDay();
      return;
    }
    S.now = n;
    if (S.open || S.anim || drag || wrap || S.spin) S.dirty = true;
    else rebuild();
  }, 20_000);
  cleanups.push(() => window.clearInterval(tick), stopSpin);

  readTheme();
  const themeObs = new MutationObserver(() => {
    readTheme();
    render();
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => {
    readTheme();
    render();
  };
  mq.addEventListener("change", onScheme);
  cleanups.push(() => {
    themeObs.disconnect();
    mq.removeEventListener("change", onScheme);
  });
  let footH = foot.offsetHeight;
  const ro = new ResizeObserver(() => {
    if (root.clientWidth !== G.W || root.clientHeight !== G.H || foot.offsetHeight !== footH) {
      footH = foot.offsetHeight;
      layout();
    }
  });
  ro.observe(root);
  ro.observe(foot);
  cleanups.push(() => ro.disconnect());
  layout();
  if (!S.open) setState("clock");
  root.dataset.ready = "true";

  // New data while the line is open (a pin was just added): redraw it where it is, without closing or jumping.
  function refreshOpen() {
    const sl = trackWrap.scrollLeft;
    rebuildClock();
    rebuildTrack();
    buildDays();
    for (const n of TM.nodes) n.el?.classList.remove("dc-mapped");
    trackWrap.scrollLeft = sl;
    markDay();
    buildChips();
    showDetail();
    S.p = 1;
    render();
  }

  return {
    update(next: ClockData) {
      if (next.today !== data.today) S.follow = true;
      data = next;
      ITEMS = next.items;
      DATED = ITEMS.filter((it) => !it.someday);
      S.now = nowMinutes(next.tz, next.today);
      if (S.anim || drag || wrap) S.dirty = true;
      else if (S.open) refreshOpen();
      else rebuild();
    },
    pinTime() {
      const t = S.open ? tAt(trackWrap.scrollLeft + G.W / 2) : S.now;
      return dayOf(t) === dayOf(S.now) && t < S.now ? Math.ceil(S.now / 15) * 15 : quarter(t);
    },
    destroy() {
      if (S.anim) cancelAnimationFrame(S.anim.id);
      cancelAnimationFrame(S.pressAnim);
      for (const c of cleanups.splice(0)) c();
      const lose = gl?.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}
