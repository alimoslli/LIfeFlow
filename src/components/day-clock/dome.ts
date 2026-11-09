/**
 * Morrow's dome as the sky's path (owner, 2026-11-09: picked B, "especially when it looked like a widget"), in the real
 * sky's colours (owner: no purple). Today is a sky card: by day a half circle over the horizon from sunrise (left) to sunset (right), with the companion walking it
 * at now; at night the same path is the night, sunset to sunrise, with what you finished today as stars. Nothing
 * flips: for 20 minutes either side of sunset (and sunrise) the half you're leaving slides out to the right as the next
 * one comes in from the left, and the companion rises at the left. Under the horizon the card always says when the sun
 * rises and sets, and how long until the next one. Under the card, in words: what's on, what's next, and what comes
 * after.
 *
 * The engine (engine.ts) still owns the timeline, the gestures and the cards; it calls `draw` on every change and every
 * frame of opening, so the dome flattens onto the line as the timeline fades in. Drawing only; no state of its own
 * except the companion's step.
 */
import { pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { css, darkness, skyAt } from "@/lib/sky";
import { COMPANIONS, drawCompanion, nightOf } from "./companion";

export type DomeFace = { tag: string; text: string; stats: string[] };
export type DomeState = { p: number; now: number; data: ClockData; items: ClockItem[]; face: DomeFace; lineY: number };

const NS = "http://www.w3.org/2000/svg";
const DAY = 1440;
/** Minutes either side of sunset and sunrise that the two halves share the sky. */
const EDGE = 20;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);
function fmtShort(min: number) {
  const m = ((min % DAY) + DAY) % DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
/** Sunrise and sunset come from the time zone, not a place, so they're shown "about", to 5 minutes (10 over an hour). */
const near5 = (min: number) => Math.round(min / 5) * 5;
function fmtFor(min: number) {
  const m = Math.max(5, min < 60 ? near5(min) : Math.round(min / 10) * 10);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

type Half = { start: number; end: number; night: boolean };
let uid = 0;

export function createDome(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  if (!svgQ || !whoQ) return { draw: () => {}, destroy: () => {} };
  const svg: SVGSVGElement = svgQ;
  const who: HTMLCanvasElement = whoQ;
  const id = `dc-sky-${++uid}`;
  const lead = COMPANIONS[1];
  let last: DomeState | null = null;
  let sun: { key: string; rise: number; set: number } | null = null;
  let step = 0;
  let pose: "walk" | "stand" | "sleep" = "stand";
  let night = false;
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
  // the companion breathes: a step every half second (never with reduced motion)
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
    const { now, data } = st;
    if (!sun || sun.key !== data.today + data.tz) sun = { key: data.today + data.tz, ...sunTimes(data.today, data.tz) };
    const { rise, set } = sun;
    const m = ((now % DAY) + DAY) % DAY;
    night = !(m >= rise && m < set);
    // the halves: today's daylight, tonight (sunset to the next sunrise) and last night
    const dayHalf: Half = { start: rise, end: set, night: false };
    const tonight: Half = { start: set, end: DAY + rise, night: true };
    const lastNight: Half = { start: set - DAY, end: rise, night: true };
    const cur = !night ? dayHalf : m >= set ? tonight : lastNight;
    // near sunset or sunrise the half you're leaving and the next one share the sky (f: 0 → 1 over 40 minutes)
    const nearSet = Math.abs(m - set) < EDGE;
    const nearRise = Math.abs(m - rise) < EDGE;
    const f = nearSet ? smooth((m - set + EDGE) / (2 * EDGE)) : nearRise ? smooth((m - rise + EDGE) / (2 * EDGE)) : 0;
    const from = nearSet ? dayHalf : nearRise ? lastNight : cur;
    const to = nearSet ? tonight : nearRise ? dayHalf : cur;

    // geometry: a sky card under "Today", the dome inside it over the horizon, the words under the card
    const e = ease(st.p);
    const pad = 12;
    const Rd = Math.round(clamp(W / 2 - 56, 96, 138));
    const hF = 0.78;
    const cx = W / 2;
    const top = 48;
    const hy = Math.round(top + 14 + (Rd + 40) * hF);
    const bottom = hy + 58;
    const flat = (th: number, r = Rd): [number, number] => {
      const x = cx - r * Math.cos(th) * lerp(1, (W / 2 - 8) / Rd, e);
      const y = lerp(hy - r * hF * Math.sin(th), st.lineY, e);
      return [x, y];
    };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.textContent = "";
    svg.style.opacity = String(1 - seg(st.p, 0.45, 0.95));

    // the card: the real sky of this minute above the horizon (lib/sky.ts, no purple), the ground under it; it fades
    // as the timeline opens
    const [skyTop, skyMid, skyLow] = skyAt(m, rise, set);
    root.dataset.sky = darkness(m, rise, set) > 0.5 ? "night" : "day";
    const defs = el("defs", {});
    const clip = el("clipPath", { id: `${id}-card` }, defs);
    el("rect", { x: pad, y: top, width: W - 2 * pad, height: bottom - top, rx: 28 }, clip);
    const gr = el("linearGradient", { id: `${id}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": css(skyTop) }, gr);
    el("stop", { offset: 0.62, "stop-color": css(skyMid) }, gr);
    el("stop", { offset: 1, "stop-color": css(skyLow) }, gr);
    const card = el("g", { "clip-path": `url(#${id}-card)`, opacity: 1 - seg(st.p, 0, 0.35) });
    el("rect", { x: 0, y: top, width: W, height: hy - top, fill: `url(#${id}-sky)` }, card);
    el("rect", { x: 0, y: hy, width: W, height: bottom - hy, class: "dc-card-ground" }, card);
    el("rect", { x: pad + 0.5, y: top + 0.5, width: W - 2 * pad - 1, height: bottom - top - 1, rx: 27.5, class: "dc-card", opacity: 1 - seg(st.p, 0, 0.35) });

    // one half of the sky: its path, your things on it, its ends; `op` and `dx` slide it in or out at sunset/sunrise
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    const arcPts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) arcPts.push(flat((i / 48) * Math.PI));
    const arc = arcPts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    const drawHalf = (h: Half, op: number, dx: number) => {
      const at = (t: number) => Math.PI * clamp((t - h.start) / (h.end - h.start), 0, 1);
      const g = el("g", { opacity: op, transform: `translate(${dx.toFixed(1)} 0)` });
      el("path", { d: `${arc}Z`, class: h.night ? "dc-dome-fill dc-night" : "dc-dome-fill" }, g);
      el("path", { d: arc, class: h.night ? "dc-dome-track dc-night" : "dc-dome-track" }, g);
      // blocks along the arc, moments as dots, each with its emoji outside; piles say what they are
      const shown: { th: number; it: ClockItem; past: boolean; label: string }[] = [];
      const byStart = new Map<number, ClockItem[]>();
      for (const it of timed) {
        const s0 = it.start;
        const e0 = it.end ?? it.start;
        if (e0 < h.start || s0 > h.end) continue;
        const past = e0 <= now;
        if (it.end != null) {
          const pts: string[] = [];
          for (let t = Math.max(s0, h.start); t <= Math.min(e0, h.end); t += 5) {
            const [x, y] = flat(at(t));
            pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
          }
          if (pts.length > 1) el("path", { d: pts.join(""), class: `dc-dome-block${h.night ? " dc-night" : ""}`, opacity: past ? 0.35 : 1 }, g);
        }
        byStart.set(s0, [...(byStart.get(s0) ?? []), it]);
      }
      for (const [s0, group] of byStart) {
        const it = group[0];
        const past = (it.end ?? s0) <= now;
        shown.push({ th: at(Math.max(s0, h.start)), it, past, label: pileOf(group) ?? "" });
        if (it.end == null) {
          const [x, y] = flat(at(s0));
          el("circle", { cx: x, cy: y, r: 4.5, class: "dc-dome-dot", opacity: past ? 0.4 : 1 }, g);
        }
      }
      const ahead = shown.filter((s) => !s.past).slice(0, 3);
      for (const s of shown) {
        const [x, y] = flat(s.th, Rd + 22);
        if (x < pad + 10 || x > W - pad - 10) continue;
        text(x, y + 7, s.it.icon, "dc-dome-ic", "middle", g).setAttribute("opacity", String((s.past ? 0.4 : 1) * (1 - seg(st.p, 0, 0.4))));
        if (s.label || ahead.includes(s)) {
          const [lx, ly] = flat(s.th, Rd + 40);
          text(clamp(lx, pad + 26, W - pad - 26), ly + 3, s.label || fmtShort(s.it.start), "dc-dome-t", "middle", g).setAttribute(
            "opacity",
            String(1 - seg(st.p, 0, 0.3)),
          );
        }
      }
      // at night, what you finished today is the stars
      if (h.night) {
        const done = timed.filter((it) => it.start >= 0 && it.start < DAY && (it.end ?? it.start) <= now && it.origin !== "milestone");
        done.forEach((_, i) => {
          const th = Math.PI * ((i + 0.5) / Math.max(done.length, 1));
          const [x, y] = flat(th, Rd * (0.42 + 0.3 * (((i * 37) % 10) / 10)));
          const k = 5;
          el(
            "path",
            {
              d: `M${x} ${y - k}L${x + k * 0.28} ${y - k * 0.28}L${x + k} ${y}L${x + k * 0.28} ${y + k * 0.28}L${x} ${y + k}L${x - k * 0.28} ${y + k * 0.28}L${x - k} ${y}L${x - k * 0.28} ${y - k * 0.28}Z`,
              class: "dc-star",
            },
            g,
          );
        });
        if (done.length) text(cx, hy - Rd * hF * 0.24, `${done.length} star${done.length === 1 ? "" : "s"} today`, "dc-dome-stars", "middle", g);
      }
    };
    // at sunset (or sunrise) the half you're leaving slides out to the right, then the next one slides in from the left
    if (from === to) drawHalf(cur, 1, 0);
    else {
      drawHalf(from, 1 - smooth(seg(f, 0.25, 0.6)), 28 * f);
      drawHalf(to, smooth(seg(f, 0.4, 0.75)), -28 * (1 - f));
    }
    // the path's ends, on the ground: sunrise and sunset by day, sunset and sunrise at night
    const ends = cur.night
      ? [`Sunset about ${fmtShort(near5(set))}`, `Sunrise about ${fmtShort(near5(rise))}`]
      : [`Sunrise about ${fmtShort(near5(rise))}`, `Sunset about ${fmtShort(near5(set))}`];
    const eo = String(1 - seg(st.p, 0, 0.3));
    text(pad + 18, hy + 20, ends[0], "dc-dome-end", "start").setAttribute("opacity", eo);
    text(W - pad - 18, hy + 20, ends[1], "dc-dome-end", "end").setAttribute("opacity", eo);
    // the horizon, and how long until the sun sets (or rises)
    const [hx1, hy1] = [lerp(pad, 0, e), lerp(hy, st.lineY, e)];
    el("rect", { x: hx1, y: hy1 - 1.5, width: W - 2 * hx1, height: 3, rx: 1.5, class: "dc-horizon" });
    const chip = el("g", { opacity: 1 - seg(st.p, 0, 0.3) });
    const chipText = night ? `🌙 Sun rises in about ${fmtFor((rise - m + DAY) % DAY)}` : `☀️ Sun sets in about ${fmtFor(set - m)}`;
    const cw = chipText.length * 6.6 + 18;
    el("rect", { x: cx - cw / 2, y: hy + 28, width: cw, height: 24, rx: 12, class: "dc-dome-chip" }, chip);
    text(cx, hy + 44, chipText, "dc-dome-chiptext", "middle", chip);

    // under the card, in words: now (or next), today's numbers, and what comes after this half
    const words = el("g", { opacity: 1 - seg(st.p, 0, 0.25) });
    let y = bottom + 24;
    if (st.face.tag) text(cx, y, st.face.tag, "dc-dome-tag", "middle", words);
    y += 22;
    if (st.face.text) text(cx, y, st.face.text.length > 30 ? `${st.face.text.slice(0, 29).trimEnd()}…` : st.face.text, "dc-dome-now", "middle", words);
    for (const line of st.face.stats.slice(0, 2)) {
      y += 19;
      text(cx, y, line, "dc-dome-stat", "middle", words);
    }
    const after = timed
      .filter((it) => it.start >= cur.end && it.start < cur.end + 720)
      .sort((a, b) => a.start - b.start)
      .reduce<ClockItem[][]>((out, it) => {
        const g2 = out.find((x) => x[0].start === it.start);
        if (g2) g2.push(it);
        else out.push([it]);
        return out;
      }, [])
      .slice(0, 2)
      .map((gp) => `${gp[0].icon} ${pileOf(gp) ?? gp[0].title}`);
    if (after.length) {
      y += 21;
      text(cx, y, `${night ? "Tomorrow" : "Tonight"} · ${after.join(" · ")}`, "dc-dome-after", "middle", words);
    }

    // the companion: on the path at now, the sun by day and asleep on the moon late at night. Just after sunset (or
    // sunrise) it rises at the left, from under the horizon.
    const at = (t: number) => Math.PI * clamp((t - cur.start) / (cur.end - cur.start), 0, 1);
    const [wx, wy0] = flat(at(now));
    const since = (now - cur.start + DAY) % DAY;
    const rising = since < EDGE ? (1 - since / EDGE) * 34 * (1 - e) : 0;
    const wy = wy0 + rising;
    const dx = from === to ? 0 : cur === from ? 28 * f : -28 * (1 - f);
    pose = night && (m >= 23 * 60 || m < rise) ? "sleep" : reduce ? "stand" : "walk";
    who.style.transform = `translate(${(wx + dx - 18).toFixed(1)}px, ${(wy - 33).toFixed(1)}px)`;
    who.style.clipPath = rising ? `inset(0 0 ${Math.max(0, wy - 33 + 36 - hy).toFixed(1)}px 0)` : "";
    who.style.opacity = String(1 - seg(st.p, 0, 0.35));
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
