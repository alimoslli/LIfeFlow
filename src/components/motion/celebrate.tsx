"use client";
import { useEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "./gsap";

const COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--hero)", "#f472b6", "#60a5fa"];

/** A small, calm burst of confetti for milestones. Skipped with reduced motion. Calls onDone when finished. */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) {
      onDone?.();
      return;
    }
    const bits = Array.from({ length: 36 }, (_, i) => {
      const b = document.createElement("span");
      b.style.cssText = `position:absolute;left:50%;top:40%;width:8px;height:${i % 3 ? 8 : 12}px;border-radius:${i % 2 ? "50%" : "2px"};background:${COLORS[i % COLORS.length]}`;
      el.appendChild(b);
      return b;
    });
    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    bits.forEach((b) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 160;
      tl.to(
        b,
        {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist + 120,
          rotation: Math.random() * 540,
          opacity: 0,
          duration: 1.4 + Math.random() * 0.4,
          ease: MOTION.ease,
        },
        0,
      );
    });
    return () => {
      tl.kill();
      el.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" />;
}
