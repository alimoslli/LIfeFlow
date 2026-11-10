"use client";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/motion/gsap";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { useShell } from "@/components/shell/app-shell";
import type { Pose } from "@/components/day-clock/companion";
import type { CompanionKey } from "@/lib/companions";
import { cn } from "@/lib/utils";
import "./skylings.css";

const TICK = 160;
const HOP = 8; // two hops

/**
 * A skyling that's alive: it blinks now and then, walks while `busy`, sleeps when `sleeping`, and hops when tapped or
 * when the page cheers (`cheerSkylings`). Still under reduced motion. Decorative; the words around it name it.
 */
export function SkylingSprite({
  companion,
  night = companion === "star",
  busy = false,
  sleeping = false,
  still = false,
  className,
}: {
  companion?: CompanionKey | string | null;
  night?: boolean;
  /** Walks in place (working on something). */
  busy?: boolean;
  sleeping?: boolean;
  /** No timer at all (a row of old replies). */
  still?: boolean;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);
  const [hopAt, setHopAt] = useState<number | null>(null);
  const hopping = hopAt !== null && tick - hopAt < HOP;

  useEffect(() => {
    if (still || prefersReducedMotion()) return;
    const id = window.setInterval(() => setTick(++tickRef.current), TICK);
    return () => window.clearInterval(id);
  }, [still]);

  useEffect(() => {
    if (still) return;
    const cheer = () => setHopAt(tickRef.current);
    window.addEventListener("lf-skylings-cheer", cheer);
    return () => window.removeEventListener("lf-skylings-cheer", cheer);
  }, [still]);

  let pose: Pose = "idle";
  let frame = tick > 0 && tick % 26 === 0 ? 1 : 0;
  if (hopping) {
    pose = "celebrate";
    frame = (tick - hopAt!) % 4;
  } else if (busy) {
    pose = "walk";
    frame = tick % 4;
  } else if (sleeping) {
    pose = "sleep";
    frame = Math.floor(tick / 6) % 2;
  }

  return (
    <span className={cn("lf-sprite inline-block", className)} onClick={still ? undefined : () => setHopAt(tickRef.current)} aria-hidden>
      <CompanionGlyph companion={companion} night={night} pose={pose} frame={frame} className="lf-pixel h-full w-full" />
    </span>
  );
}

/** The person's own skyling (from the app shell), for server pages that can't read it themselves. */
export function MySkyling(props: Omit<Parameters<typeof SkylingSprite>[0], "companion" | "night">) {
  const { skyling } = useShell();
  return <SkylingSprite companion={skyling} night={skyling === "star"} {...props} />;
}

/**
 * The person's skyling as a small icon, where the old sparkle stood for the skyling (owner, 2026-11-10: the sparkle is out).
 * Takes an icon's className (h-4 w-4 ...); a still picture, no timer.
 */
export function SkylingIcon({ className }: { className?: string }) {
  const { skyling } = useShell();
  return <CompanionGlyph companion={skyling} night={skyling === "star"} className={cn("lf-pixel", className)} />;
}
