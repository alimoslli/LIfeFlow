import type { Activity } from "@/components/day-clock/companion";

/**
 * What the skyling is doing right now that the page knows and the sky doesn't (owner, 2026-11-11: "show some love and
 * attention to the skylings, their life in the app"): it waves when you come, thinks while it works on your answer, and
 * looks surprised at a clash. The wheel's skyling and the one on the bar both follow it; with nothing set they go back to
 * what your day says (reading through a class, coffee on a shift, a stretch in the morning, asleep at night).
 */
type Doing = { pose: Activity; until: number } | null;
const EVENT = "lf-skyling-doing";
let current: Doing = null;

/** Start doing something, for `ms` (or until stopped with null). */
export function skylingDoes(pose: Activity | null, ms?: number) {
  if (typeof window === "undefined") return;
  current = pose ? { pose, until: ms ? Date.now() + ms : Infinity } : null;
  window.dispatchEvent(new Event(EVENT));
}

/** What it's doing now, if anything. */
export function skylingDoing(): Activity | null {
  return current && Date.now() < current.until ? current.pose : null;
}

export function onSkylingDoes(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
