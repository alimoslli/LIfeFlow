"use client";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

/**
 * The single place GSAP is configured. Import gsap, plugins and motion
 * tokens from here so every animation shares the same timing and feel.
 */
if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, Flip);

/** Motion tokens: quick, calm, never in the way. */
export const MOTION = {
  /** Small UI feedback (press, toggle, indicator). */
  ui: 0.28,
  /** Entrances (cards, sheets). */
  enter: 0.5,
  /** Number count-ups. */
  count: 0.9,
  ease: "power3.out",
  /** Sheets and big surfaces settle with a softer tail. */
  settle: "expo.out",
  stagger: 0.04,
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { Flip, gsap, useGSAP };
