/**
 * The mechanism's input, as plain functions (research: docs/research/2026-11-09-the-mechanism.md, P0 and P1).
 *
 * One time scale everywhere: 12 hours across the card. A trackpad moves time 1:1 on that scale (the OS already adds its
 * own momentum, so none is added here); a mouse notch is half an hour; a flick coasts like iOS (0.998 per ms) and comes
 * to rest on now, a thing, or a quarter hour; the ends of the loaded days push back like a rubber band.
 */

/** Hours across the card at the default scale. */
export const HOURS_ACROSS = 12;
/** Minutes a mouse wheel notch moves. */
export const NOTCH_MIN = 30;
/** iOS's normal deceleration: the speed kept after each millisecond of a coast. */
export const DECAY = 0.998;

export type WheelKind = "notch" | "pixel";

/**
 * A wheel event's movement in pixels, and whether it looks like a mouse notch or a trackpad. Lines are 40 px and pages
 * 800 px (Facebook's normalizeWheel). A notch is a line or page step, or a large vertical pixel step with no sideways
 * part that comes after a pause (a trackpad sends many small deltas close together).
 */
export function normalizeWheel(
  e: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">,
  sinceLastMs: number,
): { px: number; kind: WheelKind; axis: "x" | "y" } {
  const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
  // Shift + wheel is a sideways scroll on every browser
  const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
  const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
  const axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  const px = axis === "x" ? dx : dy;
  const notch = e.deltaMode !== 0 || (axis === "y" && !e.deltaX && Math.abs(e.deltaY) >= 40 && sinceLastMs > 50);
  return { px, kind: notch ? "notch" : "pixel", axis };
}

/** Minutes for a pixel distance at the card's scale (12 hours across its width). */
export const minutesForPx = (px: number, cardWidth: number) => (px / Math.max(1, cardWidth)) * HOURS_ACROSS * 60;

/** Where a coast that starts at `v` (minutes per ms) comes to rest, from `from`, with iOS's decay. */
export const project = (from: number, v: number, r = DECAY) => from + (v * r) / (1 - r);

/**
 * Where a turn should land: on now if it's within 45 minutes, else on a thing's start within 20 minutes, else on the
 * nearest quarter hour.
 */
export function snapTarget(rest: number, now: number, starts: readonly number[]): number {
  if (Math.abs(rest - now) <= 45) return now;
  let best: number | null = null;
  for (const s of starts) if (Math.abs(s - rest) <= 20 && (best == null || Math.abs(s - rest) < Math.abs(best - rest))) best = s;
  return best ?? Math.round(rest / 15) * 15;
}

/** iOS's rubber band: how far something moves when pulled `x` past its edge, in a space `d` wide (c = 0.55). */
export const rubber = (x: number, d: number, c = 0.55) => Math.sign(x) * (1 - 1 / ((Math.abs(x) * c) / d + 1)) * d;

/**
 * A critically damped spring from `from` to `to`, starting at velocity `v0` (units per ms), settling in about `ms`:
 * its value at time `t`. No overshoot, and it picks up the release speed so there's no brake-then-move.
 */
export function spring(from: number, to: number, v0: number, t: number, ms = 380): number {
  const w = 6 / ms; // settles (to within about 2%) by `ms`
  const x0 = from - to;
  return to + (x0 + (v0 + w * x0) * t) * Math.exp(-w * t);
}

/** A pointer's speed from its recent samples: a least-squares slope over the last 80 ms (units per ms). */
export function velocity(samples: readonly { t: number; v: number }[], windowMs = 80): number {
  if (samples.length < 2) return 0;
  const end = samples[samples.length - 1].t;
  const pts = samples.filter((s) => end - s.t <= windowMs);
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mt = pts.reduce((a, s) => a + s.t, 0) / n;
  const mv = pts.reduce((a, s) => a + s.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of pts) {
    num += (s.t - mt) * (s.v - mv);
    den += (s.t - mt) ** 2;
  }
  return den ? num / den : 0;
}
