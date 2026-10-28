"use client";
/**
 * Coordinates first-paint animation:
 * - Server-rendered content is already visible before JavaScript runs, so
 *   client-side entrance effects must not hide it again during hydration.
 * - While the opening splash covers the screen, effects can wait for it to
 *   finish and play underneath instead.
 */
let hydrated = false;
let splashActive = false;
const waiters = new Set<() => void>();

/** Called once by the app shell after the first hydration commit. */
export function markHydrated() {
  hydrated = true;
}

/** True after the first hydration: later mounts come from client navigation. */
export function isHydrated() {
  return hydrated;
}

export function setSplashActive(active: boolean) {
  splashActive = active;
  if (!active) {
    for (const w of waiters) w();
    waiters.clear();
  }
}

export function isSplashActive() {
  return splashActive;
}

/** Runs `cb` when the splash ends. Returns an unsubscribe function. */
export function onSplashEnd(cb: () => void): () => void {
  waiters.add(cb);
  return () => waiters.delete(cb);
}
