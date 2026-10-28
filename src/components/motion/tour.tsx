"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap, MOTION, prefersReducedMotion } from "./gsap";
import { isSplashActive, onSplashEnd } from "./intro";

type Step = { target: string; title: string; body: string };

const steps = (name: string): Step[] => [
  { target: "today-page", title: "This is Today", body: "Your day at a glance: what's next, what your assistant noticed, your list and your money." },
  { target: "plan", title: "Plan", body: "Your calendar, to-dos, classes, work shifts and notes. Everything with a date lives here." },
  {
    target: "jarvis",
    title: name,
    body: "Your assistant. Talk or type: ask anything or tell it what to do. It shows exactly what it changed and asks before deleting.",
  },
  { target: "money", title: "Money", body: "Real numbers only: cash & checking, what you spent and what came in this month." },
];

const PAD = 8;

/** The visible element for a tour target (desktop rail and phone tab bar both carry the tag). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Guided tour: a soft spotlight glides between the four places of the app
 * with a short caption for each. Skippable at any time (button or Esc).
 */
export function Tour({ onDone, assistantName = "Jarvis" }: { onDone: () => void; assistantName?: string }) {
  const STEPS = useMemo(() => steps(assistantName), [assistantName]);
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(!isSplashActive());
  const spot = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const placed = useRef(false);

  useEffect(() => (ready ? undefined : onSplashEnd(() => setReady(true))), [ready]);

  const place = useCallback(
    (animate: boolean) => {
      const el = findTarget(STEPS[i].target);
      if (!el || !spot.current || !card.current) return;
      const r = el.getBoundingClientRect();
      const box = { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      const below = r.top + r.height / 2 < window.innerHeight / 2;
      const cardW = Math.min(340, window.innerWidth - 32);
      const cardX = Math.min(Math.max(16, r.left + r.width / 2 - cardW / 2), window.innerWidth - cardW - 16);
      const cardH = card.current.offsetHeight;
      const cardY = below ? Math.min(box.y + box.height + 14, window.innerHeight - cardH - 16) : Math.max(16, box.y - cardH - 14);
      const reduce = prefersReducedMotion();
      if (!animate || reduce || !placed.current) {
        gsap.set(spot.current, box);
        gsap.set(card.current, { x: cardX, y: cardY, width: cardW });
        if (!reduce) {
          gsap.fromTo(spot.current, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: MOTION.enter, ease: MOTION.settle });
          gsap.fromTo(card.current, { opacity: 0, y: cardY + 10 }, { opacity: 1, y: cardY, duration: MOTION.enter, ease: MOTION.ease, delay: 0.08 });
        } else gsap.set([spot.current, card.current], { opacity: 1 });
        placed.current = true;
      } else {
        gsap.to(spot.current, { ...box, duration: 0.55, ease: "power3.inOut" });
        gsap.to(card.current, { x: cardX, y: cardY, width: cardW, duration: 0.55, ease: "power3.inOut" });
        gsap.fromTo(
          card.current.querySelectorAll("[data-anim]"),
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.35, delay: 0.2, stagger: 0.04, ease: MOTION.ease },
        );
      }
    },
    [i, STEPS],
  );

  useLayoutEffect(() => {
    if (ready) place(true);
  }, [ready, place]);

  useEffect(() => {
    if (!ready) return;
    nextBtn.current?.focus();
    const onResize = () => place(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "Tab") {
        // Keep focus inside the caption.
        const f = card.current?.querySelectorAll<HTMLElement>("button");
        if (!f?.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [ready, place, onDone]);

  if (!ready) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* The spotlight: a rounded hole in a dim layer (the shadow is the dim). */}
      <div
        ref={spot}
        className="pointer-events-none absolute top-0 left-0 rounded-2xl opacity-0 shadow-[0_0_0_9999px_rgba(10,12,11,0.55)] ring-2 ring-white/70"
      />
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <div ref={card} className="absolute top-0 left-0 rounded-3xl bg-surface p-5 opacity-0 shadow-2xl">
        <p data-anim className="text-xs font-medium text-muted">
          {i + 1} of {STEPS.length}
        </p>
        <h2 data-anim id="tour-title" className="mt-1 font-display text-[22px] font-medium">
          {step.title}
        </h2>
        <p data-anim className="mt-1.5 text-[15px] leading-relaxed text-text-2">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={onDone} className="text-sm text-muted hover:text-text">
            Skip tour
          </button>
          <button
            ref={nextBtn}
            onClick={() => (last ? onDone() : setI(i + 1))}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-text"
          >
            {last ? "Start using LifeFlow" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
