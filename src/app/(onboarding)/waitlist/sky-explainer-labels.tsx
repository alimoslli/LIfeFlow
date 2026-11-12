"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The short names that sit on the real wheel and its timeline (waitlist explainer, owner 2026-11-12). Each one follows a real
 * part of the day clock: it finds that part in the clock's own markup and moves with it as the wheel turns. Nothing here draws
 * or changes the clock, and nothing can be tapped (every touch goes through to the wheel). A name finds a free spot beside its
 * part, never over the clock's own words; a part that isn't on screen right now (a stop that has turned away) has no name.
 */

type Box = { x: number; y: number; w: number; h: number };
type Side = "left" | "right" | "above" | "below";
type Place = { at: Box; side: Side };
type Rel = (el: Element | null | undefined) => Box | null;

type Label = {
  key: string;
  text: string;
  /** Which state of the clock it belongs to: the wheel, or the opened timeline. */
  state: "clock" | "timeline";
  /** Where its part is (relative to the clock), or null when it isn't on screen. */
  find: (dc: HTMLElement, rel: Rel, size: { w: number; h: number }) => Place | null;
};

const GAP = 6;
const point = (x: number, y: number): Box => ({ x, y, w: 0, h: 0 });
const on = (b: Box | null, side: Side): Place | null => (b ? { at: b, side } : null);
const pill = (dc: HTMLElement, word: string) => [...dc.querySelectorAll<SVGElement>(".dc-tag-t")].find((e) => e.textContent?.includes(word)) ?? null;
const inside = (b: Box) => ({ x: b.x - 3, y: b.y - 2, w: b.w + 6, h: b.h + 4 });

export const LABELS: Label[] = [
  // the wheel
  { key: "wheel", text: "The wheel is your day", state: "clock", find: (_dc, _rel, s) => on(point(10, s.h * 0.3), "right") },
  {
    key: "now",
    text: "Now",
    state: "clock",
    find: (dc, rel) => {
      const b = rel(dc.querySelector(".dc-who"));
      return b ? on({ x: b.x + b.w * 0.3, y: b.y + b.h * 0.25, w: b.w * 0.4, h: b.h * 0.4 }, "right") : null;
    },
  },
  { key: "stop", text: "A stop", state: "clock", find: (dc, rel) => on(rel(dc.querySelector(".dc-tag-t:not(.dc-badge-t)")), "below") },
  {
    // the lecture and the shift share 2:00 to 2:15, so their two stops sit one over the other
    key: "clash",
    text: "A clash",
    state: "clock",
    find: (dc, rel) => {
      const a = rel(pill(dc, "Statistics"));
      const b = rel(pill(dc, "Work"));
      return a && b ? on({ x: Math.max(a.x + a.w, b.x + b.w), y: Math.min(a.y, b.y), w: 0, h: Math.abs(b.y - a.y) + b.h }, "right") : null;
    },
  },
  { key: "night", text: "The night", state: "clock", find: (dc, rel) => on(rel(dc.querySelector(".dc-sunchip")), "right") },
  // the two moves of the wheel itself: turn it (drag), open it (tap)
  { key: "turn", text: "Turn it", state: "clock", find: (dc, rel) => on(rel(dc.querySelector(".dc-sunchip")), "left") },
  { key: "open", text: "Open it", state: "clock", find: (dc, rel) => on(rel(dc.querySelector(".dc-todaybtn")), "below") },
  // the timeline it opens into
  { key: "line", text: "The timeline", state: "timeline", find: (dc, rel) => on(point(14, (rel(dc.querySelector(".dc-trackwrap"))?.y ?? 52) + 8), "right") },
  { key: "tnow", text: "Now", state: "timeline", find: (dc, rel) => on(rel(dc.querySelector(".dc-now-t")), "right") },
  { key: "fold", text: "Fold it", state: "timeline", find: (dc, rel) => on(rel(dc.querySelector(".dc-now-who")), "left") },
  { key: "tstop", text: "A stop", state: "timeline", find: (dc, rel) => on(rel(dc.querySelector(".dc-node.dc-future .dc-n-ic")), "above") },
  { key: "tnight", text: "A night", state: "timeline", find: (dc, rel) => nightPlace(dc, rel) },
];

/** The dip between today and tomorrow on the line: halfway between their names. */
function nightPlace(dc: HTMLElement, rel: Rel): Place | null {
  const days = [...dc.querySelectorAll<HTMLElement>(".dc-mid:not(.dc-era)")];
  const next = dc.querySelector<HTMLElement>(".dc-mid.dc-next");
  const a = rel(next ? days[days.indexOf(next) - 1] : null);
  const b = rel(next);
  return a && b ? on(point((a.x + a.w + b.x) / 2, a.y + 6), "below") : null;
}

/** What the clock itself draws, which a name never covers. */
const KEEP_CLEAR = {
  clock:
    ".dc-tag-t, .dc-badge, .dc-sunchip, .dc-todaybtn, .dc-w-tag, .dc-w-now, .dc-w-then, .dc-w-pills, .dc-w-after, .dc-rim-t, .dc-stars-t, .dc-back, .dc-px-svg",
  timeline: ".dc-n-ic, .dc-n-t, .dc-n-n, .dc-now-who, .dc-now-t, .dc-mid, .dc-day, .dc-tile, .dc-detail",
} as const;

const ORDER: Record<Side, Side[]> = {
  right: ["right", "below", "above", "left"],
  left: ["left", "below", "above", "right"],
  above: ["above", "right", "left", "below"],
  below: ["below", "right", "left", "above"],
};

const hit = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function SkyLabels({ stage }: { stage: RefObject<HTMLDivElement | null> }) {
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const wrap = stage.current;
      const dc = wrap?.querySelector<HTMLElement>(".dc");
      if (!wrap || !dc) return;
      const state = dc.dataset.state === "timeline" ? "timeline" : dc.dataset.state === "clock" ? "clock" : null;
      const origin = wrap.getBoundingClientRect();
      const size = { w: origin.width, h: dc.getBoundingClientRect().height };
      const rel: Rel = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      };
      const visible = (b: Box) => b.x + b.w > 0 && b.x < size.w && b.y + b.h > 0 && b.y < size.h;
      const clear: Box[] = [];
      if (state) {
        for (const el of dc.querySelectorAll(KEEP_CLEAR[state])) {
          const b = rel(el);
          if (!b || !visible(b)) continue;
          // the skyling's picture is a big square with room around it; only the middle is the skyling
          clear.push(el.matches(".dc-px-svg") ? { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 } : inside(b));
        }
        const who = rel(dc.querySelector(".dc-who"));
        if (who && state === "clock") clear.push({ x: who.x + who.w * 0.25, y: who.y + who.h * 0.2, w: who.w * 0.5, h: who.h * 0.6 });
      }
      const taken: Box[] = [];
      for (const l of LABELS) {
        const chip = refs.current[l.key];
        if (!chip) continue;
        const p = state === l.state ? l.find(dc, rel, size) : null;
        let spot: Box | null = null;
        if (p && visible(p.at)) {
          const cw = chip.offsetWidth;
          const ch = chip.offsetHeight;
          const { at } = p;
          for (const side of ORDER[p.side]) {
            const x = side === "left" ? at.x - cw - GAP : side === "right" ? at.x + at.w + GAP : at.x + at.w / 2 - cw / 2;
            const y = side === "above" ? at.y - ch - GAP : side === "below" ? at.y + at.h + GAP : at.y + at.h / 2 - ch / 2;
            const c = { x: Math.max(6, Math.min(size.w - cw - 6, x)), y: Math.max(4, Math.min(size.h - ch - 4, y)), w: cw, h: ch };
            if (!clear.some((b) => hit(c, b)) && !taken.some((b) => hit(c, inside(b)))) {
              spot = c;
              break;
            }
          }
        }
        if (!spot) {
          chip.style.opacity = "0";
          continue;
        }
        taken.push(spot);
        chip.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
        chip.style.opacity = "1";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);
  return (
    <div aria-hidden="true" data-testid="sky-labels" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {LABELS.map((l) => (
        <span
          key={l.key}
          ref={(el) => {
            refs.current[l.key] = el;
          }}
          data-label={l.key}
          className="absolute top-0 left-0 rounded-full bg-ink-night px-2.5 py-1 text-[0.75rem] leading-none font-semibold whitespace-nowrap text-white opacity-0 shadow-soft"
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
