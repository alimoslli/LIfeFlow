/**
 * Today as a wheel of time (owner, 2026-11-09): "the character is running on the line that's moving back with the day
 * with the events attached ... the background is what the sky looks like ... a wrapped timeline, it keeps going back in
 * time with the rotations, one button brings it back smoothly to now, and a tap turns it smoothly into the timeline".
 *
 * A sky card (a widget of the day) holds the top half of a wheel. One turn of the wheel is one day, so the half above
 * the horizon shows six hours behind and six ahead. The companion runs in place on top, at the time on top (now, while
 * the wheel follows it); your things ride the rim and roll back under it as the day goes by. Daylight on the rim is
 * bright and night is dim, with a gold dot at each sunrise and sunset. The sky behind is the real sky at the time on
 * top (lib/sky.ts). Turning the wheel (engine.ts) goes back or ahead through the days; "Back to now" rolls it home.
 * A tap unrolls the rim onto the timeline: every point of it slides to where the line puts that time, so the wheel
 * becomes the line without a jump, and wrapping the line rolls it back up at the line's time.
 *
 * Drawing only; the engine owns the time on top, the gestures, the timeline and the cards. No state here except the
 * companion's step and which way it last ran.
 */
import { pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { css, darkness, skyAt } from "@/lib/sky";
import { COMPANIONS, drawCompanion, nightOf } from "./companion";

export type DomeFace = { tag: string; text: string; stats: string[] };
export type DomeState = {
  p: number;
  now: number;
  /** The time on top of the wheel (minutes from the start of today): now while it follows. */
  view: number;
  data: ClockData;
  items: ClockItem[];
  face: DomeFace;
  lineY: number;
  /** Where a time sits on screen on the open timeline, so the rim unrolls exactly onto it. */
  lineX: (t: number) => number;
};

const NS = "http://www.w3.org/2000/svg";
const DAY = 1440;
/** Minutes from the top of the wheel to each end of the horizon: one turn is one day, half of it shows. */
const SPAN = DAY / 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mod = (t: number) => ((t % DAY) + DAY) % DAY;
/** The wheel's radius for a width (the engine uses it too, so a finger moves the rim exactly as far as it moves). */
export const wheelR = (W: number) => Math.round(clamp(W / 2 - 56, 96, 138));
function fmtShort(min: number) {
  const m = Math.round(mod(min));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
/** Sunrise and sunset come from the time zone, not a place, so they're shown "about", to 5 minutes (10 over an hour). */
function fmtFor(min: number) {
  const m = Math.max(5, min < 60 ? Math.round(min / 5) * 5 : Math.round(min / 10) * 10);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}
let uid = 0;

export function createDome(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  if (!svgQ || !whoQ) return { draw: () => {}, destroy: () => {} };
  const svg: SVGSVGElement = svgQ;
  const who: HTMLCanvasElement = whoQ;
  const back = root.querySelector<HTMLElement>("[data-dc=back]");
  const id = `dc-sky-${++uid}`;
  const lead = COMPANIONS[1];
  let last: DomeState | null = null;
  let sun: { key: string; rise: number; set: number } | null = null;
  let step = 0;
  let pose: "walk" | "stand" | "sleep" = "stand";
  let night = false;
  // which way the companion runs (it turns round when the wheel goes back in time), and when it last stepped
  let lastView: number | null = null;
  let dir = 1;
  let stepAt = 0;
  const el = (tag: string, a: Record<string, string | number>, parent: Element = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, String(a[k]));
    parent.appendChild(e);
    return e;
  };
  const text = (x: number, y: number, s: string, cls: string, anchor = "middle", parent: Element = svg) => {
    const t = el("text", { x, y, "text-anchor": anchor, class: cls }, parent);
    t.textContent = s;
    return t;
  };
  const paintWho = () => drawCompanion(who, night ? nightOf(lead) : lead, pose, step);
  // the companion jogs in place: a step every half second (never with reduced motion); faster while the wheel turns
  const timer = reduce
    ? 0
    : window.setInterval(() => {
        if (document.hidden || pose === "stand") return;
        step++;
        paintWho();
      }, 480);

  function draw(st: DomeState) {
    last = st;
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const { now, view, data } = st;
    if (!sun || sun.key !== data.today + data.tz) sun = { key: data.today + data.tz, ...sunTimes(data.today, data.tz) };
    const { rise, set } = sun;
    const follow = Math.abs(view - now) < 0.5;
    const vm = mod(view);
    night = !(vm >= rise && vm < set);
    // the rim straightens over the first 70% of the opening, then the line takes over
    const e = ease(seg(st.p, 0, 0.7));

    // geometry: a sky card under "Today", the top half of the wheel inside it, the words under the card
    const pad = 12;
    const R = wheelR(W);
    const hF = 0.78;
    const cx = W / 2;
    const top = 48;
    const hy = Math.round(top + 14 + (R + 40) * hF);
    const bottom = hy + 58;
    const tA = view - SPAN;
    const tB = view + SPAN;
    // a time on the wheel (on top at `view`, ahead to the right), unrolled toward its place on the line by `e`
    const at = (t: number, lift = 0): [number, number] => {
      const a = Math.PI / 2 - ((t - view) / DAY) * 2 * Math.PI;
      const r = R + lift;
      const x = cx + r * Math.cos(a);
      const y = hy - r * hF * Math.sin(a);
      return e ? [lerp(x, st.lineX(t), e), lerp(y, st.lineY - lift * 1.5, e)] : [x, y];
    };
    // things rise on the right and set on the left: they fade in the last stretch above the horizon (until unrolled)
    const up = (t: number) => lerp(seg(Math.sin(Math.PI / 2 - ((t - view) / DAY) * 2 * Math.PI), 0.03, 0.24), 1, e);
    const path = (t0: number, t1: number, lift = 0) => {
      const pts: string[] = [];
      for (let t = t0; ; t = Math.min(t1, t + 4)) {
        const [x, y] = at(t, lift);
        pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
        if (t >= t1) break;
      }
      return pts.join("");
    };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.textContent = "";
    svg.style.opacity = String(1 - seg(st.p, 0.66, 1));
    root.dataset.sky = darkness(vm, rise, set) > 0.5 ? "night" : "day";

    // the card: the real sky at the time on top above the horizon, the ground under it; it fades as the line opens
    const [skyTop, skyMid, skyLow] = skyAt(vm, rise, set);
    const defs = el("defs", {});
    const clip = el("clipPath", { id: `${id}-card` }, defs);
    el("rect", { x: pad, y: top, width: W - 2 * pad, height: bottom - top, rx: 28 }, clip);
    const gr = el("linearGradient", { id: `${id}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": css(skyTop) }, gr);
    el("stop", { offset: 0.62, "stop-color": css(skyMid) }, gr);
    el("stop", { offset: 1, "stop-color": css(skyLow) }, gr);
    const cardOp = 1 - seg(st.p, 0, 0.35);
    const card = el("g", { "clip-path": `url(#${id}-card)`, opacity: cardOp });
    el("rect", { x: 0, y: top, width: W, height: hy - top, fill: `url(#${id}-sky)` }, card);
    el("rect", { x: 0, y: hy, width: W, height: bottom - hy, class: "dc-card-ground" }, card);
    el("rect", { x: pad + 0.5, y: top + 0.5, width: W - 2 * pad - 1, height: bottom - top - 1, rx: 27.5, class: "dc-card", opacity: cardOp });

    // at night, what you finished today is the stars (while the wheel is on now)
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    if (night && follow) {
      const done = timed.filter((it) => it.start >= 0 && it.start < DAY && (it.end ?? it.start) <= now && it.origin !== "milestone");
      const sg = el("g", { opacity: 1 - seg(st.p, 0, 0.3) });
      done.forEach((_, i) => {
        const a = Math.PI * ((i + 0.5) / Math.max(done.length, 1));
        const r = R * (0.38 + 0.3 * (((i * 37) % 10) / 10));
        const x = cx - r * Math.cos(a);
        const y = hy - r * hF * Math.sin(a);
        const k = 5;
        el(
          "path",
          {
            d: `M${x} ${y - k}L${x + k * 0.28} ${y - k * 0.28}L${x + k} ${y}L${x + k * 0.28} ${y + k * 0.28}L${x} ${y + k}L${x - k * 0.28} ${y + k * 0.28}L${x - k} ${y}L${x - k * 0.28} ${y - k * 0.28}Z`,
            class: "dc-star",
          },
          sg,
        );
      });
      if (done.length) text(cx, hy - R * hF * 0.2, `${done.length} star${done.length === 1 ? "" : "s"} today`, "dc-dome-stars", "middle", sg);
    }

    // the rim: night dim, daylight bright, what's behind now quieter; a gold dot at each sunrise and sunset, and the
    // day's name where midnight turns over
    const rim = el("g", {});
    const piece = (t0: number, t1: number, cls: string) => {
      if (t1 <= t0) return;
      if (t0 < now) el("path", { d: path(t0, Math.min(t1, now)), class: cls, opacity: 0.5 }, rim);
      if (t1 > now) el("path", { d: path(Math.max(t0, now), t1), class: cls }, rim);
    };
    piece(tA, tB, "dc-rim");
    const d0 = Math.floor(tA / DAY) - 1;
    const d1 = Math.floor(tB / DAY) + 1;
    for (let d = d0; d <= d1; d++) piece(Math.max(tA, d * DAY + rise), Math.min(tB, d * DAY + set), "dc-rim dc-rim-day");
    const marks = el("g", { opacity: 1 - seg(st.p, 0, 0.3) });
    for (let d = d0; d <= d1; d++) {
      for (const [t, name] of [
        [d * DAY + rise, "Sunrise"],
        [d * DAY + set, "Sunset"],
      ] as const) {
        if (t < tA || t > tB) continue;
        const [x, y] = at(t);
        el("circle", { cx: x, cy: y, r: 4, class: "dc-rim-sun", opacity: up(t) }, marks);
        const [lx, ly] = at(t, -20);
        text(lx, ly + 4, `${name} about ${fmtShort(Math.round(mod(t) / 5) * 5)}`, "dc-rim-day-t", "middle", marks).setAttribute("opacity", String(up(t)));
      }
      const t = d * DAY;
      if (t > tA + 20 && t < tB - 20) {
        const [x, y] = at(t, -20);
        const info = data.days.find((x2) => x2.offset === d);
        const name = d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === -1 ? "Yesterday" : (info?.short ?? "");
        text(x, y + 4, name, "dc-rim-day-t", "middle", marks).setAttribute("opacity", String(up(t)));
      }
    }
    if (!follow && now > tA && now < tB) {
      const [x, y] = at(now);
      el("circle", { cx: x, cy: y, r: 5.5, class: "dc-rim-now", opacity: up(now) }, marks);
      const [lx, ly] = at(now, -18);
      text(lx, ly + 4, "Now", "dc-rim-day-t", "middle", marks).setAttribute("opacity", String(up(now)));
    }

    // your things on the rim: blocks along it, moments as dots, each with its emoji outside; piles say what they are,
    // and the next three ahead show their time
    const things = el("g", {});
    const byStart = new Map<number, ClockItem[]>();
    for (const it of timed) {
      const s0 = it.start;
      const e0 = it.end ?? it.start;
      if (e0 < tA || s0 > tB) continue;
      if (it.end != null && Math.min(e0, tB) - Math.max(s0, tA) > 4) {
        const nightBlock = !(mod((s0 + e0) / 2) >= rise && mod((s0 + e0) / 2) < set);
        el(
          "path",
          { d: path(Math.max(s0, tA), Math.min(e0, tB)), class: `dc-dome-block${nightBlock ? " dc-night" : ""}`, opacity: e0 <= now ? 0.4 : 1 },
          things,
        );
      }
      if (s0 >= tA && s0 <= tB) byStart.set(s0, [...(byStart.get(s0) ?? []), it]);
    }
    const shown = [...byStart.entries()].sort((a, b) => a[0] - b[0]);
    const ahead = shown.filter(([s0]) => s0 > now).slice(0, 3);
    for (const [s0, group] of shown) {
      const it = group[0];
      const past = (it.end ?? s0) <= now;
      if (it.end == null) {
        const [x, y] = at(s0);
        el("circle", { cx: x, cy: y, r: 4.5, class: "dc-dome-dot", opacity: (past ? 0.45 : 1) * up(s0) }, things);
      }
      const [x, y] = at(s0, 22);
      text(x, y + 6, it.icon, "dc-dome-ic", "middle", things).setAttribute("opacity", String((past ? 0.45 : 1) * up(s0)));
      const pile = pileOf(group);
      if (pile || ahead.some(([a]) => a === s0)) {
        const [lx, ly] = at(s0, 40);
        text(clamp(lx, pad + 28, W - pad - 28), ly + 3, pile ?? fmtShort(s0), "dc-dome-t", "middle", things).setAttribute(
          "opacity",
          String((1 - seg(st.p, 0, 0.3)) * up(s0)),
        );
      }
    }

    // the horizon, and how long until the sun sets (or rises)
    const groundOp = 1 - seg(st.p, 0, 0.3);
    const [hx1, hy1] = [lerp(pad, 0, e), lerp(hy, st.lineY, e)];
    el("rect", { x: hx1, y: hy1 - 1.5, width: W - 2 * hx1, height: 3, rx: 1.5, class: "dc-horizon", opacity: 1 - seg(st.p, 0, 0.5) });
    if (follow) {
      const m = mod(now);
      const sunUp = m >= rise && m < set;
      const chipText = sunUp ? `☀️ Sun sets in about ${fmtFor(set - m)}` : `🌙 Sun rises in about ${fmtFor(mod(rise - m))}`;
      const cw = chipText.length * 6.6 + 18;
      const chip = el("g", { opacity: groundOp });
      el("rect", { x: cx - cw / 2, y: hy + 17, width: cw, height: 24, rx: 12, class: "dc-dome-chip" }, chip);
      text(cx, hy + 33, chipText, "dc-dome-chiptext", "middle", chip);
    }
    // "Back to now" (a real button, the engine rolls the wheel home) sits where the line was
    if (back) {
      back.hidden = follow || st.p > 0.01;
      back.style.left = `${cx}px`;
      back.style.top = `${hy + 11}px`;
    }

    // under the card, in words: what's on at the time on top (now: the engine's face; turned away: what was or will be
    // happening then, and when)
    const words = el("g", { opacity: 1 - seg(st.p, 0, 0.25) });
    let y = bottom + 24;
    const line = (s: string, cls: string, gap: number) => {
      if (!s) return;
      text(cx, y, s.length > 34 ? `${s.slice(0, 33).trimEnd()}…` : s, cls, "middle", words);
      y += gap;
    };
    if (follow) {
      line(st.face.tag, "dc-dome-tag", 22);
      line(st.face.text, "dc-dome-now", 19);
      for (const s of st.face.stats.slice(0, 2)) line(s, "dc-dome-stat", 19);
      const edge = night ? (mod(now) < rise ? rise : DAY + rise) : set;
      const after = timed
        .filter((it) => it.start >= edge && it.start < edge + 720)
        .sort((a, b) => a.start - b.start)
        .reduce<ClockItem[][]>((out, it) => {
          const g2 = out.find((x) => x[0].start === it.start);
          if (g2) g2.push(it);
          else out.push([it]);
          return out;
        }, [])
        .slice(0, 2)
        .map((gp) => `${gp[0].icon} ${pileOf(gp) ?? gp[0].title}`);
      if (after.length) line(`${night ? "Tomorrow" : "Tonight"} · ${after.join(" · ")}`, "dc-dome-after", 19);
    } else {
      const dayAt = (t: number) => {
        const d = Math.floor(t / DAY);
        return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === -1 ? "Yesterday" : (data.days.find((x) => x.offset === d)?.short ?? "");
      };
      const on = timed.find((it) => it.end != null && it.start <= view && it.end > view);
      const next = timed.filter((it) => it.start > view && it.start < view + 720).sort((a, b) => a.start - b.start)[0];
      line(`${dayAt(view)} · ${fmtShort(view)}`, "dc-dome-tag", 22);
      if (on) {
        line(`${on.icon} ${on.title}`, "dc-dome-now", 19);
        line(`Till ${fmtShort(on.end ?? on.start)}`, "dc-dome-stat", 19);
      } else if (next) {
        const group = timed.filter((it) => it.start === next.start);
        line(`${next.icon} ${pileOf(group) ?? next.title}`, "dc-dome-now", 19);
        line(`Next, ${dayAt(next.start) === dayAt(view) ? "" : `${dayAt(next.start)} `}${fmtShort(next.start)}`, "dc-dome-stat", 19);
      } else line("Nothing planned", "dc-dome-now", 19);
    }

    // the companion: running in place on top of the wheel, the sun by day and asleep on the moon late at night; it
    // turns round when the wheel goes back in time, and jogs faster while the wheel turns
    const moved = lastView != null && Math.abs(view - lastView) > 0.2;
    if (moved && lastView != null) dir = view < lastView ? -1 : 1;
    if (follow && !moved) dir = 1;
    lastView = view;
    const t = performance.now();
    if (moved && !reduce && t - stepAt > 70) {
      step++;
      stepAt = t;
    }
    const [wx, wy] = e ? [lerp(cx, st.lineX(view), e), lerp(hy - R * hF, st.lineY, e)] : [cx, hy - R * hF];
    pose = follow && night && (mod(now) >= 23 * 60 || mod(now) < rise) ? "sleep" : reduce && !moved ? "stand" : "walk";
    who.style.transformOrigin = "18px 18px";
    who.style.transform = `translate(${(wx - 18).toFixed(1)}px, ${(wy - 33).toFixed(1)}px)${dir < 0 ? " scaleX(-1)" : ""}`;
    who.style.opacity = String(1 - seg(st.p, 0.55, 0.9));
    paintWho();
  }

  const onResize = () => last && draw(last);
  window.addEventListener("resize", onResize);
  return {
    draw,
    destroy() {
      window.clearInterval(timer);
      window.removeEventListener("resize", onResize);
    },
  };
}
