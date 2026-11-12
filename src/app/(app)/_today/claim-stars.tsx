"use client";
import { useEffect, useState } from "react";
import { celebrate, hop } from "@/components/motion/burst";
import { STAR_FACES, STAR_LOOKS } from "@/components/motion/celebration-art";
import { isSplashActive, onSplashEnd } from "@/components/motion/intro";
import { MAX_STARS, moreLabel, runLabel, spokenStars } from "@/lib/stars";
import { cheerSkylings } from "@/components/skylings/night";
import { claimStarsAction } from "./actions";

/** Time between stars: each one has landed and is floating off before the next jumps out. */
const GAP_MS = 1100;

/**
 * A different star each time, moving in a way that keeps its words level (the spin turns the tag upside down, so a
 * claimed star never uses it: each one has to say what it was for).
 */
const LEVEL_MOVES = ["hop", "bounce", "wiggle", "zoom"];
const starNo = (i: number) => ({
  look: STAR_LOOKS[i % STAR_LOOKS.length],
  face: STAR_FACES[(i * 2 + 1) % STAR_FACES.length],
  move: LEVEL_MOVES[i % LEVEL_MOVES.length],
});

/** Where the skyling is on the sky, if it's on screen; otherwise the stars rise mid-screen. */
function skylingAt(): DOMRect | null {
  const r = document.querySelector('[data-testid="day-clock"] [data-dc="who"]')?.getBoundingClientRect();
  return r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight ? r : null;
}

/**
 * Coming back to Today (owner, 2026-11-10): every class, shift and plan the skyling passed while you were away is a
 * star to claim. They come one by one out of the skyling, each saying what it was for, and a run of a few ends with
 * one more star that says how many (the sun is only for a sun earned on the skyling's cloud). Each is kept on the cloud. Claimed once on the server, so another device or a reload never plays them again. After the opening screen and
 * once the sky is drawn; not under automation unless the address asks (?stars=1), like the splash.
 */
export function ClaimStars() {
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (navigator.webdriver && !new URLSearchParams(window.location.search).has("stars")) return;
    let off = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const play = async () => {
      // the sky first: the stars come out of the skyling once it's drawn (at most a few seconds' wait)
      for (let i = 0; i < 30 && !document.querySelector('[data-testid="day-clock"][data-ready="true"]'); i++) await new Promise((r) => setTimeout(r, 100));
      const stars = await claimStarsAction();
      if (off || !stars.length) return;
      const shown = stars.slice(0, MAX_STARS);
      const more = stars.length - shown.length;
      shown.forEach((s, i) =>
        later(500 + i * GAP_MS, () => {
          // out of the skyling itself, so it has the sky above it to float into
          hop(document.querySelector('[data-testid="day-clock"] [data-dc="who"]'), 1);
          cheerSkylings();
          celebrate(skylingAt(), "small", s.label, { who: starNo(i) });
        }),
      );
      const after = 500 + shown.length * GAP_MS;
      if (more > 0) later(after, () => celebrate(skylingAt(), "small", moreLabel(more), { who: starNo(shown.length) }));
      // a run of a few ends with one more star that says how many: the sun is only for a sun earned (owner, 2026-11-11)
      const run = runLabel(stars.length);
      if (run) later(after + (more > 0 ? GAP_MS : 0) + 200, () => celebrate(skylingAt(), "small", run, { who: starNo(shown.length + 1) }));
      setSaid(spokenStars(stars.map((s) => s.title)));
    };
    const start = () => void play();
    const unsubscribe = isSplashActive() ? onSplashEnd(start) : (start(), undefined);
    return () => {
      off = true;
      unsubscribe?.();
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <p className="sr-only" role="status" data-testid="claimed-stars">
      {said}
    </p>
  );
}
