import { createContext, createElement, useContext, type ReactNode } from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type Format = "9x16" | "1x1" | "16x9";
export const DIMS: Record<Format, [number, number]> = { "9x16": [1080, 1920], "1x1": [1080, 1080], "16x9": [1920, 1080] };

/** Seeded random (same numbers every render, so a scene always renders the same). */
export function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
/** 0..1 between two frames, eased. */
export const prog = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
export const sec = (s: number, fps = 30) => Math.round(s * fps);

/** Layout helpers that work for vertical, square and wide: `u` is 1 at 1080 px on the short side. */
const LayoutCtx = createContext<{ width: number; height: number } | null>(null);
/** Lay out the kit inside a box of its own size (a TV screen, a picture-in-picture) instead of the whole video. */
export function LayoutBox({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return createElement(
    LayoutCtx.Provider,
    { value: { width, height } },
    createElement("div", { style: { position: "relative", width, height, overflow: "hidden" } }, children),
  );
}
export function useLayout() {
  const box = useContext(LayoutCtx);
  const vc = useVideoConfig();
  const { width, height } = box ?? vc;
  const fps = vc.fps;
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  return {
    width,
    height,
    fps,
    portrait,
    wide: width > height,
    u,
    /** keep text and key action inside this box (clear of app UI on Reels/TikTok) */
    safe: { top: height * (portrait ? 0.11 : 0.08), bottom: height * (portrait ? 0.2 : 0.1), side: width * (portrait ? 0.07 : 0.06) },
  };
}
export function useSpring(at: number, cfg: { damping?: number; mass?: number; stiffness?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 14, mass: 0.9, stiffness: 120, ...cfg } });
}
