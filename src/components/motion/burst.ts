"use client";

import { STAR_FACES, STAR_LOOKS, SUN_SIZE, star, sun, type StarFace, type StarLook, type SunFrame } from "./celebration-art";
import { prefersReducedMotion } from "./gsap";
import { milestoneSound } from "./sound";

const reduceMotion = () => prefersReducedMotion();
const SPARK = ["#ffd77a", "#ffffff", "#ffb3c6", "#a8ecc0", "#a9d4ff", "#d2c2ff"];

/** How each star arrives and leaves. All end by floating up and away. */
const MOVES: Record<string, Keyframe[]> = {
  hop: [
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
  spin: [
    { transform: "scale(0.1) rotate(-200deg)", opacity: 0 },
    { transform: "scale(1.25) rotate(20deg)", opacity: 1, offset: 0.18 },
    { transform: "scale(0.96) rotate(-6deg)", offset: 0.28 },
    { transform: "scale(1) rotate(0deg)", offset: 0.36 },
    { transform: "translateY(-6px) scale(1.04) rotate(0deg)", offset: 0.6 },
    { transform: "translateY(-30px) rotate(180deg) scale(1)", opacity: 1, offset: 0.8 },
    { transform: "translateY(-90px) rotate(360deg) scale(0.7)", opacity: 0 },
  ],
  wiggle: [
    { transform: "translateY(14px) scale(0.3)", opacity: 0 },
    { transform: "translateY(0) scale(1.15)", opacity: 1, offset: 0.12 },
    { transform: "rotate(-14deg) scale(1)", offset: 0.24 },
    { transform: "rotate(13deg)", offset: 0.34 },
    { transform: "rotate(-11deg)", offset: 0.44 },
    { transform: "rotate(9deg)", offset: 0.54 },
    { transform: "rotate(0deg) scale(1.06)", offset: 0.64 },
    { transform: "translateY(-36px) rotate(-4deg)", opacity: 1, offset: 0.82 },
    { transform: "translateY(-96px) rotate(6deg) scale(0.9)", opacity: 0 },
  ],
  zoom: [
    { transform: "translate(-120px, 30px) scale(0.5) rotate(-30deg)", opacity: 0 },
    { transform: "translate(8px, -4px) scale(1.15) rotate(10deg)", opacity: 1, offset: 0.2 },
    { transform: "translate(-3px, 0) scale(0.96) rotate(-4deg)", offset: 0.3 },
    { transform: "translate(0, 0) scale(1)", offset: 0.38 },
    { transform: "translate(0, -5px) scale(1.05)", offset: 0.62 },
    { transform: "translate(40px, -50px) rotate(12deg)", opacity: 1, offset: 0.82 },
    { transform: "translate(120px, -120px) rotate(30deg) scale(0.7)", opacity: 0 },
  ],
  bounce: [
    { transform: "translateY(-80px) scale(0.6)", opacity: 0 },
    { transform: "translateY(0) scale(1.15, 0.82)", opacity: 1, offset: 0.16 },
    { transform: "translateY(-38px) scale(0.94, 1.08)", offset: 0.3 },
    { transform: "translateY(0) scale(1.1, 0.88)", offset: 0.44 },
    { transform: "translateY(-16px) scale(1)", offset: 0.54 },
    { transform: "translateY(0) scale(1.04, 0.96)", offset: 0.64 },
    { transform: "translateY(-40px)", opacity: 1, offset: 0.82 },
    { transform: "translateY(-100px) scale(0.9)", opacity: 0 },
  ],
};
const MOVE_KEYS = Object.keys(MOVES);

let last = -1;
/** A different star every time: never the same look, face and move twice running. */
type Who = { look: StarLook; face: StarFace; move: string };
function pick(): Who {
  const n = STAR_LOOKS.length * STAR_FACES.length;
  let i = Math.floor(Math.random() * n);
  if (i === last) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
  last = i;
  return {
    look: STAR_LOOKS[i % STAR_LOOKS.length],
    face: STAR_FACES[Math.floor(i / STAR_LOOKS.length)],
    move: MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)],
  };
}

function layerAt() {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "120", overflow: "hidden" });
  document.body.appendChild(layer);
  return layer;
}
function pill(text: string, ink: string) {
  const tag = document.createElement("div");
  tag.textContent = text;
  Object.assign(tag.style, {
    font: "800 0.9375rem/1 var(--font-sans, system-ui), system-ui, sans-serif",
    color: ink,
    background: "#fff7e3",
    padding: "5px 10px",
    borderRadius: "999px",
    boxShadow: `inset 0 0 0 2px ${ink}`,
    whiteSpace: "nowrap",
  });
  return tag;
}
function sparks(layer: HTMLElement, x: number, y: number, n: number, reach: number, colours: string[], delay = 0) {
  for (let i = 0; i < n; i++) {
    const t = document.createElement("div");
    const s = 6 + (i % 3) * 2;
    Object.assign(t.style, {
      position: "absolute",
      left: `${x - s / 2}px`,
      top: `${y - s / 2}px`,
      width: `${s}px`,
      height: `${s}px`,
      background: colours[i % colours.length],
    });
    layer.appendChild(t);
    const a = (i / n) * Math.PI * 2 + 0.3;
    t.animate(
      [
        { transform: "translate(0,0) scale(0)", opacity: 0 },
        { transform: `translate(${Math.cos(a) * reach}px, ${Math.sin(a) * reach - reach * 0.3}px) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${Math.cos(a) * reach * 1.25}px, ${Math.sin(a) * reach + reach * 0.5}px) scale(0.4) rotate(90deg)`, opacity: 0 },
      ],
      { duration: 1100, delay: delay + i * 30, easing: "ease-out", fill: "both" },
    );
  }
}

/**
 * The moment something gets done. "small": one of the star cast pops up where it was done (a different one each time)
 * and floats away with its tag. "big" (a milestone, a goal reached): the sun jumps out, sticks its tongue out, does its
 * squiggle and waves, with a pop and a chime.
 */
export function celebrate(
  at?: { x: number; y: number } | DOMRect | null,
  size: "small" | "big" = "small",
  label?: string,
  opts: { who?: Who; at?: number; silent?: boolean } = {},
) {
  if (typeof document === "undefined") return;
  const x = at ? ("width" in at ? at.left + at.width / 2 : at.x) : window.innerWidth / 2;
  const y = at ? ("height" in at ? at.top + at.height / 2 : at.y) : window.innerHeight / 2;
  try {
    navigator.vibrate?.(size === "big" ? [12, 50, 12, 50, 24] : [10, 40, 16]);
  } catch {
    /* not supported */
  }
  if (size === "big") {
    bigSun(x, y, label ?? "Milestone!", opts);
    return;
  }
  const layer = layerAt();
  const reduce = reduceMotion();
  const who = opts.who ?? pick();
  const px = 5;
  const side = 21 * px;
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "absolute",
    left: `${Math.min(Math.max(8, x - side / 2), window.innerWidth - side - 8)}px`,
    top: `${Math.max(8, y - side * 0.75)}px`,
    width: `${side}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    filter: "drop-shadow(0 8px 14px rgb(40 30 10 / 0.3))",
  });
  const cv = document.createElement("canvas");
  cv.width = cv.height = 21;
  Object.assign(cv.style, { width: `${side}px`, height: `${side}px`, imageRendering: "pixelated" });
  const g = cv.getContext("2d")!;
  const show = (f: StarFace) => {
    g.clearRect(0, 0, 21, 21);
    g.drawImage(star(who.look, f), 0, 0);
  };
  show(reduce ? who.face : "wow");
  const tag = pill(label ?? "+1", who.look.ink);
  tag.style.marginTop = "-6px";
  holder.append(cv, tag);
  layer.appendChild(holder);
  if (reduce) {
    holder.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1100 }).onfinish = () =>
      layer.remove();
    return;
  }
  const timers = [setTimeout(() => show(who.face), 260), setTimeout(() => show("blink"), 1050), setTimeout(() => show(who.face), 1180)];
  sparks(layer, x, y - side * 0.3, 5, side * 0.7, [who.look.light, who.look.body, "#ffffff"], 120);
  holder.animate(MOVES[who.move], { duration: 1600, easing: "cubic-bezier(.3,.7,.3,1)" }).onfinish = () => {
    timers.forEach(clearTimeout);
    layer.remove();
  };
}

function bigSun(x: number, y: number, label: string, opts: { at?: number; silent?: boolean }) {
  const layer = layerAt();
  const reduce = reduceMotion();
  const px = Math.min(6, Math.max(4, Math.floor(Math.min(window.innerWidth, 520) / 70)));
  const side = SUN_SIZE * px;
  const cxp = Math.min(Math.max(side / 2 + 8, x), window.innerWidth - side / 2 - 8);
  const cyp = Math.min(Math.max(side / 2 + 8, y - side * 0.2), window.innerHeight - side / 2 - 60);
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "absolute",
    left: `${cxp - side / 2}px`,
    top: `${cyp - side / 2}px`,
    width: `${side}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    filter: "drop-shadow(0 10px 18px rgb(180 83 9 / 0.35))",
  });
  const cv = document.createElement("canvas");
  cv.width = cv.height = SUN_SIZE;
  Object.assign(cv.style, { width: `${side}px`, height: `${side}px`, imageRendering: "pixelated" });
  const g = cv.getContext("2d")!;
  const draw = (f: SunFrame) => {
    g.clearRect(0, 0, SUN_SIZE, SUN_SIZE);
    g.drawImage(sun(f), 0, 0);
  };
  const tag = pill(label, "#7a3e06");
  tag.style.marginTop = "-10px";
  tag.style.fontSize = "1.0625rem";
  holder.append(cv, tag);
  layer.appendChild(holder);
  if (reduce) {
    draw({ eyes: "happy", mouth: "tongue", hands: 1, rays: 1 });
    holder.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1800 }).onfinish = () =>
      layer.remove();
    return;
  }
  if (!opts.silent) milestoneSound();
  const T = 3000;
  const t0 = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const t = opts.at ?? now - t0; // opts.at freezes the picture at one moment (for a still)
    const step = (ms: number) => Math.floor(t / ms);
    let f: SunFrame;
    if (t < 140) f = { eyes: "wow", mouth: "smile", hands: 0, rays: 0 };
    else if (t < 560) f = { eyes: "wow", mouth: "open", hands: 1, rays: Math.min(1, (t - 140) / 260), pulse: step(110) % 2 };
    else if (t < 860) f = { eyes: "happy", mouth: "open", hands: 1, rays: 1, pulse: step(140) % 2 };
    else if (t < 2050)
      f = { eyes: step(700) % 2 ? "wink" : "happy", mouth: "tongue", hands: step(170) % 2 ? 1 : -1, rays: 1, pulse: step(160) % 2, wobble: t / 85, amp: 1.25 };
    else if (t < 2400) f = { eyes: "wink", mouth: "tongue", hands: 1, rays: 1, pulse: step(160) % 2 };
    else f = { eyes: "happy", mouth: "smile", hands: 0, rays: Math.max(0, 1 - (t - 2400) / 400) };
    draw(f);
    if (opts.at == null && now - t0 < T) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // a ring of confetti as it jumps out, and a second, wider one for the squiggle
  sparks(layer, cxp, cyp, 14, side * 0.62, SPARK, 150);
  sparks(layer, cxp, cyp, 12, side * 0.85, SPARK, 900);
  holder.animate(
    [
      { transform: "translateY(60px) scale(0.1)", opacity: 0 },
      { transform: "translateY(22px) scale(0.55)", opacity: 1, offset: 0.04 },
      { transform: "translateY(-18px) scale(1.25)", offset: 0.11 },
      { transform: "translateY(0) scale(0.94, 1.04)", offset: 0.16 },
      { transform: "translateY(0) scale(1.05, 0.95)", offset: 0.2 },
      { transform: "translateY(0) scale(1) rotate(0deg)", offset: 0.28 },
      { transform: "translateY(-4px) rotate(-7deg)", offset: 0.36 },
      { transform: "translateY(0) rotate(7deg)", offset: 0.44 },
      { transform: "translateY(-4px) rotate(-7deg)", offset: 0.52 },
      { transform: "translateY(0) rotate(6deg)", offset: 0.6 },
      { transform: "translateY(0) rotate(0deg) scale(1)", offset: 0.68 },
      { transform: "translateY(-22px) scale(1.06, 0.96)", offset: 0.74 },
      { transform: "translateY(0) scale(1.06, 0.94)", offset: 0.8 },
      { transform: "translateY(-10px) scale(1)", opacity: 1, offset: 0.88 },
      { transform: "translateY(-70px) scale(0.6) rotate(-10deg)", opacity: 0 },
    ],
    { duration: T, easing: "linear" },
  ).onfinish = () => {
    cancelAnimationFrame(raf);
    layer.remove();
  };
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
