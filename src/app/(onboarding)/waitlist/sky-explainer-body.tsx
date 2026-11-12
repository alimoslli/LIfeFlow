"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayClock } from "@/components/day-clock/day-clock";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { SkyScene } from "@/components/sky/sky-scene";
import { cn } from "@/lib/utils";
import { exampleDay } from "./sky-explainer-day";
import { SkyLabels } from "./sky-explainer-labels";

type Step = "turn" | "open" | "fold";

/** Ticks each move when the wheel really does it (the same signals as the welcome's "Read your sky"). */
function useWheelSteps() {
  const [done, setDone] = useState<Record<Step, boolean>>({ turn: false, open: false, fold: false });
  useEffect(() => {
    const dc = document.querySelector<HTMLElement>("[data-testid=day-clock]");
    if (!dc) return;
    let opened = false;
    const watch = new MutationObserver(() => {
      const s = dc.dataset.state;
      if (s === "timeline") {
        opened = true;
        setDone((d) => ({ ...d, open: true }));
      }
      if (s === "clock" && opened) setDone((d) => ({ ...d, fold: true }));
    });
    watch.observe(dc, { attributes: true, attributeFilter: ["data-state"] });
    let from: number | null = null;
    const down = (e: PointerEvent) => (from = e.clientX);
    const move = (e: PointerEvent) => {
      if (from != null && Math.abs(e.clientX - from) > 28 && dc.dataset.state === "clock") setDone((d) => ({ ...d, turn: true }));
    };
    const up = () => (from = null);
    const turned = () => setDone((d) => ({ ...d, turn: true }));
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") turned();
    };
    dc.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    dc.addEventListener("wheel", turned, { passive: true });
    dc.addEventListener("keydown", key);
    return () => {
      watch.disconnect();
      dc.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dc.removeEventListener("wheel", turned);
      dc.removeEventListener("keydown", key);
    };
  }, []);
  return done;
}

const TRY: [Step, string, string][] = [
  ["turn", "Turn it", "Drag the sky sideways. Things rise on the right and set on the left, so you can look ahead or back."],
  ["open", "Open it", "Tap the sky. It pours into a line of your whole week."],
  ["fold", "Fold it", "Tap the skyling on the line, or press Escape, and it folds back into the wheel."],
];

const PARTS: [string, string][] = [
  ["The wheel is your day", "The arc is the sun's path across your day, sunrise to sunset. Everything you have sits on it at the time it happens."],
  ["Now", "The top of the wheel is now, with the skyling's picture on it. Turn the wheel and a button brings you back."],
  ["A stop", "A class, a shift or something due. The icon says what kind it is; tap one to read it in a card."],
  ["A clash", "When two things share the same time, their stops sit together. Here the Statistics class and the shift overlap at 2 PM."],
  ["The timeline", "Open the sky and it becomes a line of your week: the days across the top, every stop in order along it."],
  ["The night", "Under the horizon is the night. On the line each night is a dip between two days, with sleep and what happened."],
];

/**
 * "How your sky works" (owner, 2026-11-12: "same exact thing, but not the whole picture, just the mechanism"): the real Today
 * screen with only the wheel and its timeline left in, on a made-up day. It renders the same shell pieces Today sits in (the
 * glass, the sky scene, the page's width and padding, the phone's top bar row, `dc-today`, the real `DayClock`) and leaves out
 * the tabs, the chat bar, the clouds, Money and the skyling's note. A state of the waitlist page, never a route.
 */
export default function SkyExplainerBody({ name, tz, companion, onClose }: { name: string; tz: string; companion?: string | null; onClose: () => void }) {
  const data = useMemo(() => exampleDay(tz), [tz]);
  const example = useMemo(() => ({}), []);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const done = useWheelSteps();

  useEffect(() => {
    heading.current?.focus();
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Escape folds an open timeline first (the wheel's own rule); only on the folded wheel does it leave the explainer
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.querySelector<HTMLElement>("[data-testid=day-clock]")?.dataset.state === "clock") onClose();
    };
    // keep the keyboard inside the explainer, so nobody tabs into the page behind it
    const stay = (e: FocusEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) heading.current?.focus();
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", stay);
    return () => {
      document.body.style.overflow = was;
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", stay);
    };
  }, [onClose]);

  const back = (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-[0.9375rem] font-medium text-text shadow-soft ring-1 ring-border"
    >
      <PixelIcon name="undo" className="h-4 w-4" aria-hidden />
      Back to my place in line
    </button>
  );

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sky-ex-title"
      data-testid="sky-explainer"
      className="lf-glass fixed inset-0 z-50 overflow-y-auto bg-bg text-text"
    >
      <SkyScene tz={tz} />
      {/* the same page frame as the app shell's main (width, padding), without its tabs */}
      <main className="mx-auto w-full max-w-5xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 md:max-w-6xl md:px-6 md:pt-5">
        <h2 id="sky-ex-title" ref={heading} tabIndex={-1} className="sr-only outline-none">
          How your sky works
        </h2>
        {/* the row Today's phone app bar and laptop top bar occupy: here it holds the way back and the Example tag */}
        <header className="sticky top-0 z-30 -mx-5 mb-2 flex h-12 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] sm:-mx-8 md:static md:mx-0 md:mb-3 md:h-11 md:px-0">
          {back}
          <span
            data-testid="sky-example-tag"
            className="inline-block rounded-full bg-ink-night px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.12em] text-white uppercase"
          >
            Example
          </span>
        </header>

        <div className="md:pt-2">
          <div className="dc-today flex flex-col gap-5">
            <section aria-label="Your day (an example)" className="-mx-5 sm:-mx-8 md:mx-0">
              <div ref={stage} className="relative">
                <DayClock data={data} mode="full" companion={companion} example={example} />
                <SkyLabels stage={stage} />
              </div>
            </section>
            {/* the room Today gives its middle: what this is */}
            <div className="dc-middle md:hidden">
              <p className="text-[0.9375rem] text-muted">
                A made-up day, so you can learn the moves. Nothing here is yours or saved. {name} and your own sky fill from what you connect.
              </p>
            </div>

            <div className="mx-auto w-full max-w-3xl">
              <h3 className="text-sm font-medium text-text-2">Try it on the wheel</h3>
              <ol className="mt-2 flex flex-col gap-2.5" aria-label="Try it">
                {TRY.map(([k, t, d]) => (
                  <li
                    key={k}
                    data-testid={`try-${k}`}
                    data-done={done[k]}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-300",
                      done[k] ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface shadow-soft",
                    )}
                  >
                    <PixelIcon name={done[k] ? "todo" : "box"} className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                    <span>
                      <span className="block text-[0.9375rem] font-medium">
                        {t}
                        {done[k] && <span className="sr-only"> (done)</span>}
                      </span>
                      <span className={cn("block text-sm", done[k] ? "text-ink-night/75" : "text-muted")}>{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <h3 className="mt-6 text-sm font-medium text-text-2">What everything means</h3>
              <dl className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {PARTS.map(([t, d]) => (
                  <div key={t} className="rounded-2xl bg-surface px-4 py-3.5 shadow-soft">
                    <dt className="text-[0.9375rem] font-medium">{t}</dt>
                    <dd className="mt-0.5 text-sm text-muted">{d}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-[0.9375rem] font-medium">The rest opens when you&apos;re let in.</p>
              <div className="mt-3">{back}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
