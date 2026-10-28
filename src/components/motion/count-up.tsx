"use client";
import { useRef } from "react";
import { formatCents } from "@/lib/money";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "./gsap";
import { isHydrated, isSplashActive, onSplashEnd } from "./intro";

const fmt = (cents: number, format: "whole" | "cents") => {
  const s = formatCents(cents);
  return format === "whole" ? s.replace(/\.\d\d$/, "") : s;
};

/**
 * Money that counts up to its value. The server renders the final value
 * (no hydration mismatch, correct without JavaScript); the count plays on
 * client navigation, after the opening splash, and when the value changes.
 */
export function CountUp({ cents, format = "whole", className }: { cents: number; format?: "whole" | "cents"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const from = shown.current;
      shown.current = cents;
      const firstMount = from == null;
      if (prefersReducedMotion() || (firstMount && !isHydrated() && !isSplashActive())) return;
      if (!firstMount && from === cents) return;
      const state = { v: firstMount ? 0 : from! };
      const play = () =>
        gsap.to(state, {
          v: cents,
          duration: MOTION.count,
          ease: MOTION.ease,
          onUpdate: () => void (el.textContent = fmt(Math.round(state.v), format)),
          onComplete: () => void (el.textContent = fmt(cents, format)),
        });
      el.textContent = fmt(state.v, format);
      if (firstMount && isSplashActive()) return onSplashEnd(() => play());
      play();
    },
    { dependencies: [cents, format] },
  );

  return (
    <span ref={ref} className={className}>
      {fmt(cents, format)}
    </span>
  );
}
