"use client";
import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";

/**
 * Re-mounts on every navigation inside the app: a short cross-fade so
 * screens change softly. Skipped on first load (content is already painted)
 * and with reduced motion. Opacity only, so layout never shifts.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current || !isHydrated() || prefersReducedMotion()) return;
    gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out", clearProps: "opacity" });
  });
  return <div ref={ref}>{children}</div>;
}
