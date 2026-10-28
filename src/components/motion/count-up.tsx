"use client";
import { useRef } from "react";
import { formatCents } from "@/lib/money";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "./gsap";

const fmt = (cents: number, format: "whole" | "cents") => {
  const s = formatCents(cents);
  return format === "whole" ? s.replace(/\.\d\d$/, "") : s;
};

/**
 * Money that animates only when its value changes while you're looking at
 * it (after a sync or an edit). On arrival it always shows the real number
 * immediately: counting up from $0 made totals look like they jumped
 * between different values.
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
      if (from == null || from === cents || prefersReducedMotion()) return;
      const state = { v: from };
      const play = () =>
        gsap.to(state, {
          v: cents,
          duration: MOTION.count,
          ease: MOTION.ease,
          onUpdate: () => void (el.textContent = fmt(Math.round(state.v), format)),
          onComplete: () => void (el.textContent = fmt(cents, format)),
        });
      el.textContent = fmt(state.v, format);
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
