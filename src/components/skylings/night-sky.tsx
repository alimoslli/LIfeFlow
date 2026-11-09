"use client";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/motion/gsap";
import type { CompanionKey } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { mountNight, type NightScene, type StageBox } from "./night";
import "./skylings.css";

/** Where the cast stands. Hero: beside the words on a laptop, under them on a phone. */
export const STAGES = {
  hero: { wide: [0.5, 0.98, 0.06, 1], narrow: [0, 1, 0.62, 1] },
  full: { wide: [0.1, 0.9, 0.1, 1], narrow: [0, 1, 0.06, 1] },
  band: { wide: [0.5, 0.98, 0.05, 1], narrow: [0, 1, 0.5, 1] },
  /** a short strip across the top of a phone page */
  strip: { wide: [0.02, 0.98, 0.12, 1], narrow: [0, 1, 0.12, 1] },
  /** under a block of words at the top (the sign-in page's side) */
  aside: { wide: [0.06, 0.96, 0.36, 1], narrow: [0.04, 0.96, 0.36, 1] },
} satisfies Record<string, StageBox>;

/**
 * The skylings' night as a backdrop (decorative: the words around it say what it shows). The night colour is painted by
 * CSS first, so the server render never flashes, and the canvas fills in on the client.
 */
export function NightSky({ stage = "hero", focus, className }: { stage?: keyof typeof STAGES; focus?: CompanionKey | null; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<NightScene | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    scene.current = mountNight(canvas.current, { box: STAGES[stage], reduced: prefersReducedMotion() });
    return () => {
      scene.current?.destroy();
      scene.current = null;
    };
  }, [stage]);
  useEffect(() => scene.current?.focus(focus ?? null), [focus]);
  return (
    <div className={cn("lf-night absolute inset-0 overflow-hidden", className)} aria-hidden>
      <canvas ref={canvas} className="lf-pixel absolute top-0 left-0 block" />
    </div>
  );
}
