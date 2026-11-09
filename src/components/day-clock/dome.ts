/**
 * Morrow's dome (owner, 2026-11-09): Today as the sky. By day, a half circle over the horizon from sunrise (left) to
 * sunset (right), with the companion walking it at now. At sunset it flips and starts again as the night, sunset to
 * sunrise: the companion in its night form, and what you finished today as stars. Under the horizon, in words: what's
 * on, what's next, and what comes after the sun goes down (or comes up).
 *
 * The engine (engine.ts) still owns the timeline, the gestures and the cards; it calls `draw` on every change and every
 * frame of opening, so the dome flattens onto the line as the timeline fades in. Drawing only; no state of its own
 * except the companion's step and the last half it showed (to flip when that changes).
 */
import { pileOf, sunTimes, type ClockData, type ClockItem } from "@/lib/day-clock";
import { COMPANIONS, drawCompanion, nightOf } from "./companion";

export type DomeFace = { tag: string; text: string; stats: string[] };
export type DomeState = { p: number; now: number; data: ClockData; items: ClockItem[]; face: DomeFace; lineY: number };

const NS = "http://www.w3.org/2000/svg";
const DAY = 1440;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function fmtShort(min: number) {
  const m = ((min % DAY) + DAY) % DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function createDome(root: HTMLElement, reduce: boolean) {
  const svgQ = root.querySelector<SVGSVGElement>("[data-dc=dome]");
  const whoQ = root.querySelector<HTMLCanvasElement>("[data-dc=who]");
  if (!svgQ || !whoQ) return { draw: () => {}, destroy: () => {} };
  const svg: SVGSVGElement = svgQ;
  const who: HTMLCanvasElement = whoQ;
  const lead = COMPANIONS[1];
  let lastNight: boolean | null = null;
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
    // the half on show: today's daylight, or tonight from sunset to the next sunrise
    const start = !night ? rise : m >= set ? set : set - DAY;
    const end = !night ? set : m >= set ? DAY + rise : rise;
    const at = (t: number) => Math.PI * clamp((t - start) / (end - start), 0, 1);
    // geometry: a wide, slightly low dome over the horizon, text under it
    const Rd = Math.min(W / 2 - 44, 156);
    const hF = 0.86;
    const cx = W / 2;
    const hy = 82 + Rd * hF;
    const e = ease(st.p);
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
    root.dataset.sky = night ? "night" : "day";
    const g = el("g", {});
    // the sky under the dome: one soft tint for the hour by day; deep night after sunset
    const arcPts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) arcPts.push(flat((i / 48) * Math.PI));
    const d = arcPts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    const skyCls = night ? "dc-sky-night" : m < rise + 150 ? "dc-sky-dawn" : m < set - 150 ? "dc-sky-day" : "dc-sky-gold";
    el("path", { d: `${d}Z`, class: `dc-sky ${skyCls}` }, g);
    el("path", { d, class: night ? "dc-dome-track dc-night" : "dc-dome-track" }, g);
    // your things on it: blocks along the arc, moments as dots, each with its emoji outside; piles say what they are
    const timed = st.items.filter((it) => !it.allDay && !it.someday);
    const shown: { th: number; it: ClockItem; past: boolean; label: string }[] = [];
    const byStart = new Map<number, ClockItem[]>();
    for (const it of timed) {
      const s0 = it.start;
      const e0 = it.end ?? it.start;
      if (e0 < start || s0 > end) continue;
      const past = e0 <= now;
      if (it.end != null) {
        const pts: string[] = [];
        for (let t = Math.max(s0, start); t <= Math.min(e0, end); t += 5) {
          const [x, y] = flat(at(t));
          pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        if (pts.length > 1) el("path", { d: pts.join(""), class: `dc-dome-block${night ? " dc-night" : ""}`, opacity: past ? 0.35 : 1 }, g);
      }
      byStart.set(s0, [...(byStart.get(s0) ?? []), it]);
    }
    for (const [s0, group] of byStart) {
      const it = group[0];
      const past = (it.end ?? s0) <= now;
      const pile = pileOf(group);
      shown.push({ th: at(Math.max(s0, start)), it, past, label: pile ?? "" });
      if (it.end == null) {
        const [x, y] = flat(at(s0));
        el("circle", { cx: x, cy: y, r: 4.5, class: "dc-dome-dot", opacity: past ? 0.4 : 1 }, g);
      }
    }
    const ahead = shown.filter((s) => !s.past).slice(0, 3);
    for (const s of shown) {
      const [x, y] = flat(s.th, Rd + 24);
      if (x < 12 || x > W - 12) continue;
      const t = text(x, y + 7, s.it.icon, "dc-dome-ic", "middle", g);
      t.setAttribute("opacity", String((s.past ? 0.4 : 1) * (1 - seg(st.p, 0, 0.4))));
      if (s.label || ahead.includes(s)) {
        const [lx, ly] = flat(s.th, Rd + 44);
        const l = text(lx, ly + 3, s.label || fmtShort(s.it.start), "dc-dome-t", "middle", g);
        l.setAttribute("opacity", String(1 - seg(st.p, 0, 0.3)));
      }
    }
    // at night, what you finished today is the stars
    if (night) {
      const today = timed.filter((it) => it.start >= 0 && it.start < DAY && (it.end ?? it.start) <= now && it.origin !== "milestone");
      today.forEach((_, i) => {
        const th = Math.PI * ((i + 0.5) / Math.max(today.length, 1));
        const r = Rd * (0.42 + 0.3 * (((i * 37) % 10) / 10));
        const [x, y] = flat(th, r);
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
      if (today.length) text(cx, hy - Rd * hF * 0.24, `${today.length} star${today.length === 1 ? "" : "s"} today`, "dc-dome-stars", "middle", g);
    }
    // the horizon: sunrise and sunset at its ends (which end is which turns over with the night)
    const [hx1, hy1] = [lerp(16, 0, e), lerp(hy, st.lineY, e)];
    el("rect", { x: hx1, y: hy1 - 1.5, width: W - 2 * hx1, height: 3, rx: 1.5, class: "dc-horizon" }, g);
    const ends = night ? ["🌇", "🌅"] : ["🌅", "🌇"];
    text(cx - Rd - 26, hy + 22, ends[0], "dc-dome-end", "middle", g).setAttribute("opacity", String(1 - seg(st.p, 0, 0.3)));
    text(cx + Rd + 26, hy + 22, ends[1], "dc-dome-end", "middle", g).setAttribute("opacity", String(1 - seg(st.p, 0, 0.3)));
    // under the horizon, in words: now (or next), today's numbers, and what comes after this half
    const words = el("g", { opacity: 1 - seg(st.p, 0, 0.25) });
    let y = hy + 36;
    if (st.face.tag) text(cx, y, st.face.tag, "dc-dome-tag", "middle", words);
    y += 24;
    if (st.face.text) text(cx, y, st.face.text.length > 30 ? `${st.face.text.slice(0, 29).trimEnd()}…` : st.face.text, "dc-dome-now", "middle", words);
    for (const line of st.face.stats.slice(0, 2)) {
      y += 21;
      text(cx, y, line, "dc-dome-stat", "middle", words);
    }
    const after = timed
      .filter((it) => it.start >= end && it.start < end + 720)
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
      y += 24;
      text(cx, y, `${night ? "Tomorrow" : "Tonight"} · ${after.join(" · ")}`, "dc-dome-after", "middle", words);
    }
    // the companion: on the arc at now, the sun by day and asleep on the moon late at night
    const [wx, wy] = flat(at(now));
    pose = night && (m >= 23 * 60 || m < rise) ? "sleep" : reduce ? "stand" : "walk";
    who.style.transform = `translate(${(wx - 18).toFixed(1)}px, ${(wy - 33).toFixed(1)}px)`;
    who.style.opacity = String(1 - seg(st.p, 0, 0.35));
    paintWho();
    // the moment the sun sets (or rises), the dome turns over and starts again
    if (lastNight !== null && lastNight !== night && !reduce && svg.animate) {
      svg.style.transformOrigin = `50% ${hy}px`;
      svg.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0.02)" }, { transform: "scaleY(1)" }], {
        duration: 720,
        easing: "cubic-bezier(.5,0,.3,1)",
      });
    }
    lastNight = night;
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
