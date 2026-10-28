"use client";
import type { PointerEvent, ReactNode } from "react";
import { gsap, MOTION, prefersReducedMotion } from "./gsap";

const to = (e: PointerEvent<HTMLDivElement>, scale: number) => {
  if (prefersReducedMotion()) return;
  gsap.to(e.currentTarget, { scale, duration: scale < 1 ? 0.12 : MOTION.ui, ease: MOTION.ease, overwrite: true });
};

/** Gentle press feedback (scale 0.97) for tappable cards. Wraps any content. */
export function Pressable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} onPointerDown={(e) => to(e, 0.97)} onPointerUp={(e) => to(e, 1)} onPointerLeave={(e) => to(e, 1)} onPointerCancel={(e) => to(e, 1)}>
      {children}
    </div>
  );
}
