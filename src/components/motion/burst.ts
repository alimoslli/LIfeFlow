"use client";

import { prefersReducedMotion } from "./gsap";

/**
 * The moment something gets done (owner, 2026-11-09: "the dopamine effect we want when people complete a task or
 * complete something in their timeline or life"): a burst of pixel sparks in the sky's colours from where it was done,
 * a "+1 ⭐" that floats up, and a little tap where the phone can. "big" is for the day's last thing or a goal reached.
 *
 * Web Animations only (transform and opacity, on the compositor); the sparks remove themselves. With reduced motion it's
 * a short glow instead of a burst.
 */
const COLORS = ["#ffd77a", "#f5a524", "#ffb648", "#7db3f2", "#2f7cd2", "#ffffff", "#9cc3ff"];

export function celebrate(at?: { x: number; y: number } | DOMRect | null, size: "small" | "big" = "small", label = "+1 ⭐") {
  if (typeof document === "undefined") return;
  const x = at ? ("width" in at ? at.left + at.width / 2 : at.x) : window.innerWidth / 2;
  const y = at ? ("height" in at ? at.top + at.height / 2 : at.y) : window.innerHeight / 2;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "120", overflow: "hidden" });
  document.body.appendChild(layer);
  const done = () => layer.remove();
  try {
    navigator.vibrate?.(size === "big" ? [12, 50, 12, 50, 24] : [10, 40, 16]);
  } catch {
    /* not supported */
  }

  const reduce = prefersReducedMotion();
  // the label floats up from where it was done
  const tag = document.createElement("div");
  tag.textContent = label;
  Object.assign(tag.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    transform: "translate(-50%, -50%)",
    font: "700 1rem/1 var(--font-sans, system-ui), system-ui, sans-serif",
    color: "#b45309",
    background: "#fff7e3",
    padding: "6px 10px",
    borderRadius: "999px",
    boxShadow: "0 6px 18px -8px rgb(180 83 9 / 0.6)",
    whiteSpace: "nowrap",
  });
  layer.appendChild(tag);
  tag.animate(
    reduce
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: "translate(-50%, -30%) scale(0.6)" },
          { opacity: 1, transform: "translate(-50%, -110%) scale(1.08)", offset: 0.25 },
          { opacity: 1, transform: "translate(-50%, -150%) scale(1)", offset: 0.7 },
          { opacity: 0, transform: "translate(-50%, -190%) scale(0.96)" },
        ],
    { duration: reduce ? 900 : 1300, easing: "cubic-bezier(.2,.7,.2,1)" },
  ).onfinish = done;
  if (reduce) return;

  // the sparks: pixel squares and a few stars, thrown up and out, falling a little as they fade
  const n = size === "big" ? 44 : 24;
  const spread = size === "big" ? 220 : 130;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    const star = i % 6 === 0;
    const s = star ? 14 : 4 + ((i * 7) % 4);
    const color = COLORS[i % COLORS.length];
    Object.assign(p.style, {
      position: "absolute",
      left: `${x - s / 2}px`,
      top: `${y - s / 2}px`,
      width: `${s}px`,
      height: `${s}px`,
      background: star ? "none" : color,
      color,
      font: `${s}px/1 system-ui`,
      imageRendering: "pixelated",
    });
    if (star) p.textContent = "✦";
    layer.appendChild(p);
    const a = -Math.PI / 2 + ((i / n) * 2 - 1) * (Math.PI * 0.62) + Math.sin(i * 12.9) * 0.18;
    const r = spread * (0.55 + ((i * 37) % 10) / 22);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    p.animate(
      [
        { transform: "translate(0, 0) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1) rotate(${(i % 2 ? 1 : -1) * 90}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy + 70}px) scale(0.7) rotate(${(i % 2 ? 1 : -1) * 160}deg)`, opacity: 0 },
      ],
      { duration: 900 + ((i * 53) % 400), easing: "cubic-bezier(.15,.7,.3,1)", delay: (i % 5) * 18 },
    );
  }
}

/** A little hop for an element (the companion), as if it jumped for joy. */
export function hop(el: Element | null | undefined, times = 2) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: "translateY(0)" },
      { transform: "translateY(-16px)", offset: 0.4 },
      { transform: "translateY(0)", offset: 0.75 },
      { transform: "translateY(-3px)", offset: 0.88 },
      { transform: "translateY(0)" },
    ],
    { duration: 520, iterations: times, easing: "ease-out", composite: "add" },
  );
}
