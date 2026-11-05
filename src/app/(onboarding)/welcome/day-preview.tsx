"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, CalendarDays, GraduationCap, HeartPulse, Landmark, Mail, RefreshCw, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { gsap, prefersReducedMotion } from "@/components/motion/gsap";
import { previewDay, seeded, type PreviewChip, type PreviewStage } from "@/lib/day-preview";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  Bank: Landmark,
  Canvas: GraduationCap,
  Calendar: CalendarDays,
  "Work schedule": Briefcase,
  Gmail: Mail,
  "Apple Health": HeartPulse,
};
const TONES = [
  { chip: "bg-accent-soft", dot: "bg-accent" },
  { chip: "bg-warning-soft", dot: "bg-warning" },
  { chip: "bg-info-soft", dot: "bg-info" },
];

function Chip({ chip, tone, real, small }: { chip: PreviewChip; tone: number; real?: boolean; small?: boolean }) {
  const t = TONES[tone % TONES.length];
  return (
    <span
      data-chip
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium tabular-nums",
        small ? "px-2.5 py-1 text-[0.75rem]" : "px-3 py-1.5 text-[0.8125rem]",
        real ? "bg-surface ring-1 ring-border" : t.chip,
      )}
    >
      <i className={cn("shrink-0 rounded-full", small ? "h-1.5 w-1.5" : "h-2 w-2", real ? "bg-text-2" : t.dot)} aria-hidden />
      <span className="truncate">{chip.label}</span>
      {chip.example && <em className="text-[0.625rem] tracking-wider text-muted uppercase not-italic">example</em>}
    </span>
  );
}

/**
 * "Your day, connected" (sign-up): a day with everything connected, the numbers the assistant
 * would see, and what it does with them. About ten seconds, skippable, different every run.
 * Everything invented is tagged "example" (lib/day-preview.ts).
 */
export function DayPreview({
  firstName,
  assistant,
  stage,
  course,
  job,
}: {
  firstName: string;
  assistant: string;
  stage: PreviewStage;
  course?: string;
  job?: string;
}) {
  const [run, setRun] = useState(() => Math.floor(Math.random() * 1e9));
  const day = useMemo(() => previewDay({ stage, course, job, now: new Date() }, seeded(run)), [stage, course, job, run]);
  const [phase, setPhase] = useState<"connecting" | "result">(() => (prefersReducedMotion() ? "result" : "connecting"));
  const [status, setStatus] = useState("Putting together an example day…");
  const [note, setNote] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

  const finish = () => {
    tl.current?.kill();
    setPhase("result");
  };

  // The connecting sequence: sources switch on, the numbers appear, then fly into the assistant.
  useEffect(() => {
    if (phase !== "connecting" || !root.current) return;
    const el = root.current;
    const srcs = el.querySelectorAll<HTMLElement>("[data-src]");
    const chips = el.querySelectorAll<HTMLElement>("[data-cloud] [data-chip]");
    setStatus("Putting together an example day…");
    gsap.set(chips, { opacity: 0, scale: 0.6, y: 10 });
    gsap.set(el.querySelectorAll("[data-head]"), { opacity: 0, y: 8 });
    const t = gsap.timeline({ onComplete: () => setPhase("result") });
    tl.current = t;
    t.to(el.querySelectorAll("[data-head]"), { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" });
    srcs.forEach((s, i) => {
      t.call(() => s.setAttribute("data-on", ""), undefined, `+=${i ? 0.28 : 0.15}`).fromTo(
        s,
        { scale: 0.92 },
        { scale: 1, duration: 0.3, ease: "back.out(3)" },
        "<",
      );
    });
    t.call(() => setStatus("Reading the example week…"), undefined, "+=0.2")
      .to(chips, { opacity: 1, scale: 1, y: 0, duration: 0.4, stagger: 0.13, ease: "back.out(2)" })
      .call(() => setStatus(`${assistant} is thinking…`), undefined, "+=1.1")
      .to(chips, {
        duration: 0.6,
        stagger: 0.07,
        ease: "power2.in",
        opacity: 0,
        scale: 0.25,
        x: (_i: number, c: HTMLElement) => {
          const a = c.getBoundingClientRect();
          const b = orb.current!.getBoundingClientRect();
          return b.left + b.width / 2 - (a.left + a.width / 2);
        },
        y: (_i: number, c: HTMLElement) => {
          const a = c.getBoundingClientRect();
          const b = orb.current!.getBoundingClientRect();
          return b.top + b.height / 2 - (a.top + a.height / 2);
        },
      })
      .to(orb.current, { scale: 1.12, duration: 0.35, yoyo: true, repeat: 3, ease: "sine.inOut" }, "-=0.2");
    return () => {
      t.kill();
    };
  }, [phase, run, assistant]);

  // The result cards ease in.
  useEffect(() => {
    if (phase !== "result" || !root.current || prefersReducedMotion()) return;
    const t = gsap.fromTo(
      root.current.querySelectorAll("[data-card]"),
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, stagger: 0.12, ease: "power3.out", clearProps: "transform,opacity" },
    );
    return () => {
      t.kill();
    };
  }, [phase, run]);

  const again = () => {
    setNote(null);
    setRun((r) => r + 1);
    setPhase(prefersReducedMotion() ? "result" : "connecting");
  };

  if (phase === "connecting")
    return (
      <div ref={root} className="flex flex-1 flex-col" aria-label="A day with everything connected">
        <div className="flex items-center justify-between gap-3">
          <p data-head className="text-xs font-medium tracking-wider text-muted uppercase">
            A day with everything connected
          </p>
          <button type="button" onClick={finish} className="-mr-2 min-h-11 rounded-full px-2 text-sm text-muted hover:text-text">
            Skip
          </button>
        </div>
        <h1 data-head className="mt-1 font-display text-[2rem] leading-tight font-medium tracking-tight">
          {firstName}, here&apos;s a day with everything connected.
        </h1>
        <div className="mt-6 grid grid-cols-4 gap-2">
          {day.sources.map((s) => {
            const Icon = ICON[s] ?? CalendarDays;
            return (
              <div
                key={s}
                data-src
                className="group relative flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-1 py-2.5 text-center text-[0.6875rem] leading-tight text-muted shadow-soft data-[on]:text-accent"
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
                {s}
                <span
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-bold text-accent-text opacity-0 group-data-[on]:opacity-100"
                  aria-hidden
                >
                  ✓
                </span>
              </div>
            );
          })}
        </div>
        <div data-cloud className="mt-7 flex min-h-[9.5rem] flex-wrap content-start justify-center gap-2">
          <Chip chip={{ label: day.today, example: false }} tone={0} real />
          {day.stories.flatMap((s, g) => s.chips.map((c) => <Chip key={`${s.id}-${c.label}`} chip={c} tone={g} />))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-3 pt-6">
          <div ref={orb} className="relative h-24 w-24">
            <span className="lf-orb-glow absolute -inset-1/3 rounded-full" aria-hidden />
            <BrandMark className="relative h-full w-full" alt="" />
          </div>
          <p className="min-h-6 text-[0.9375rem] text-text-2" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    );

  return (
    <div ref={root} className="flex flex-1 flex-col">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-9 w-9" alt="" />
        <span>
          <span className="block text-[0.9375rem] font-semibold">{assistant}</span>
          <span className="block text-xs text-muted">Just now</span>
        </span>
      </div>
      <h1 className="mt-4 font-display text-[2rem] leading-tight font-medium tracking-tight">Here&apos;s what I&apos;d do, {firstName}.</h1>
      <div className="mt-5 flex flex-col gap-2.5">
        {day.stories.map((s, g) => (
          <article key={s.id} data-card className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-soft">
            <h2 className="flex items-start gap-2.5 text-[0.9375rem] leading-snug font-semibold">
              <i className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONES[g].dot)} aria-hidden />
              {s.title}
            </h2>
            <p className="pl-[1.125rem] text-sm text-text-2">{s.why}</p>
            <div className="flex flex-wrap items-center gap-1.5 pl-[1.125rem]">
              <span className="text-[0.6875rem] text-muted">From</span>
              {s.chips.map((c) => (
                <Chip key={c.label} chip={{ ...c, example: false }} tone={g} small />
              ))}
            </div>
            <div className="pl-[1.125rem]">
              <button
                type="button"
                onClick={() => setNote(note === g ? null : g)}
                className="min-h-10 rounded-full bg-surface-2 px-4 text-sm font-medium transition-transform active:scale-[0.98]"
              >
                {s.action}
              </button>
              {note === g && (
                <p className="mt-2 text-xs text-muted" role="status">
                  {s.note}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Example numbers. Connect your accounts and these become real.</p>
      <button
        type="button"
        onClick={again}
        className="mx-auto mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-accent hover:bg-accent-soft"
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Show me another day
      </button>
    </div>
  );
}
