"use client";

import { prefersReducedMotion } from "./gsap";

/**
 * The moment something gets done (owner, 2026-11-09: "the dopamine effect we want when people complete a task", then
 * "the done star should be bigger, a real pixel-art animation like the skylings: a little star character with a cute
 * face, not sparks"): a chubby pixel star with a face pops up where it was done, hops for joy with happy eyes, then
 * floats away with a "+1", and the phone taps where it can. "big" (the day's last thing, a goal reached) is a bigger
 * star with a few twinkles around it.
 *
 * Web Animations on transform and opacity only; the layer removes itself. With reduced motion the star just fades in
 * and out where it was done.
 */
const G = 21;
const INK = "#3a2a14";
type Face = "wow" | "happy" | "blink";

/** Inside a chubby five-point star centred on the grid (point up). */
function inStar(x: number, y: number) {
  const cx = G / 2;
  const cy = G / 2 + 0.9;
  const R = 10.4;
  const r = 5.6;
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const starFrames = new Map<Face, HTMLCanvasElement>();
/** The star character in one face: ink edge, gold body shaded low right, a highlight up top, eyes, cheeks, mouth. */
function starFrame(face: Face) {
  let c = starFrames.get(face);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = G;
  const g = c.getContext("2d")!;
  const at = (x: number, y: number) => inStar(x + 0.5, y + 0.5);
  const put = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const d = x + 0.5 - G / 2 + (y + 0.5 - G / 2 - 0.9);
      const shade = d > 6 ? "#f5a524" : d < -6 ? "#fff3c4" : "#ffd77a";
      put(x, y, edge ? INK : shade);
    }
  // eyes
  for (const ex of [7, 13]) {
    if (face === "happy") {
      put(ex - 1, 10, INK);
      put(ex, 9, INK);
      put(ex + 1, 10, INK);
    } else if (face === "blink") {
      put(ex - 1, 10, INK);
      put(ex, 10, INK);
      put(ex + 1, 10, INK);
    } else {
      put(ex, 9, INK);
      put(ex, 10, INK);
      put(ex + 1, 9, INK);
      put(ex + 1, 10, INK);
      put(ex, 9, "#ffffff");
    }
  }
  // cheeks
  put(5, 12, "#f39a8b");
  put(6, 12, "#f39a8b");
  put(15, 12, "#f39a8b");
  put(16, 12, "#f39a8b");
  // mouth: a little "o" of surprise, then a big open smile
  if (face === "wow") {
    put(10, 12, INK);
    put(10, 13, INK);
    put(9, 12, INK);
    put(11, 12, INK);
    put(9, 13, INK);
    put(11, 13, INK);
  } else {
    put(8, 12, INK);
    put(12, 12, INK);
    for (const mx of [9, 10, 11]) put(mx, 13, INK);
    put(10, 12, "#e07a7a");
    put(9, 12, "#e07a7a");
    put(11, 12, "#e07a7a");
  }
  starFrames.set(face, c);
  return c;
}

export function celebrate(at?: { x: number; y: number } | DOMRect | null, size: "small" | "big" = "small", label = "+1") {
  if (typeof document === "undefined") return;
  const x = at ? ("width" in at ? at.left + at.width / 2 : at.x) : window.innerWidth / 2;
  const y = at ? ("height" in at ? at.top + at.height / 2 : at.y) : window.innerHeight / 2;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "120", overflow: "hidden" });
  document.body.appendChild(layer);
  try {
    navigator.vibrate?.(size === "big" ? [12, 50, 12, 50, 24] : [10, 40, 16]);
  } catch {
    /* not supported */
  }
  const reduce = prefersReducedMotion();
  const px = size === "big" ? 7 : 5; // screen pixels per art pixel: 105 px, or 147 px for a big one
  const side = G * px;

  // the star (a canvas that swaps faces) with its "+1" under it
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "absolute",
    left: `${x - side / 2}px`,
    top: `${Math.max(8, y - side * 0.75)}px`,
    width: `${side}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    filter: "drop-shadow(0 8px 14px rgb(180 83 9 / 0.35))",
  });
  const cv = document.createElement("canvas");
  cv.width = cv.height = G;
  Object.assign(cv.style, { width: `${side}px`, height: `${side}px`, imageRendering: "pixelated" });
  const g = cv.getContext("2d")!;
  const show = (f: Face) => {
    g.clearRect(0, 0, G, G);
    g.drawImage(starFrame(f), 0, 0);
  };
  show(reduce ? "happy" : "wow");
  const tag = document.createElement("div");
  tag.textContent = label;
  Object.assign(tag.style, {
    marginTop: "-6px",
    font: "800 0.9375rem/1 var(--font-sans, system-ui), system-ui, sans-serif",
    color: "#7a3e06",
    background: "#fff7e3",
    padding: "5px 10px",
    borderRadius: "999px",
    boxShadow: "inset 0 0 0 2px #3a2a14",
  });
  holder.append(cv, tag);
  layer.appendChild(holder);

  if (reduce) {
    holder.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1100 }).onfinish = () =>
      layer.remove();
    return;
  }
  // pops in with a wobble, hops for joy (squash on landing), then floats up and away
  const timers = [setTimeout(() => show("happy"), 260), setTimeout(() => show("blink"), 1050), setTimeout(() => show("happy"), 1180)];
  holder.animate(
    [
      { transform: "translateY(10px) scale(0.2) rotate(-25deg)", opacity: 0 },
      { transform: "translateY(0) scale(1.2) rotate(8deg)", opacity: 1, offset: 0.12 },
      { transform: "translateY(0) scale(0.95) rotate(-3deg)", offset: 0.2 },
      { transform: "translateY(0) scale(1.08, 0.9)", offset: 0.27 },
      { transform: "translateY(-34px) scale(0.94, 1.08) rotate(0deg)", offset: 0.38 },
      { transform: "translateY(0) scale(1.12, 0.88)", offset: 0.5 },
      { transform: "translateY(-8px) scale(1)", offset: 0.58 },
      { transform: "translateY(-40px) rotate(5deg)", opacity: 1, offset: 0.78 },
      { transform: "translateY(-96px) rotate(-6deg) scale(0.9)", opacity: 0 },
    ],
    { duration: size === "big" ? 1900 : 1600, easing: "cubic-bezier(.3,.7,.3,1)" },
  ).onfinish = () => {
    timers.forEach(clearTimeout);
    layer.remove();
  };

  // a big one gets a few pixel twinkles around it
  if (size === "big")
    for (let i = 0; i < 8; i++) {
      const t = document.createElement("div");
      const s = 6 + (i % 3) * 2;
      Object.assign(t.style, {
        position: "absolute",
        left: `${x - s / 2}px`,
        top: `${y - s / 2}px`,
        width: `${s}px`,
        height: `${s}px`,
        background: i % 2 ? "#ffd77a" : "#ffffff",
      });
      layer.appendChild(t);
      const a = (i / 8) * Math.PI * 2;
      const r = side * 0.75;
      t.animate(
        [
          { transform: "translate(0,0) scale(0)", opacity: 0 },
          { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r - side * 0.3}px) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${Math.cos(a) * r * 1.2}px, ${Math.sin(a) * r - side * 0.6}px) scale(0.4)`, opacity: 0 },
        ],
        { duration: 1200, delay: 200 + i * 40, easing: "ease-out", fill: "both" },
      );
    }
}

/** A little hop for an element (the skyling), as if it jumped for joy. */
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
