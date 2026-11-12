"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayClock } from "@/components/day-clock/day-clock";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { ClockData, ClockItem } from "@/lib/day-clock";
import { addDaysStr, formatDateStr } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** "Now" in the example: 11:30 in the morning, so the class, the clash and the due time are all still ahead. */
const NOW = 11 * 60 + 30;

/**
 * One made-up day, built here and nowhere else: never read from or saved to the database (owner, 2026-11-12). Dates are
 * the visitor's own calendar day so the weekday names look right; everything on it is an invented example.
 */
function exampleDay(): ClockData {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const item = (id: string, o: Partial<ClockItem> & Pick<ClockItem, "title" | "icon" | "cat" | "kind" | "start">): ClockItem => ({
    id,
    end: null,
    allDay: false,
    href: "/waitlist",
    source: "Example",
    subtitle: null,
    ...o,
  });
  const items: ClockItem[] = [
    item("ex-class", { title: "Biology lecture", icon: "🎓", cat: "class", kind: "block", start: 13 * 60, end: 14 * 60 + 15, origin: "event" }),
    item("ex-shift", { title: "Work", subtitle: "Campus cafe", icon: "💼", cat: "work", kind: "block", start: 14 * 60, end: 18 * 60, origin: "shift" }),
    item("ex-due", { title: "Lab report due", icon: "📄", cat: "due", kind: "due", start: 17 * 60, origin: "assignment" }),
    item("ex-night", { title: "Lights out", icon: "🔔", cat: "other", kind: "due", start: 22 * 60 + 30, origin: "reminder" }),
    item("ex-class2", { title: "Statistics", icon: "🎓", cat: "class", kind: "block", start: 1440 + 9 * 60, end: 1440 + 10 * 60 + 15, origin: "event" }),
    item("ex-shift2", {
      title: "Work",
      subtitle: "Campus cafe",
      icon: "💼",
      cat: "work",
      kind: "block",
      start: 1440 + 16 * 60,
      end: 1440 + 20 * 60,
      origin: "shift",
    }),
  ];
  const days = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const date = addDaysStr(today, offset);
    return { offset, date, short: offset === 0 ? "Today" : formatDateStr(date, "EEE"), long: formatDateStr(date, "EEE, MMM d") };
  });
  return { tz, today, base: Date.now() - NOW * 60_000, days, items, steps: null, sleepHours: null, spentTodayCents: null, empty: false };
}

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
  ["turn", "Turning", "Drag the sky sideways. Things rise on the right and set on the left, so you can look ahead or back."],
  ["open", "Opening", "Tap the sky. It pours into a line of your whole week."],
  ["fold", "Folding", "Pull the line down, or tap Back to now, and it folds back into the wheel."],
];

const PARTS: [string, string][] = [
  ["The wheel is your day", "The arc is the sun's path across your day, sunrise to sunset. Everything you have sits on it at the time it happens."],
  ["Now", "The top of the wheel is now, with the skyling's picture on it. Turn the wheel and a button brings you back."],
  ["The stops", "Each stop is a class, a shift or something due. Tap one to read it in a card. The icon says what kind it is."],
  ["A clash", "When two things share the same time, their stops sit on top of each other. Here the lecture and the shift overlap at 2 PM."],
  ["The timeline", "Open the sky and it becomes a line of your week: the days across the top, every stop in order below."],
  ["The night", "On the line, each night is a dip between two days. Tonight's last stop, Lights out, sits at the bottom of it."],
];

export default function SkyExplainerBody({ name, onClose }: { name: string; onClose: () => void }) {
  const data = useMemo(() => exampleDay(), []);
  const example = useMemo(() => ({ now: NOW }), []);
  const root = useRef<HTMLDivElement>(null);
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
      <div className="mx-auto w-full max-w-3xl px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-11 items-center justify-between">{back}</div>
        <p className="mt-4 text-[0.75rem] font-semibold tracking-[0.14em] text-muted uppercase">An example day</p>
        <h2 id="sky-ex-title" ref={heading} tabIndex={-1} className="mt-1 font-display text-[2.125rem] leading-tight font-medium tracking-tight outline-none">
          How your sky works
        </h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          This day is made up, so you can learn the moves. Nothing here is yours, and nothing is saved. Your own sky fills from what you connect.
        </p>

        <p className="mt-4">
          <span
            data-testid="sky-example-tag"
            className="inline-block rounded-full bg-ink-night px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.12em] text-white uppercase"
          >
            Example
          </span>
          <span className="ml-2 text-sm text-muted">Made up, not your day</span>
        </p>
        <div className="lf-welcome-sky relative mt-2">
          <DayClock data={data} mode="full" example={example}>
            <p className="px-5 pt-2 text-center text-sm text-muted">Example: {name} would say &ldquo;Your lecture and your shift overlap at 2.&rdquo;</p>
          </DayClock>
        </div>

        <h3 className="mt-6 text-sm font-medium text-text-2">Try it on the wheel above</h3>
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
  );
}
