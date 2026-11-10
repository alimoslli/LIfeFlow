/**
 * Today's timeline engine (v3 Day Sky; docs/design/clock/spec.md section 7c). React renders the static skeleton
 * (day-clock.tsx); the sky (sky.ts) draws Today and the pour; this owns the timeline the sky pours into: a window onto
 * the sky with a hill for every day and a valley for every night, its stops, the day picker, the tiles, the card, and
 * every gesture. The motion is one progress value p (0 Today .. 1 timeline), so it can be played, pulled and reversed.
 */
import { isExam, pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { isFinished, isLate, itemColor, paintStrip, stripDark, wheelR, type SkyFace, type SkyGeo, type SkyState } from "./sky";
import { DECAY, NOTCH_MIN, minutesForPx, normalizeWheel, project, rubber, snapTarget, spring, velocity } from "./input";

/** A stop on the line: one thing, or a stack of things at the same moment (`group`, led by `it`). */
type Node = { id: string; it: ClockItem; group: ClockItem[] | null; t: number; past: boolean; x: number; el: HTMLButtonElement | null };
/** item: a thing; mid: a midnight in the week; mark: a month, a year or "Someday" further out; now: where you are. */
type Stop = { t: number; kind: "item" | "mid" | "mark" | "now"; n?: Node; d?: number; label?: string; x: number };
type TrackModel = { nodes: Node[]; stops: Stop[]; total: number; nowX: number; nowEl: HTMLButtonElement | null; somedayX: number };
type Tile = { it: ClockItem; icon: "work" | "class" | "due"; name: string; time: string; label: string; ahead?: boolean };

export type DayClockOptions = {
  /** Draws Today and the pour (sky.ts), on every change and every frame of opening and closing. */
  sky: (state: SkyState) => void;
  /** "Open" on a card: go to the page that owns the item. */
  onOpen: (href: string) => void;
  /** "Done" on a to-do's or an assignment's card (`at`: where its button was, for the celebration). */
  onDone: (it: ClockItem, at?: DOMRect) => void;
  /** "Edit" on an event's, a shift's or an assignment's card: its editor, in place. */
  onEdit: (it: ClockItem) => void;
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
  /** Diagnostics (?debug=1 only): hold the motion at a point between Today (0) and the timeline (1). */
  seek: (p: number) => void;
  /** Pour into the week or fold back to now, as a tap would (the welcome opens it while people add their week). */
  setOpen: (open: boolean) => void;
};

const NS = "http://www.w3.org/2000/svg";
// The timeline's window sits this far in from each side, with these corners.
const INSET = 10;
const WIN_R = 28;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const eIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
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

const TILE_ICONS = {
  work: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="4.5" width="13" height="9.5" rx="2.2"/><path d="M5.5 4.5V3.3c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.2M1.5 8.6h13"/></svg>',
  class:
    '<svg viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M9 2 1.2 6 9 10l7.8-4L9 2z"/><path d="M4.6 8v3.4c1.7 1.6 7.1 1.6 8.8 0V8M16.8 6v4"/></svg>',
  due: '<svg viewBox="0 0 15 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2.5 15V1.8M2.5 2.4h9.2L9.6 5.8l2.1 3.4H2.5"/></svg>',
};

export function createDayClock(root: HTMLElement, initial: ClockData, opts: DayClockOptions): DayClockHandle {
  const reduce = opts.reducedMotion;
  let FACE: SkyFace = { tag: "", text: "", stats: [] };
  // The wheel: the time on top is now while it follows, or wherever it was turned to.
  const drawSky = () => opts.sky({ p: S.p, now: S.now, view: S.follow ? S.now : S.view, data, items: DATED, face: FACE, geo: skyGeo() });
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const hit = $("[data-dc=hit]");
  const foot = $("[data-dc=foot]");
  const hintWrap = $("[data-dc=hintWrap]");
  const pinbar = $("[data-dc=pinbar]");
  const todayBtn = $<HTMLButtonElement>("[data-dc=today]");
  const daysNav = $("[data-dc=days]");
  const chips = $("[data-dc=chips]");
  const trackWrap = $("[data-dc=trackWrap]");
  const track = $("[data-dc=track]");
  const detail = $("[data-dc=detail]");
  const hap = $<HTMLLabelElement>("[data-dc=hap]");

  let data = initial;
  let ITEMS: ClockItem[] = data.items;
  // The sky and the tiles see only dated things; the undated wait on the line under "Someday".
  let DATED = ITEMS.filter((it) => !it.someday);
  const S = {
    now: nowMinutes(data.tz, data.today),
    p: 0,
    open: false,
    anim: null as { id: number } | null,
    day: 0,
    sel: null as string | null,
    dirty: false,
    // the wheel: the time on top (minutes from the start of today), whether it follows now, and its spin
    view: 0,
    follow: true,
    spin: 0,
  };
  const G = {
    W: 0,
    H: 0,
    /** The timeline's window: its top, its height and its horizon (from its top). */
    wrapTop: 52,
    winH: 260,
    wrapHor: 140,
    /** Where the card starts (a stack's list is cut to fit under it). */
    detailY: 0,
    /** The line's home scroll (now in the middle), and where a wrap started from when it wasn't home. */
    home: 0,
    wrapSl: null as number | null,
  };
  let TM: TrackModel = { nodes: [], stops: [], total: 0, nowX: 0, nowEl: null, somedayX: Infinity };
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
    it.done
      ? it.title
      : it.amountCents != null
        ? `${it.title} · ${billOf(it)}`
        : it.kind === "due" && !it.allDay && !it.someday && (it.origin === "task" || it.origin === "assignment") && !isExam(it)
          ? `${it.title} due`
          : it.title;

  /* ---------- Day Sky: the line's shape ---------- */
  // The width of the line in view (the window is inset from the sides).
  const VW = () => G.W - 2 * INSET;
  let SUN = sunTimes(data.today, data.tz);
  type Half = { day: boolean; a: number; b: number };
  const halfOf = (t: number): Half => {
    const d = Math.floor(t / 1440);
    const m = t - d * 1440;
    if (m >= SUN.rise && m < SUN.set) return { day: true, a: d * 1440 + SUN.rise, b: d * 1440 + SUN.set };
    return m >= SUN.set
      ? { day: false, a: d * 1440 + SUN.set, b: (d + 1) * 1440 + SUN.rise }
      : { day: false, a: (d - 1) * 1440 + SUN.set, b: d * 1440 + SUN.rise };
  };
  // the week rises and falls (a hill a day, a valley a night); before and after it, the line is flat
  const inWeek = (t: number) => {
    const h = halfOf(t);
    const c = (h.a + h.b) / 2;
    return c >= minDay() * 1440 && c < (maxDay() + 1) * 1440;
  };
  const ampCache = new Map<number, number>();
  function amp(h: Half) {
    let v = ampCache.get(h.a);
    if (v == null) {
      // busier days stand taller; nights dip deeper the more they hold
      const n = DATED.filter((it) => !it.allDay && it.start >= h.a && it.start < h.b).length;
      v = h.day ? clamp(42 + n * 7, 46, G.wrapHor - 34) : -clamp(30 + n * 6, 34, G.winH - G.wrapHor - 36);
      ampCache.set(h.a, v);
    }
    return v;
  }
  // The line's scroll, mirrored here: every frame of the fold needs it, and reading it from the page right after the
  // frame has changed something makes the browser lay the whole page out again mid-frame (the fold's lag, owner
  // 2026-11-09). Written through setSl, and taken from the page only when the page scrolls itself.
  let SLm = 0;
  function setSl(v: number) {
    trackWrap.scrollLeft = SLm = v;
  }
  /** The line's height at a moment, from the window's top. */
  function waveY(t: number) {
    if (!inWeek(t)) return G.wrapHor;
    const h = halfOf(t);
    return G.wrapHor - amp(h) * Math.sin(Math.PI * clamp((t - h.a) / (h.b - h.a), 0, 1));
  }
  const skyOpts = () => ({ inWeek, rise: SUN.rise, set: SUN.set });
  /** Where the open line is, for the sky's morph (at the line's current scroll, which is home while it moves). */
  function skyGeo(): SkyGeo | null {
    if (!TM.stops.length || !G.W) return null;
    const sl = SLm;
    const vw = VW();
    return {
      win: { x: INSET, y: G.wrapTop, w: vw, h: G.winH, r: WIN_R },
      hor: G.wrapTop + G.wrapHor,
      lineAt: (t) => [INSET + xAt(t) - sl, G.wrapTop + waveY(t)],
      tAtX: (x) => tAt(x - INSET + sl),
      nodes: TM.nodes
        .filter((n) => !n.it.someday && n.x > sl - 40 && n.x < sl + vw + 40)
        .map((n) => ({ ids: (n.group ?? [n.it]).map((g) => g.id), t: n.t, x: INSET + n.x - sl, y: G.wrapTop + waveY(n.t), icon: n.it.icon })),
      inWeek,
    };
  }
  // The window's sky and line are painted for the stretch around what's in view and repainted as it scrolls far.
  // Painting it is the heaviest thing the line does, so it's painted only when what it shows changed (the line was
  // rebuilt, the minute moved) or the view left the stretch it covers; the fold used to paint it twice (owner: laggy).
  let strip: { el: SVGSVGElement; x0: number; x1: number; key: string } | null = null;
  let stripGen = 0;
  function drawStrip() {
    if (!TM.stops.length) return;
    const vw = VW();
    const sl = SLm;
    const key = `${stripGen}|${S.now}|${G.winH}|${vw}`;
    if (strip?.key === key && sl >= strip.x0 && sl + vw <= strip.x1) {
      if (!strip.el.isConnected) track.prepend(strip.el);
      return;
    }
    const x0 = Math.max(-INSET, sl - vw);
    const x1 = Math.min(TM.total + INSET, sl + 2 * vw);
    const el = strip?.el ?? (svg("svg", { class: "dc-strip", "aria-hidden": "true" }) as SVGSVGElement);
    if (!el.isConnected) track.prepend(el);
    el.textContent = "";
    el.style.left = `${x0}px`;
    el.setAttribute("width", String(x1 - x0));
    el.setAttribute("height", String(G.winH));
    el.setAttribute("viewBox", `0 0 ${x1 - x0} ${G.winH}`);
    const defs = svg("defs", {}, el);
    const g = svg("g", {}, el);
    paintStrip(g, defs, {
      x0: 0,
      x1: x1 - x0,
      tAt: (x) => tAt(x + x0),
      xOf: (t) => xAt(t) - x0,
      yOf: waveY,
      top: 0,
      hor: G.wrapHor,
      bottom: G.winH,
      inWeek,
      now: S.now,
      rise: SUN.rise,
      set: SUN.set,
      items: DATED,
    });
    strip = { el, x0, x1, key };
  }

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

  /* ---------- geometry: the sky to tap, then the window, the tiles and the card under the day picker ---------- */
  function layout() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    G.W = W;
    G.H = H;
    G.winH = Math.round(clamp(H * 0.44, 236, 300));
    G.wrapHor = Math.round(G.winH * 0.54);
    const chipY = G.wrapTop + G.winH + 12;
    const detailY = (G.detailY = chipY + 52);
    Object.assign(hit.style, { left: "0px", top: "48px", width: `${W}px`, height: `${Math.round(H * 0.6)}px` });
    trackWrap.style.top = `${G.wrapTop}px`;
    trackWrap.style.height = `${G.winH}px`;
    chips.style.top = `${chipY}px`;
    detail.style.top = `${detailY}px`;
    pinbar.style.top = `${detailY}px`;
    hintWrap.style.top = `${detailY + 62}px`;
    rebuild();
  }

  /* ---------- Today's words (drawn by the sky) and what the sky says to a screen reader ---------- */
  // The small line says when ("NOW · TILL 10", "NEXT · 9 AM", "TOMORROW · 8 AM"); the big line is just the name.
  function faceNow(now: number) {
    const we = now + 1440;
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
  // what comes after the face's own thing, by name (owner, 2026-11-10: show your life, not counts): "Then 💼 Work 5 PM ·
  // 📄 Argument essay tomorrow"
  function thenLine(skip: ClockItem | null) {
    const today = dayOf(S.now);
    const until = (today + 3) * 1440;
    const clip = (t: string) => (t.length > 18 ? `${t.slice(0, 17).trimEnd()}…` : t);
    const when = (it: ClockItem) => {
      const d = dayOf(it.start);
      return d === today ? (it.allDay ? "today" : fmtShort(it.start)) : d === today + 1 ? "tomorrow" : dayName(d);
    };
    const next = DATED.filter(
      (it) =>
        it !== skip &&
        !it.done &&
        it.origin !== "day" &&
        it.origin !== "goal" &&
        it.origin !== "milestone" &&
        (it.allDay ? (dayOf(it.start) + 1) * 1440 > S.now : it.start > S.now) &&
        it.start < until,
    )
      .sort((a, b) => a.start - b.start)
      .slice(0, 2);
    return next.length ? `Then ${next.map((it) => `${it.icon} ${clip(it.title)} ${when(it)}`).join(" · ")}` : null;
  }
  function faceStats(skip: ClockItem | null = null) {
    const first: string[] = [];
    if (data.steps != null) first.push(`${data.steps.toLocaleString("en-US")} steps`);
    if (data.sleepHours != null) first.push(`${Math.floor(data.sleepHours)}h ${String(Math.round((data.sleepHours % 1) * 60)).padStart(2, "0")}m sleep`);
    const lines = first.length ? [first.join(" · ")] : [];
    if (data.spentTodayCents != null) lines.push(`${money(data.spentTodayCents)} spent today`);
    const then = thenLine(skip);
    if (then) lines.push(then);
    if (!lines.length) {
      // nothing measured and nothing in the next days: what the line holds, so the face still speaks for the person's life
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
    return lines;
  }

  function rebuildFace() {
    const fn = faceNow(S.now);
    const stats = faceStats(fn.it);
    FACE = { tag: fn.tag, text: fn.text, stats, icon: fn.it?.icon };
    hit.setAttribute(
      "aria-label",
      `Today. Now ${fmt(S.now)}. ${fn.tag}: ${fn.text}.${stats.length ? ` ${stats.join(". ")}.` : ""} Open your day as a timeline.`,
    );
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
      // room for each stop's name under it (owner, 2026-11-10: the line shows what each thing is, not only its time)
      return 104 + clamp(((dt - 180) / 60) * 6, 0, 30);
    };
    const pad = VW() / 2;
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
    let x = TM.nowX - VW() * 0.5;
    for (const n of TM.nodes) {
      const v = n.x - x;
      if (v > -46 && v < 44) {
        x = n.x - 44;
        break;
      }
    }
    return clamp(x, 0, TM.total - VW());
  }

  function rebuildTrack() {
    SUN = sunTimes(data.today, data.tz);
    ampCache.clear();
    TM = trackModel(S.now);
    stripGen++;
    track.textContent = "";
    strip = null;
    track.style.width = `${TM.total}px`;
    for (const s of TM.stops) {
      if (s.kind === "mark") {
        const m = html("div", "dc-mid dc-era", track);
        m.style.left = `${s.x}px`;
        m.style.top = `${G.wrapHor + 22}px`;
        html("span", "", m).textContent = s.label ?? "";
        continue;
      }
      if (s.kind !== "mid" || s.d == null || s.d < minDay()) continue;
      const tmrw = s.d === dayOf(S.now) + 1;
      const m = html("div", `dc-mid${tmrw ? " dc-next" : ""}`, track);
      m.style.left = `${xAt(s.d * 1440 + (SUN.rise + SUN.set) / 2)}px`;
      m.style.top = `${G.wrapHor + 22}px`;
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
      const g = n.group ?? [it];
      b.style.top = `${waveY(n.t)}px`;
      b.style.setProperty("--c", itemColor(it));
      if (!it.someday && stripDark(n.t, skyOpts()) > 0.5) b.classList.add("dc-nt");
      if (g.some((x) => isLate(x, S.now))) b.classList.add("dc-late");
      else if (g.every((x) => isFinished(x, S.now))) b.classList.add("dc-fin");
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
    // now: the skyling standing on the line (a tap folds it all back into the sky)
    const np = html("button", "dc-now", track);
    np.type = "button";
    np.style.left = `${TM.nowX}px`;
    np.style.top = `${waveY(S.now)}px`;
    np.innerHTML = `<canvas class="dc-now-who" width="24" height="24" aria-hidden="true"></canvas><span class="dc-now-t">${fmt(S.now)}</span>`;
    np.setAttribute("aria-label", `Now, ${fmt(S.now)}. Back to Today`);
    np.addEventListener("click", () => close(true));
    TM.nowEl = np;
    drawStrip();
  }

  /* ---------- before the motion: the line at home (now in the middle), its window painted there ---------- */
  // Folding back keeps the time in the middle of the line (a pull, a pinch, Escape); the now pill folds back to now,
  // rewinding the line to now in the first part of the same motion.
  function prepMorph(keepScroll = false, toNow = false) {
    // once, before the motion (the page may have stopped a scroll at its end)
    SLm = trackWrap.scrollLeft;
    if (keepScroll && toNow) S.follow = true;
    else if (keepScroll) {
      S.view = clamp(tAt(trackWrap.scrollLeft + VW() / 2), minDay() * 1440, (maxDay() + 1) * 1440 - 1);
      S.follow = Math.abs(S.view - S.now) < 10;
    }
    const sl = keepScroll && !toNow ? trackWrap.scrollLeft : !S.follow ? clamp(xAt(S.view) - VW() / 2, 0, Math.max(0, TM.total - VW())) : homeScroll();
    G.home = sl;
    if (keepScroll && Math.abs(trackWrap.scrollLeft - sl) > 1) G.wrapSl = trackWrap.scrollLeft;
    else {
      G.wrapSl = null;
      setSl(sl);
    }
    drawStrip();
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
      x = (first ? first.x : xAt(d * 1440 + 480)) - VW() * 0.22;
    }
    S.sel = null;
    trackWrap.scrollTo({ left: clamp(x, 0, TM.total - VW()), behavior: reduce ? "auto" : "smooth" });
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
          if (v < 50 || v > VW() - 50) trackWrap.scrollTo({ left: clamp(n.x - VW() / 2, 0, TM.total - VW()), behavior: reduce ? "auto" : "smooth" });
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
              : href.startsWith("/jarvis")
                ? "Ask about it"
                : href.startsWith("/habits")
                  ? "Open Health"
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
      : it.origin === "day"
        ? "How the day went"
        : it.origin === "promise"
          ? it.done
            ? "You kept it"
            : `You said you'd do it by ${fmt(it.start)}`
          : it.done
            ? `Done at ${fmt(it.start)}`
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
    const canDo = (it.origin === "task" || it.origin === "reminder" || it.origin === "assignment") && !!it.ref && !it.done;
    const inPlace = it.origin === "event" || it.origin === "shift" || it.origin === "assignment";
    const onPage = it.origin === "task" || it.origin === "reminder" || it.origin === "goal" || it.origin === "milestone";
    const acts = `${canDo ? '<button type="button" class="dc-d-done">Done</button>' : ""}${inPlace ? '<button type="button" class="dc-d-edit">Edit</button>' : ""}<button type="button" class="dc-d-open">${esc(onPage ? "Edit" : openLabel(it.href))}</button>`;
    detail.innerHTML = `<div class="dc-d-ic" aria-hidden="true">${esc(it.icon)}</div><div class="dc-d-body"><div class="dc-d-k">${esc(kick)}</div><div class="dc-d-t">${esc(
      it.title,
    )}</div><div class="dc-d-w">${esc(when)}</div><div class="dc-d-s">${esc(sub)}</div><div class="dc-d-acts">${acts}</div></div>`;
    detail.querySelector(".dc-d-open")?.addEventListener("click", () => opts.onOpen(it.href));
    detail.querySelector(".dc-d-edit")?.addEventListener("click", () => opts.onEdit(it));
    detail.querySelector(".dc-d-done")?.addEventListener("click", (e) => {
      // where it was done, for the celebration (the card closes as it's tapped)
      const at = (e.currentTarget as HTMLElement).getBoundingClientRect();
      S.sel = null;
      // gone from the line at once (with its reminder); the refresh that follows confirms it, or brings it back if the save failed
      const gone = (x: ClockItem) =>
        x.id === it.id || (it.origin !== "assignment" && !!it.ref && x.ref === it.ref && (x.origin === "task" || x.origin === "reminder"));
      ITEMS = ITEMS.filter((x) => !gone(x));
      DATED = ITEMS.filter((x) => !x.someday);
      if (S.open) refreshOpen();
      else rebuild();
      showDetail();
      markSel();
      opts.onDone(it, at);
    });
    wrapHint(S.open ? 1 : S.p);
  }

  function wrapHint(P: number) {
    hintWrap.style.opacity = String(detail.innerHTML ? 0 : seg(P, 0.92, 1));
  }
  // One frame of the motion. The sky (sky.ts) pours itself into the line; the window's sky fades in under it, then the
  // line's own stops, picker, tiles and card arrive as it lands, so the two never show at once. Reduced motion: a fade.
  function render() {
    const P = clamp(S.p, 0, 1);
    // wrapping back from another part of the line: it rewinds to now in the first part of the same motion
    if (G.wrapSl != null) setSl(G.home + (G.wrapSl - G.home) * eIO(seg(P, 0.78, 1)));
    foot.style.opacity = String(1 - seg(P, 0, reduce ? 0.6 : 0.18));
    foot.style.transform = reduce ? "" : `translateY(${(14 * eOut(seg(P, 0, 0.25))).toFixed(2)}px)`;
    foot.style.visibility = P > (reduce ? 0.6 : 0.25) ? "hidden" : "visible";
    trackWrap.style.opacity = String(reduce ? P : seg(P, 0.42, 0.88));
    trackWrap.style.setProperty("--tline", String(reduce ? P : seg(P, 0.84, 0.97)));
    trackWrap.style.visibility = P > 0 ? "visible" : "hidden";
    todayBtn.style.opacity = String(1 - seg(P, 0, reduce ? 0.5 : 0.3));
    todayBtn.style.visibility = P > (reduce ? 0.5 : 0.3) ? "hidden" : "visible";
    const pk = reduce ? P : seg(P, 0.78, 0.94);
    daysNav.style.opacity = String(pk);
    daysNav.style.transform = reduce ? "" : `translateY(${(-8 * (1 - pk)).toFixed(2)}px)`;
    daysNav.style.visibility = pk > 0 ? "visible" : "hidden";
    chips.style.visibility = P > 0.78 ? "visible" : "hidden";
    chips.querySelectorAll<HTMLElement>(".dc-tile").forEach((c, i) => {
      const t = reduce ? P : seg(P, 0.82 + i * 0.03, 0.95 + i * 0.02);
      c.style.opacity = String(t);
      c.style.transform = reduce ? "" : `translateY(${(10 * (1 - eOut(t))).toFixed(2)}px)`;
    });
    const dt = reduce ? P : seg(P, 0.86, 1);
    detail.style.opacity = String(dt);
    detail.style.transform = reduce ? "" : `translateY(${(12 * (1 - eOut(dt))).toFixed(2)}px)`;
    wrapHint(P);
    drawSky();
  }

  /* ---------- driving the motion ---------- */
  function setInteractive(open: boolean) {
    root.dataset.open = open ? "true" : "false";
    hit.style.display = open ? "none" : "block";
  }
  // What Today is doing, for tests and assistive tech: "clock" (the sky), "moving" or "timeline".
  const setState = (st: "clock" | "moving" | "timeline") => {
    root.dataset.state = st;
  };
  function finishOpen() {
    S.open = true;
    drawStrip();
    setState("timeline");
    G.wrapSl = null;
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
        // new data that came in during the move (a Done saved, a refresh) is shown once it settles open
        if (S.dirty && S.open && !S.anim && !drag && !wrap) {
          S.dirty = false;
          refreshOpen();
        }
      }
    };
    a.id = requestAnimationFrame(step);
  }
  function open() {
    if (S.open || S.anim) return;
    // mid-glide (keys, a notch, a flick, Back to now): open where it's going
    if (S.spin && glideTo != null) {
      S.view = glideTo;
      S.follow = Math.abs(glideTo - S.now) < 0.5;
    }
    stopSpin();
    prepMorph();
    S.day = S.follow ? 0 : clamp(dayOf(S.view), minDay(), maxDay());
    S.sel = null;
    buildChips();
    markDay();
    showDetail();
    haptic(8);
    animateTo(1, reduce ? 240 : 1250, reduce ? (t) => t : ePlay, finishOpen);
  }
  // Folding the timeline back into the sky: the exact path of the open, run backwards as one motion.
  function beginWrap(toNow = false) {
    stopSpin();
    setState("moving");
    S.open = false;
    S.sel = null;
    showDetail();
    markSel();
    prepMorph(true, toNow);
  }
  function finishClose() {
    setInteractive(false);
    G.wrapSl = null;
    setSl(G.home);
    S.day = S.follow ? 0 : clamp(dayOf(S.view), minDay(), maxDay());
    markDay();
    buildChips();
    if (S.dirty) {
      S.dirty = false;
      rebuild();
    }
    render();
    setState("clock");
  }
  function close(toNow = false) {
    if (!S.open || S.anim) return;
    const dist = Math.abs(trackWrap.scrollLeft - homeScroll());
    beginWrap(toNow);
    setInteractive(false);
    animateTo(0, reduce ? 260 : 1050 + Math.min(300, dist * 0.08), reduce ? eIO : ePlay, finishClose);
  }

  /* ---------- the wheel: turn it through time ("the mechanism"; docs/research/2026-11-09-the-mechanism.md). One scale:
     12 hours across the card for a trackpad, a mouse wheel and a mouse drag; a finger moves the rim exactly as far as it
     moves. A flick coasts like iOS and lands on now, a thing or a quarter hour; the ends of the week push back. ---------- */
  const minPerPx = () => 1440 / (2 * Math.PI * (Number(root.dataset.wheelR) || wheelR(VW(), G.wrapHor)));
  const viewMin = () => minDay() * 1440;
  const viewMax = () => (maxDay() + 1) * 1440 - 1;
  const viewNow = () => (S.follow ? S.now : S.view);
  const starts = () => DATED.filter((it) => !it.allDay).map((it) => it.start);
  // past the first or last day the wheel gives a little and comes back (a rubber band, never a hard stop)
  const elastic = (t: number) => (t < viewMin() ? viewMin() - rubber(viewMin() - t, 720) : t > viewMax() ? viewMax() + rubber(t - viewMax(), 720) : t);
  function setView(t: number) {
    S.view = t;
    S.follow = Math.abs(S.view - S.now) < 0.5;
    root.dataset.view = String(Math.round(viewNow()));
    drawSky();
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
  // where quick keys and mouse notches are heading, so each one adds to the last instead of to the half-way point; and
  // where the current glide will land (opening mid-glide opens there, not half way)
  let pendingTo: number | null = null;
  let glideTo: number | null = null;
  /** Moves the time on top to `to`: a spring that starts at `v` (minutes per ms) and settles without overshoot. */
  function glide(to: number, v = 0, ms = 380) {
    stopSpin();
    const from = viewNow();
    to = clamp(to, viewMin(), viewMax());
    if (reduce || Math.abs(to - from) < 0.5) {
      setView(to);
      if (Math.abs(to - S.now) < 0.5) S.follow = true;
      return afterSpin();
    }
    const start = performance.now();
    glideTo = to;
    const step = (t: number) => {
      const k = t - start;
      const x = spring(from, to, v, k, ms);
      setView(k >= ms * 1.25 ? to : x);
      if (k < ms * 1.25) S.spin = requestAnimationFrame(step);
      else {
        S.spin = 0;
        pendingTo = null;
        glideTo = null;
        if (Math.abs(to - S.now) < 0.5) {
          S.follow = true;
          haptic(10);
        }
        drawSky();
        afterSpin();
      }
    };
    S.spin = requestAnimationFrame(step);
  }
  // back to now: the farther away, the longer the glide (never more than 1.1 s)
  const goNow = () => glide(S.now, 0, clamp(380 + Math.abs(S.now - viewNow()) * 0.25, 380, 1100));
  // let go: project where the coast would rest (iOS's 0.998 per ms, at most a day), land on now, a thing or a quarter
  // hour near it, and get there with a spring that starts at the release speed
  function fling(v: number) {
    const from = viewNow();
    const rest = clamp(project(from, v, DECAY), from - 1440, from + 1440);
    const to = clamp(snapTarget(rest, S.now, starts()), viewMin(), viewMax());
    glide(to, v, clamp(380 + Math.abs(to - from) * 0.35, 380, 1100));
  }
  const backBtn = root.querySelector<HTMLButtonElement>("[data-dc=back]");
  if (backBtn) on(backBtn, "click", () => goNow());

  type Drag = { x: number; y: number; id: number; moved: boolean; v0: number; mouse: boolean; caught: boolean; samples: { t: number; v: number }[] };
  let drag: Drag | null = null;
  on(hit, "pointerdown", (e: PointerEvent) => {
    if (S.open || S.anim) return;
    const caught = S.spin !== 0;
    stopSpin();
    pendingTo = null;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, v0: viewNow(), mouse: e.pointerType === "mouse", caught, samples: [] };
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  on(hit, "pointermove", (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      drag.moved = true;
      // start from here, so the first step doesn't jump by the slop
      drag.x = e.clientX;
      hit.classList.add("dc-grabbing");
      haptic(6);
    }
    if (!drag.moved) return;
    // to the right goes back in time; a finger moves the rim with it, a mouse uses the card's scale
    const ddx = e.clientX - drag.x;
    const t = drag.v0 - (drag.mouse ? minutesForPx(ddx, VW()) : ddx * minPerPx());
    drag.samples.push({ t: performance.now(), v: t });
    if (drag.samples.length > 12) drag.samples.shift();
    setView(elastic(t));
  });
  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    hit.classList.remove("dc-grabbing");
    if (!d.moved) {
      if (d.caught) afterSpin();
      else if (!cancelled) open();
      return;
    }
    const last = d.samples[d.samples.length - 1];
    const v = cancelled || !last || performance.now() - last.t > 90 ? 0 : clamp(velocity(d.samples), -4, 4);
    fling(v);
  };
  on(hit, "pointerup", (e: PointerEvent) => endDrag(e, false));
  on(hit, "pointercancel", (e: PointerEvent) => endDrag(e, true));
  // A trackpad moves time 1:1 at the card's scale (the OS adds its own momentum); a mouse notch is half an hour, eased,
  // and notches add up. A scroll that began on the page keeps scrolling the page; a sideways swipe never goes back.
  let lastWheel = 0;
  let pageWheel = 0;
  let wheelIdle = 0;
  on(
    window,
    "wheel",
    (e: WheelEvent) => {
      if (!(e.target instanceof Element && hit.contains(e.target))) pageWheel = performance.now();
    },
    { passive: true },
  );
  on(
    hit,
    "wheel",
    (e: WheelEvent) => {
      if (S.open || S.anim || e.ctrlKey) return;
      const t = performance.now();
      const w = normalizeWheel(e, t - lastWheel);
      lastWheel = t;
      if (w.axis === "y" && t - pageWheel < 300) {
        pageWheel = t;
        return;
      }
      e.preventDefault();
      if (w.kind === "notch") {
        pendingTo = clamp((pendingTo ?? viewNow()) + Math.sign(w.px) * NOTCH_MIN, viewMin(), viewMax());
        glide(pendingTo, 0, 160);
      } else {
        stopSpin();
        pendingTo = null;
        setView(clamp(viewNow() + minutesForPx(w.px, VW()), viewMin(), viewMax()));
      }
      // once it rests, it settles on now or on a thing close by
      window.clearTimeout(wheelIdle);
      wheelIdle = window.setTimeout(() => {
        pendingTo = null;
        const v = viewNow();
        const near = starts().find((s) => Math.abs(s - v) <= 10);
        if (!S.follow && Math.abs(v - S.now) < 12) goNow();
        else if (near != null && !S.spin) glide(near, 0, 180);
        else afterSpin();
      }, 160);
    },
    { passive: false },
  );
  cleanups.push(() => window.clearTimeout(wheelIdle));
  on(hit, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
      return;
    }
    if (S.anim || S.open) return;
    // arrows: an hour (Shift: a quarter hour); Page Up and Down: six hours; Home: now
    const step = { ArrowLeft: -60, ArrowRight: 60, PageUp: -360, PageDown: 360 }[e.key];
    if (step != null) {
      e.preventDefault();
      const from = pendingTo ?? Math.round(viewNow() / 15) * 15;
      pendingTo = clamp(from + (e.shiftKey && Math.abs(step) === 60 ? step / 4 : step), viewMin(), viewMax());
      glide(pendingTo, 0, 200);
    } else if (e.key === "Home") {
      e.preventDefault();
      pendingTo = null;
      goNow();
    }
  });
  on(todayBtn, "click", () => open());
  on(document, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && S.open) close();
  });

  /* pull the line down, or pinch it, to fold it back into the sky; it follows the finger and settles on release */
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
      // a finger folds it with a pull down; a mouse needs a clear downward drag, so a sloppy pan never closes it
      if (!wrap.kind && (e.pointerType === "mouse" ? dy > 40 && dy > Math.abs(dx) * 2 : dy > 10 && dy > Math.abs(dx) * 1.2)) {
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
  /* the open line with a mouse: the wheel scrolls it sideways, and a drag pans it and coasts (touch and trackpads
     scroll it natively, with the OS's own momentum) */
  on(
    trackWrap,
    "wheel",
    (e: WheelEvent) => {
      if (!S.open || e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      setSl(SLm + normalizeWheel(e, 100).px);
    },
    { passive: false },
  );
  let pan: { x: number; sl: number; id: number; moved: boolean; samples: { t: number; v: number }[] } | null = null;
  let coast = 0;
  on(trackWrap, "pointerdown", (e: PointerEvent) => {
    cancelAnimationFrame(coast);
    if (S.open && !S.anim && e.pointerType === "mouse" && e.button === 0)
      pan = { x: e.clientX, sl: trackWrap.scrollLeft, id: e.pointerId, moved: false, samples: [] };
  });
  on(trackWrap, "pointermove", (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id || wrap?.kind) return;
    const dx = e.clientX - pan.x;
    if (!pan.moved && Math.abs(dx) > 6) {
      pan.moved = true;
      trackWrap.classList.add("dc-grabbing");
    }
    if (!pan.moved) return;
    setSl(pan.sl - dx);
    pan.samples.push({ t: performance.now(), v: trackWrap.scrollLeft });
    if (pan.samples.length > 12) pan.samples.shift();
  });
  const endPan = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id) return;
    const p = pan;
    pan = null;
    trackWrap.classList.remove("dc-grabbing");
    if (!p.moved) return;
    wrapSuppressClick = performance.now();
    // it coasts like iOS (0.998 per ms) from the speed it was let go at
    const last = p.samples[p.samples.length - 1];
    let v = !last || performance.now() - last.t > 90 || reduce ? 0 : clamp(velocity(p.samples), -6, 6);
    let prev = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - prev);
      prev = t;
      v *= Math.pow(DECAY, dt);
      setSl(SLm + v * dt);
      if (Math.abs(v) > 0.02) coast = requestAnimationFrame(step);
    };
    if (v) coast = requestAnimationFrame(step);
  };
  on(trackWrap, "pointerup", endPan);
  on(trackWrap, "pointercancel", endPan);
  cleanups.push(() => cancelAnimationFrame(coast));
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
      SLm = trackWrap.scrollLeft;
      if (!S.open || scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const x = SLm + VW() / 2;
        if (strip && (SLm < strip.x0 + VW() * 0.3 || SLm + VW() > strip.x1 - VW() * 0.3)) {
          strip.key = "";
          drawStrip();
        }
        const d = x >= TM.somedayX ? SOMEDAY : dayOf(tAt(x));
        if (d !== S.day) {
          // the card stays while its node is still on screen (a tap near the edge scrolls it in)
          const sel = nodeOf(S.sel);
          if (!sel || sel.x < trackWrap.scrollLeft || sel.x > trackWrap.scrollLeft + VW()) S.sel = null;
          setDay(d);
          markSel();
        }
      });
    },
    { passive: true },
  );

  /* ---------- building everything ---------- */
  function rebuild() {
    rebuildFace();
    rebuildTrack();
    buildDays();
    markDay();
    buildChips();
    showDetail();
    if (S.open) {
      S.p = 1;
      finishOpen();
      setSl(homeScroll());
      S.day = 0;
      markDay();
      buildChips();
    } else prepMorph();
    render();
  }

  // Today follows the real time: a quiet check every 20 seconds, redrawn when the minute changes.
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
    rebuildFace();
    rebuildTrack();
    buildDays();
    setSl(sl);
    drawStrip();
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
    seek(p: number) {
      if (S.anim) return;
      if (!S.open && S.p === 0 && p > 0) prepMorph();
      S.p = clamp(p, 0, 1);
      render();
    },
    setOpen(o: boolean) {
      if (o) open();
      else close(true);
    },
    pinTime() {
      const t = S.open ? tAt(trackWrap.scrollLeft + VW() / 2) : S.now;
      return dayOf(t) === dayOf(S.now) && t < S.now ? Math.ceil(S.now / 15) * 15 : quarter(t);
    },
    destroy() {
      if (S.anim) cancelAnimationFrame(S.anim.id);
      for (const c of cleanups.splice(0)) c();
    },
  };
}
