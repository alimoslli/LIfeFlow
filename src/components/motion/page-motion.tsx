"use client";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "./gsap";
import { consumeNavDirection } from "./nav-direction";

/**
 * Wraps the page area. Whenever the path changes, the new screen arrives the
 * way you're going (see NavDirection): deeper pages from the right, back from
 * the left, tabs with a soft fade. Not on first load, not with reduced motion;
 * transform and opacity only, cleared when done.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    const dir = consumeNavDirection();
    if (!el || prefersReducedMotion() || dir === "none") return;
    const tween =
      dir === "forward" || dir === "back"
        ? gsap.fromTo(
            el,
            { x: dir === "forward" ? 44 : -44, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.34, ease: "power3.out", clearProps: "transform,opacity" },
          )
        : gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out", clearProps: "opacity" });
    return () => {
      tween.progress(1).kill();
    };
  }, [pathname]);
  return <div ref={ref}>{children}</div>;
}
