"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { SkyButton } from "@/components/skylings/sky-button";
import { COMPANIONS, companionOf } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { nameAtStart, UNNAMED_ASSISTANT } from "@/lib/assistant";
import { gsap, MOTION, prefersReducedMotion } from "./gsap";
import { isSplashActive, onSplashEnd } from "./intro";

/** A step with no target is a centred card (the welcome and the finish). */
type Step = { target: string | null; eyebrow: string; title: string; body: string };

const steps = (name: string): Step[] => [
  {
    target: null,
    eyebrow: "Welcome",
    title: "Welcome to LifeFlow",
    body: "A short tour of the whole app: where everything lives, and how to get the most from your week. It takes about a minute.",
  },
  {
    target: "today-page",
    eyebrow: "Today",
    title: "Your day as a wheel",
    body: "The sky is now, and your day turns under your skyling: things rise on the right and set on the left. Drag it, scroll it or use the arrow keys to move through time, and “Back to now” brings you home. Tap it and it opens into your timeline; pull the line down to fold it back.",
  },
  {
    target: "skyling", // the tab's data-tour is its label in lowercase (app-shell)
    eyebrow: name === UNNAMED_ASSISTANT ? "Ask anything" : "Your skyling",
    title: nameAtStart(name),
    body: "Ask in plain words, like “When can I study on Wednesday?”, or tell it what to do. It shows exactly what it changed, and it asks before it deletes or sends anything.",
  },
  {
    target: "money",
    eyebrow: "Money",
    title: "Real numbers only",
    body: "Connect a bank to see what you spent, your bills and what's coming in. Not on Plaid? Send a statement screenshot instead. Pay counts only once it has landed.",
  },
  {
    target: "school",
    eyebrow: "School",
    title: "Courses and assignments",
    body: "Bring in assignments from Canvas, or send a screenshot or syllabus from any other platform. See what's due, and get study time built around your free hours. Your skyling never does graded work.",
  },
  {
    target: "ask",
    eyebrow: "Anywhere",
    title: "Ask anything",
    body: "Tap here, or press ⌘J on a laptop, to ask your skyling: what's next, can I afford this, or what should I do first. It's on every screen.",
  },
  {
    target: "settings",
    eyebrow: "Make it yours",
    title: "Settings",
    body: "Name your skyling and choose its tone, pick light or dark, set quiet hours, and see what's connected. You can replay this tour from here.",
  },
  {
    target: null,
    eyebrow: "All set",
    title: "Your week is ready",
    body: "Start with Today, then add your classes, shifts and bills when you're ready. Everything you add shows up across the app.",
  },
];

const PAD = 8;
const CARD_W = 360;

/** The visible element for a tour target (desktop rail and phone tab bar both carry the tag). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Guided tour of the whole app. A soft spotlight moves between the places people use,
 * with a short caption for each. Steps whose screen isn't visible (School when it's off)
 * are skipped. Skip, Esc and the close are always available; arrow keys move between steps.
 */
export function Tour({ onDone, assistantName = UNNAMED_ASSISTANT, companion }: { onDone: () => void; assistantName?: string; companion?: string | null }) {
  // the person's skyling shows them around (the six together say hi first); a slow beat drives their frames
  const guide = companionOf(companion).key;
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setBeat((b) => b + 1), 170);
    return () => clearInterval(id);
  }, []);
  const [ready, setReady] = useState(!isSplashActive());
  useEffect(() => (ready ? undefined : onSplashEnd(() => setReady(true))), [ready]);

  // Steps are chosen once the main screens have rendered, so each target can be measured.
  // Waits for Today and Money (at most 3 seconds), then keeps only the steps whose screen is here.
  const [laid, setLaid] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const began = performance.now();
    let frame = 0;
    const check = () => {
      const settled = ["today-page", "money"].every((t) => findTarget(t));
      if (settled || performance.now() - began > 3000) setLaid(true);
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  const list = useMemo(() => (ready && laid ? steps(assistantName).filter((s) => !s.target || findTarget(s.target)) : []), [ready, laid, assistantName]);
  const [i, setI] = useState(0);
  const spot = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const placed = useRef(false);

  const place = useCallback(
    (animate: boolean) => {
      const step = list[i];
      if (!step || !spot.current || !card.current) return;
      const el = step.target ? findTarget(step.target) : null;
      const cardH = card.current.offsetHeight;
      const cardW = Math.min(CARD_W, window.innerWidth - 32);
      let box: { x: number; y: number; width: number; height: number };
      let cardX: number;
      let cardY: number;
      if (el) {
        const r = el.getBoundingClientRect();
        box = { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        const below = r.top + r.height / 2 < window.innerHeight / 2;
        cardX = Math.min(Math.max(16, r.left + r.width / 2 - cardW / 2), window.innerWidth - cardW - 16);
        cardY = below ? Math.min(box.y + box.height + 14, window.innerHeight - cardH - 16) : Math.max(16, box.y - cardH - 14);
      } else {
        // Centred step: a zero-size spotlight in the middle still dims the whole screen.
        box = { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 0, height: 0 };
        cardX = (window.innerWidth - cardW) / 2;
        cardY = Math.max(16, (window.innerHeight - cardH) / 2);
      }
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
    [i, list],
  );

  useLayoutEffect(() => {
    if (ready) place(true);
  }, [ready, place]);

  const last = i === list.length - 1;
  const next = useCallback(() => (last ? onDone() : setI((n) => n + 1)), [last, onDone]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!ready) return;
    nextBtn.current?.focus();
    const onResize = () => place(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
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
  }, [ready, place, onDone, next, back]);

  const step = list[i];
  if (!ready || !step) return null;
  const welcome = !step.target && i === 0;
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* The spotlight: a rounded hole in a dim layer (the shadow is the dim). */}
      <div
        ref={spot}
        className="pointer-events-none absolute top-0 left-0 rounded-2xl opacity-0 shadow-[0_0_0_9999px_rgba(4,10,24,0.66)] ring-2 ring-[#ffd77a]/80"
      />
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <div
        ref={card}
        className="absolute top-0 left-0 rounded-[1.75rem] bg-[linear-gradient(180deg,#123058,#0b1d42_45%,#07132c)] p-6 text-white opacity-0 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/15"
      >
        {welcome ? (
          // the six say hi, each on its own beat
          <div data-anim className="-mt-14 mb-3 flex items-end justify-center gap-0.5" aria-hidden>
            {COMPANIONS.map((c, n) => (
              <CompanionGlyph
                key={c.key}
                companion={c.key}
                night={c.key === "star"}
                pose={(beat + n * 3) % 14 < 4 ? "celebrate" : "idle"}
                frame={(beat + n * 3) % 14 < 4 ? (beat + n * 3) % 4 : 0}
                className="lf-pixel h-12 w-12 drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
              />
            ))}
          </div>
        ) : (
          // your skyling sits on the card's edge and shows you around
          <CompanionGlyph
            companion={guide}
            night={guide === "star"}
            pose={last ? "celebrate" : beat % 22 < 3 ? "celebrate" : "idle"}
            frame={last ? beat % 4 : beat % 22 < 3 ? beat % 4 : beat % 30 === 0 ? 1 : 0}
            className="lf-pixel absolute -top-11 right-6 h-14 w-14 drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
          />
        )}
        <div data-anim className="flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-[#ffd77a] uppercase">{step.eyebrow}</p>
          <p className="text-xs text-white/55">
            {i + 1} of {list.length}
          </p>
        </div>
        <h2 data-anim id="tour-title" className="mt-2 font-display text-[1.625rem] leading-tight font-medium tracking-[-0.02em]">
          {step.title}
        </h2>
        <p data-anim className="mt-2.5 text-[0.9375rem] leading-relaxed text-white/80">
          {step.body}
        </p>

        <div data-anim className="mt-5 flex justify-center gap-1.5" aria-hidden>
          {list.map((_, n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                n === i ? "w-6 bg-[#ffd77a]" : n < i ? "w-1.5 bg-[#ffd77a]/50" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={onDone} className="lf-sb-link px-1 text-sm text-white/60 hover:text-white">
            {last ? "Close" : "Skip tour"}
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <SkyButton variant="glass" size="sm" onClick={back} aria-label="Previous step" className="w-11 px-0">
                <ArrowLeft className="h-4 w-4" />
              </SkyButton>
            )}
            <SkyButton ref={nextBtn} size="sm" onClick={next} skyling={guide}>
              {last ? "Start using LifeFlow" : "Next"}
            </SkyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
