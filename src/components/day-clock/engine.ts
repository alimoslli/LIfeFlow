/**
 * The day clock's motion engine (docs/design/clock/spec.md; prototype docs/design/clock/prototype.html).
 * React renders the static skeleton (day-clock.tsx); this draws the face, the timeline and every frame of the
 * clock-to-timeline motion as a pure function of one progress value p (0 clock .. 1 timeline), so it can be
 * played, pulled, scrubbed and reversed. The liquid outline is a signed-distance field in a WebGL shader.
 * Colours come from the app's theme tokens; only transform and opacity animate outside the shader.
 */
import type { ClockData, ClockItem } from "@/lib/day-clock";

type Pt = [number, number];
type Arc = { a: number; b: number; past: boolean; lap: number; els: SVGPathElement[] };
type Mark = {
  it: ClockItem;
  t: number;
  label: string;
  past: boolean;
  lap: number;
  a0: number;
  a: number;
  cx: number;
  cy: number;
  ix: number;
  iy: number;
  line: SVGLineElement | null;
  lab: HTMLElement | null;
};
/** ws..we: the 12 hours ahead (from the hand); ps: where the faded past starts (ps <= ws). */
type ClockModel = { arcs: Arc[]; marks: Mark[]; ps: number; ws: number; we: number; mid: number | null; word: number; ahead: boolean };
type Node = { it: ClockItem; t: number; past: boolean; x: number; el: HTMLButtonElement | null };
type Stop = { t: number; kind: "item" | "mid" | "now"; n?: Node; d?: number; x: number };
type TrackModel = { nodes: Node[]; stops: Stop[]; total: number; nowX: number; nowEl: HTMLButtonElement | null };
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
  /** The day turned over while the page was open: fetch fresh data. */
  onNewDay: () => void;
  reducedMotion: boolean;
};

export type DayClockHandle = { update: (data: ClockData) => void; destroy: () => void };

const NS = "http://www.w3.org/2000/svg";
// More than this many markers on the rim and it drops the faded past, keeping only what's ahead (owner, 2026-11-08).
const BUSY = 6;
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
  const sub = $("[data-dc=sub]");
  const todayBtn = $<HTMLButtonElement>("[data-dc=today]");
  const daysNav = $("[data-dc=days]");
  const chips = $("[data-dc=chips]");
  const trackWrap = $("[data-dc=trackWrap]");
  const track = $("[data-dc=track]");
  const detail = $("[data-dc=detail]");
  const hap = $<HTMLLabelElement>("[data-dc=hap]");
  const probe = $("[data-dc=probe]");

  let data = initial;
  let ITEMS: ClockItem[] = data.items;
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
  let TM: TrackModel = { nodes: [], stops: [], total: 0, nowX: 0, nowEl: null };
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
  const dayLong = (d: number) => dayInfo(d)?.long ?? "";
  const minDay = () => data.days[0]?.offset ?? 0;
  const maxDay = () => data.days[data.days.length - 1]?.offset ?? 0;
  const timeOf = (it: ClockItem) => (it.allDay ? (it.kind === "due" ? "Due" : "All day") : fmt(it.start));
  const billOf = (it: ClockItem) => (it.amountCents != null ? `${money(it.amountCents)} due` : null);
  const isExam = (it: ClockItem) => /\b(exam|midterm|final|quiz|test)\b/i.test(it.title);
  const nodeName = (it: ClockItem) =>
    it.amountCents != null ? `${it.title} · ${billOf(it)}` : it.kind === "due" && !isExam(it) ? `${it.title} due` : it.title;

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
    hintWrap.style.top = `${G.detailY + 6}px`;
    // "Tap the clock" sits under the face, above the foot; with no room between the markers and the foot it steps out.
    const hintTop = Math.min(G.cy + G.R + 66, H - footH - 18);
    hint.style.top = `${hintTop}px`;
    hint.hidden = hintTop < G.cy + G.R + 50;
    G.hintHidden = hint.hidden;
    const hr = G.R + 54;
    Object.assign(hit.style, { left: `${G.cx - hr}px`, top: `${G.cy - hr}px`, width: `${hr * 2}px`, height: `${hr * 2}px` });
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

  /* ---------- the clock: the 12 hours around now (or, when busy, the 12 hours ahead) ---------- */
  // Busy: drop the faded past. Quiet (fewer than 3 things): show more of today so far, faded, back to the
  // morning or noon, so a calm evening still shows the day you had (owner, 2026-11-08: "why is my clock so empty?").
  function pickClock(now: number) {
    const full = clockModel(now, "recent");
    if (full.marks.length > BUSY) return clockModel(now, "none");
    if (full.marks.length < 3) {
      const wide = clockModel(now, "today");
      if (wide.marks.length > full.marks.length) return wide;
    }
    return full;
  }
  // The rim is always the next 12 hours, starting at the hand. Today's part rides the clock's own ring; after 12 at
  // night it's tomorrow, on a second ring just outside it that runs from the 12 round to the hand (owner, 2026-11-08).
  // The last 2 hours stay on, faded, wherever tomorrow's ring frees that part of the clock (so nothing ever overlaps).
  function clockModel(now: number, past: "none" | "recent" | "today"): ClockModel {
    const dropPast = past === "none";
    const ws = now;
    const we = now + 720;
    const mid = (dayOf(now) + 1) * 1440;
    const hasMid = mid > ws && mid < we;
    // The past can only use the part of the clock that tomorrow's ring frees (from noon on), so it never overlaps.
    const pastFrom = dropPast ? now : Math.min(now, Math.max(past === "today" ? mid - 720 : now - 120, mid - 720));
    const arcs: Arc[] = [];
    const marks: Mark[] = [];
    const mark = (it: ClockItem, t: number, label: string, past: boolean): Mark => ({
      it,
      t,
      label,
      past,
      lap: 0,
      a0: 0,
      a: 0,
      cx: 0,
      cy: 0,
      ix: 0,
      iy: 0,
      line: null,
      lab: null,
    });
    for (const it of ITEMS) {
      if (it.allDay) {
        // an all-day deadline or bill is due by the end of its day
        if (it.kind !== "due") continue;
        const t = dayOf(it.start) * 1440 + 1439;
        if (t < now || t > we) continue;
        marks.push(mark(it, t, it.amountCents != null ? `${money(it.amountCents)} due` : dayOf(t) === dayOf(now) ? "due tonight" : "due", false));
        continue;
      }
      if (it.end != null) {
        if (it.end <= pastFrom || it.start >= we) continue;
        const s = Math.max(it.start, pastFrom);
        const e = Math.min(it.end, we);
        if (s < now) arcs.push({ a: s, b: Math.min(e, now), past: true, lap: 0, els: [] });
        if (e > now) arcs.push({ a: Math.max(s, now), b: e, past: false, lap: 0, els: [] });
        if (it.start >= pastFrom) marks.push(mark(it, it.start, fmt(it.start), it.end <= now));
        else if (it.end > now) marks.push(mark(it, (now + e) / 2, `till ${fmt(it.end)}`, false));
        else marks.push(mark(it, (pastFrom + it.end) / 2, `till ${fmt(it.end)}`, true));
      } else {
        if (it.start < pastFrom || it.start > we) continue;
        const label = it.amountCents != null ? `${money(it.amountCents)} due` : `${isExam(it) ? "" : "due "}${fmt(it.start)}`;
        marks.push(mark(it, it.start, label, it.start <= now));
      }
    }
    // "TOMORROW" is written along tomorrow's ring from the 12 whenever there is one, however short (owner, 2026-11-08).
    const word = hasMid ? 0.8 : 0;
    // Spread markers so they never overlap; the hairline still points at the real time. The word holds its place.
    type Slot = { a: number; fixed: boolean; room: boolean; m?: Mark };
    marks.forEach((m) => {
      m.a0 = ang(m.t);
      m.a = m.a0;
    });
    const slots: Slot[] = marks.map((m) => ({ a: m.a, fixed: false, room: false, m }));
    if (word) slots.push({ a: 0.07 + word / 2, fixed: true, room: true });
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
    if (hasMid) {
      for (const a of arcs.splice(0)) {
        if (a.a < mid && a.b > mid) arcs.push({ ...a, b: mid }, { ...a, a: mid, els: [] });
        else arcs.push(a);
      }
    }
    for (const a of arcs) a.lap = hasMid && a.a >= mid ? 1 : 0;
    for (const m of marks) m.lap = hasMid && m.t >= mid ? 1 : 0;
    return { arcs, marks, ps: pastFrom, ws, we, mid: hasMid ? mid : null, word, ahead: dropPast };
  }

  // Inside the face: what's happening now (or next), and today's numbers. Only what the person's data says.
  function faceNow(now: number, we: number) {
    const live = ITEMS.find((it) => !it.allDay && it.end != null && it.start <= now && it.end > now);
    if (live) {
      const e = live.end ?? now;
      const end = fmt(e).slice(-2) === fmt(now).slice(-2) ? fmtShort(e).slice(0, -3) : fmtShort(e);
      return { tag: "Now", text: `${live.title} till ${end}`, it: live };
    }
    const next = ITEMS.filter((it) => !it.allDay && it.start > now && it.start <= we).sort((a, b) => a.start - b.start)[0];
    if (next) return { tag: dayOf(next.start) > dayOf(now) ? "Tomorrow" : "Next", text: `${next.title} ${fmtShort(next.start)}`, it: next };
    // Nothing in the next 12 hours: the next thing on the calendar, whenever it is (a deadline counts by its day).
    const later = ITEMS.filter((it) => (it.allDay ? (dayOf(it.start) + 1) * 1440 : it.start) > now).sort((a, b) => a.start - b.start)[0];
    if (later) {
      const d = dayOf(later.start);
      const when = later.allDay ? (later.amountCents != null ? `${money(later.amountCents)} due` : "due") : fmtShort(later.start);
      return { tag: d === dayOf(now) ? "Later" : d === dayOf(now) + 1 ? "Tomorrow" : `Next · ${dayName(d)}`, text: `${later.title} ${when}`, it: later };
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
      const soon = ITEMS.filter((it) => it.start >= S.now - (S.now % 1440) && it.start < (dayOf(S.now) + 3) * 1440 && (it.end ?? it.start + 1) > S.now);
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
    // The rim is the clock's own ring. After 12 at night, tomorrow's ring runs just outside it, from the 12 round to the hand.
    rimC.setAttribute("d", `M0 ${-R}A${R} ${R} 0 1 1 0 ${R}A${R} ${R} 0 1 1 0 ${-R}`);
    dayG.textContent = "";
    if (CM.mid != null) {
      const am = ang(CM.mid);
      const end = ang(CM.we);
      const r2 = R + LAP;
      svg("path", { d: arcPath(am, end, r2), class: "dc-tmrw-ring" }, dayG);
      const [ix, iy] = pol(am, R);
      const [sx, sy] = pol(am, r2);
      svg("line", { x1: ix, y1: iy, x2: sx, y2: sy, class: "dc-step" }, dayG);
      svg("circle", { cx: sx, cy: sy, r: 2.6, class: "dc-accent-fill" }, dayG);
      // where tomorrow's line ends: the same place on the clock as now
      const [ex, ey] = pol(end, r2);
      svg("circle", { cx: ex, cy: ey, r: 2.2, class: "dc-tmrw-end" }, dayG);
      if (CM.word) {
        const rt = r2 + 8;
        const [px, py] = pol(am + 0.07, rt);
        const [qx, qy] = pol(am + 0.07 + CM.word, rt);
        svg("path", { id: "dc-tmrw", d: `M${px.toFixed(2)} ${py.toFixed(2)}A${rt} ${rt} 0 0 1 ${qx.toFixed(2)} ${qy.toFixed(2)}`, fill: "none" }, dayG);
        const t = svg("text", { class: "dc-word" }, dayG);
        svg("textPath", { href: "#dc-tmrw" }, t).textContent = "TOMORROW";
      }
    }
    arcsG.textContent = "";
    for (const a of CM.arcs) {
      const d = arcPath(ang(a.a), ang(a.b), R + a.lap * LAP);
      const op = a.past ? 0.32 : 1;
      a.els = [];
      if (!a.past) a.els.push(svg("path", { d, class: "dc-arc-glow", opacity: op * 0.55, filter: "url(#dc-soft)" }, arcsG));
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
    stats.forEach((line, i) => {
      svg("text", { x: 0, y: R * 0.3 + i * 14, "text-anchor": "middle", class: "dc-steps" }, stepsG).textContent = line;
    });
    // markers: a hairline and one line of text (icons live in the morph layer)
    leaders.textContent = "";
    callouts.textContent = "";
    for (const m of CM.marks) {
      const u: Pt = [Math.sin(m.a), -Math.cos(m.a)];
      const sup = (Math.abs(u[0]) * 66) / 2 + (Math.abs(u[1]) * 50) / 2;
      const rc = R + 14 + sup + m.lap * LAP;
      const lab = html("div", "dc-co", callouts);
      lab.textContent = m.label;
      if (m.lap) html("span", "dc-tm", lab).textContent = "Tomorrow";
      const w = lab.offsetWidth;
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
    const next = ITEMS.filter((it) => !it.allDay && t0(it) > now).sort((a, b) => t0(a) - t0(b))[0];
    hit.setAttribute(
      "aria-label",
      `Today. Now ${fmt(now)}.${fn ? ` ${fn.tag}: ${fn.text}.` : next ? ` Next: ${next.title} at ${fmt(t0(next))}${dayOf(t0(next)) > dayOf(now) ? " tomorrow" : ""}.` : ""}${
        stats.length ? ` ${stats.join(". ")}.` : ""
      } Open your day as a timeline.`,
    );
  }

  /* ---------- the line through the week ---------- */
  function trackModel(now: number): TrackModel {
    const nodes: Node[] = ITEMS.map((it) => ({ it, t: t0(it), past: (it.end ?? it.start) <= now && t0(it) <= now, x: 0, el: null }));
    const stops: Stop[] = nodes.map((n) => ({ t: n.t, kind: "item" as const, n, x: 0 }));
    for (let d = minDay(); d <= maxDay() + 1; d++) stops.push({ t: d * 1440, kind: "mid", d, x: 0 });
    stops.push({ t: now, kind: "now", x: 0 });
    const ord = { mid: 0, item: 1, now: 2 };
    stops.sort((a, b) => a.t - b.t || ord[a.kind] - ord[b.kind]);
    const gap = (a: Stop, b: Stop) => {
      const dt = b.t - a.t;
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
    stops.forEach((s, i) => {
      if (i) x += gap(stops[i - 1], s);
      s.x = x;
    });
    for (const s of stops) if (s.n) s.n.x = s.x;
    return { nodes, stops, total: x + pad, nowX: stops.find((s) => s.kind === "now")?.x ?? pad, nowEl: null };
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
    for (const n of TM.nodes) {
      if (n.it.end == null) continue;
      const b = html("div", "dc-band", track);
      const x1 = xAt(n.it.start);
      const x2 = xAt(n.it.end);
      b.style.left = `${x1}px`;
      b.style.width = `${Math.max(6, x2 - x1)}px`;
    }
    for (const s of TM.stops) {
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
      const b = html("button", `dc-node ${n.past ? "dc-past" : "dc-future"}`, track);
      b.type = "button";
      b.style.left = `${n.x}px`;
      b.dataset.id = it.id;
      const name = nodeName(it);
      const time = timeOf(it);
      b.innerHTML = `<span class="dc-n-ic" aria-hidden="true">${esc(it.icon)}</span><span class="dc-n-dot"></span><span class="dc-n-t">${esc(time)}</span><span class="dc-n-n">${esc(name)}</span>`;
      b.setAttribute("aria-label", `${name}, ${dayLong(dayOf(n.t))}, ${time}`);
      b.addEventListener("click", () => select(it.id));
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
    const sl = homeScroll();
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
    MAP = CM.marks.map((m) => {
      const node = TM.nodes.find((n) => n.it.id === m.it.id);
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
    const now = S.now;
    const inDay = (it: ClockItem) => dayOf(t0(it)) === d;
    const live = (it: ClockItem) => it.end != null && it.start <= now && it.end > now;
    const pick = (list: ClockItem[]) => list.find(live) || (d === 0 && list.find((it) => t0(it) > now)) || list[0];
    const byTime = (a: ClockItem, b: ClockItem) => t0(a) - t0(b);
    const endsAt = (e: number) => (fmt(e).slice(-2) === fmt(now).slice(-2) ? fmtShort(e).slice(0, -3) : fmtShort(e));
    const hrs = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
    const out: Tile[] = [];
    const work = ITEMS.filter((it) => it.cat === "work" && !it.allDay && it.end != null && inDay(it)).sort(byTime);
    if (work.length) {
      const w = pick(work);
      const end = w.end ?? w.start;
      // running: when it ends; over: the hours it took (from the schedule, never pay); later: when it starts
      const [name, time] = live(w) ? ["Work till", endsAt(end)] : end <= now ? ["Worked", hrs(end - w.start)] : ["Work", fmtShort(w.start)];
      out.push({ it: w, icon: "work", name, time, label: `Work, ${fmt(w.start)} to ${fmt(end)}` });
    }
    const cls = ITEMS.filter((it) => it.cat === "class" && !it.allDay && inDay(it)).sort(byTime);
    if (cls.length) {
      const c = pick(cls);
      const end = c.end ?? c.start;
      const time = live(c) ? `till ${endsAt(end)}` : d === dayOf(now) && end <= now ? "done" : fmtShort(c.start);
      out.push({ it: c, icon: "class", name: c.title, time, label: `${c.title}, ${fmt(c.start)} to ${fmt(end)}` });
    }
    let due = ITEMS.filter((it) => it.cat === "due" && inDay(it)).sort(byTime)[0];
    let ahead = false;
    if (!due && d >= 0) {
      due = ITEMS.filter((it) => it.cat === "due" && t0(it) >= (d + 1) * 1440).sort(byTime)[0];
      ahead = true;
    }
    if (due) {
      const t = t0(due);
      const time = ahead ? dayName(dayOf(t)) : (billOf(due) ?? (due.allDay ? "today" : fmtShort(t)));
      out.push({ it: due, icon: "due", name: due.title, time, label: `${due.title}, due ${dayLong(dayOf(t))}${due.allDay ? "" : ` at ${fmt(t)}`}`, ahead });
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
        const n = TM.nodes.find((x) => x.it.id === c.it.id);
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
    for (const n of TM.nodes) n.el?.classList.toggle("dc-sel", n.it.id === S.sel);
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
  function showDetail() {
    const it = S.sel ? ITEMS.find((x) => x.id === S.sel) : undefined;
    if (!it) {
      detail.innerHTML = "";
      wrapHint(S.open ? 1 : S.p);
      return;
    }
    const t = t0(it);
    let kick = dayLong(dayOf(t));
    if (dayOf(t) === 0) kick = it.end != null && t <= S.now && it.end > S.now ? "Now" : t > S.now ? "Up next" : "Earlier today";
    else if (dayOf(t) > 0 && S.day === 0) kick += dayOf(t) === 1 ? " · tomorrow" : ` · in ${dayOf(t)} days`;
    const when = billOf(it)
      ? `${billOf(it)} ${dayOf(t) === dayOf(S.now) ? "today" : dayName(dayOf(t))}`
      : it.allDay
        ? it.kind === "due"
          ? "Due by the end of the day"
          : "All day"
        : it.end != null
          ? `${fmt(it.start)} – ${fmt(it.end)}`
          : `Due ${fmt(it.start)}`;
    const sub = [it.subtitle, it.source].filter(Boolean).join(" · ");
    detail.innerHTML = `<div class="dc-d-ic" aria-hidden="true">${esc(it.icon)}</div><div class="dc-d-body"><div class="dc-d-k">${esc(kick)}</div><div class="dc-d-t">${esc(
      it.title,
    )}</div><div class="dc-d-w">${esc(when)}</div><div class="dc-d-s">${esc(sub)}</div><button type="button" class="dc-d-open">${esc(openLabel(it.href))}</button></div>`;
    const btn = detail.querySelector(".dc-d-open");
    if (btn) btn.addEventListener("click", () => opts.onOpen(it.href));
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
    if (reduce) return renderReduced(P);
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
    trackWrap.style.opacity = String(P);
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
    prepMorph();
    micons.style.visibility = "visible";
    S.day = 0;
    S.sel = null;
    buildChips();
    markDay();
    showDetail();
    if (S.press < 1) pressTo(1, 110);
    haptic(8);
    animateTo(1, reduce ? 240 : 1300, reduce ? (t) => t : ePlay, finishOpen);
  }
  // Wrapping the timeline back into the clock: the exact path of the open, run backwards as one motion.
  function beginWrap() {
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
    S.day = 0;
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
    animateTo(0, reduce ? 260 : 1150 + Math.min(450, dist * 0.12), reduce ? eIO : ePlay, finishClose);
  }

  /* pull the clock sideways to open; tap to open */
  let drag: { x: number; y: number; id: number; moved: boolean; lastP: number; lastT: number; v: number } | null = null;
  on(hit, "pointerdown", (e: PointerEvent) => {
    if (S.open || S.anim) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, lastP: 0, lastT: performance.now(), v: 0 };
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
      if (cancelled) pressTo(0);
      else open();
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
  /* the day under the middle of the line drives the picker and the tiles */
  let scrollRaf = 0;
  on(
    trackWrap,
    "scroll",
    () => {
      if (!S.open || scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const d = clamp(dayOf(tAt(trackWrap.scrollLeft + G.W / 2)), minDay(), maxDay());
        if (d !== S.day) {
          S.sel = null;
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
    if (S.open || S.anim || drag || wrap) S.dirty = true;
    else rebuild();
  }, 20_000);
  cleanups.push(() => window.clearInterval(tick));

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

  return {
    update(next: ClockData) {
      data = next;
      ITEMS = next.items;
      S.now = nowMinutes(next.tz, next.today);
      if (S.open || S.anim) S.dirty = true;
      else rebuild();
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
