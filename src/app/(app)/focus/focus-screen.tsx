"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { FIRST_MINUTES, KEEP_GOING_MINUTES } from "@/lib/first-step";
import { clockLeft, clockUp, focusCheck, type FocusNext } from "@/lib/focus-check";
import { ownsNight } from "@/lib/companions";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { FRAMES } from "@/components/day-clock/companion";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { celebrate } from "@/components/motion/burst";
import { prefersReducedMotion } from "@/components/motion/gsap";
import { useShell } from "@/components/shell/app-shell";
import { toast } from "@/components/ui/toaster";
import { toggleTaskAction } from "../tasks/actions";
import { toggleAssignmentAction } from "../school/actions";

type Session = { startedAt: number; minutes: number };
const KEY = (item: string) => `lf-focus:${item}`;
/** A session left open longer than this is over (a phone left on the desk overnight). */
const STALE_MS = 4 * 60 * 60_000;

// the session lives in the browser only (the person's own device), read through a tiny store so a reload keeps it
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function storedSession(item: string): string | null {
  try {
    return localStorage.getItem(KEY(item));
  } catch {
    return null;
  }
}
function parseSession(raw: string | null, now: number): Session | null {
  try {
    const s = JSON.parse(raw ?? "null") as Session | null;
    return s && typeof s.startedAt === "number" && typeof s.minutes === "number" && now - s.startedAt < STALE_MS ? s : null;
  } catch {
    return null;
  }
}
function writeSession(item: string, s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY(item), JSON.stringify(s));
    else localStorage.removeItem(KEY(item));
  } catch {
    // private mode: the session just won't survive a reload
  }
  listeners.forEach((l) => l());
}

/**
 * The focus screen (owner, 2026-11-22, the ADHD helps 1, 4 and 6): calm, one thing, one first step, a short timer, and
 * the person's skyling sitting with them, reading while they work. Nothing is sent anywhere while it runs; finishing
 * ticks the thing off through the usual action (its star and Undo). The check-in line (lib/focus-check.ts) only speaks
 * inside a session they started.
 */
export function FocusScreen(p: {
  itemKey: string;
  origin: "task" | "assignment";
  id: string;
  title: string;
  course: string | null;
  done: boolean;
  step: string;
  name: string;
  companion: string | null;
  next: FocusNext;
  headsUp: number;
}) {
  const router = useRouter();
  const { openJarvis } = useShell();
  const raw = useSyncExternalStore(
    subscribe,
    () => storedSession(p.itemKey),
    () => null,
  );
  const [now, setNow] = useState(() => Date.now());
  const session = parseSession(raw, now);
  const [frame, setFrame] = useState(0);
  const [finished, setFinished] = useState(false);
  const [pending, start] = useTransition();
  const doneButton = useRef<HTMLButtonElement>(null);

  const running = !!session;
  useEffect(() => {
    if (!running) return;
    const reduced = prefersReducedMotion();
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (!reduced) setFrame((f) => (f + 1) % FRAMES.read.length);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const begin = (minutes: number) => {
    const s = { startedAt: Date.now(), minutes };
    setNow(s.startedAt);
    writeSession(p.itemKey, s);
  };
  const stop = () => writeSession(p.itemKey, null);
  // the first sitting counts down; "Keep going" has no set end and counts up (research 2026-11-22: no fixed focus blocks)
  const open = !!session && session.minutes === 0;
  const left = session && !open ? session.startedAt + session.minutes * 60_000 - now : 0;
  const timeUp = !!session && !open && left <= 0;
  const planned = open ? KEEP_GOING_MINUTES : (session?.minutes ?? FIRST_MINUTES);
  const check = session ? focusCheck({ startedAt: session.startedAt, plannedMinutes: planned, now, next: p.next, headsUp: p.headsUp }) : null;

  const finish = () =>
    start(async () => {
      const r = p.origin === "task" ? await toggleTaskAction(p.id) : await toggleAssignmentAction(p.id);
      if (!r?.ok) {
        toast(r?.error ?? "Couldn't save. Try again.", { tone: "danger" });
        return;
      }
      stop();
      setFinished(true);
      celebrate(doneButton.current?.getBoundingClientRect() ?? null, "small", "Done");
    });

  const pose = finished ? "celebrate" : session ? "read" : "idle";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-1 pt-6 pb-10 text-center">
      <h1 className="sr-only">Start it</h1>
      {/* "Sit with me": their skyling stays beside them, reading while they work */}
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-surface shadow-soft" aria-hidden>
        <CompanionGlyph
          companion={p.companion}
          night={ownsNight(p.companion)}
          pose={pose}
          frame={finished ? 2 : session ? frame : 0}
          className="lf-pixel h-20 w-20"
        />
      </div>
      <div>
        {p.course && <p className="text-[0.75rem] font-semibold tracking-[0.1em] text-muted uppercase">{p.course}</p>}
        <p className="mt-1 font-display text-[1.75rem] leading-[1.15] font-medium tracking-[-0.02em] text-balance" data-testid="focus-title">
          {p.title}
        </p>
      </div>

      {finished || p.done ? (
        <section aria-live="polite" className="flex flex-col items-center gap-3">
          <p className="text-[1.0625rem] font-medium" data-testid="focus-finished">
            {p.done && !finished ? "This one's already done." : "Done. That counts."}
          </p>
          <Link href="/" className="lf-sb lf-sb-sun lf-sb-sm min-h-11">
            Back to my day
          </Link>
        </section>
      ) : !session ? (
        <section aria-label="First step" className="flex w-full flex-col items-center gap-4">
          <div className="w-full rounded-3xl bg-surface px-5 py-4 shadow-soft">
            <p className="text-xs font-medium text-muted">Just this first</p>
            <p className="mt-1 text-[1.0625rem] leading-snug" data-testid="focus-step">
              {p.step}
            </p>
          </div>
          <button type="button" className="lf-sb lf-sb-sun min-h-12" onClick={() => begin(FIRST_MINUTES)} data-testid="focus-start">
            <PixelIcon name="play" className="h-4 w-4" aria-hidden /> Start {FIRST_MINUTES} minutes
          </button>
          <p className="text-sm text-muted">{p.name} will sit with you.</p>
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-accent underline-offset-4 hover:underline"
            onClick={() => openJarvis(`Break "${p.title}" into small steps I can start now.`, { send: false })}
          >
            Ask {p.name} to break it down
          </button>
        </section>
      ) : (
        <section aria-label="Working on it" className="flex w-full flex-col items-center gap-4">
          <p className="font-display text-[3.5rem] leading-none tabular-nums" role="timer" aria-live="off" data-testid="focus-clock">
            {open ? clockUp(now - session.startedAt) : timeUp ? "0:00" : clockLeft(left)}
          </p>
          <p className="text-[0.9375rem] text-text-2">{p.step}</p>
          {check && (
            <p role="status" className="rounded-2xl bg-surface px-4 py-2.5 text-[0.9375rem] shadow-soft" data-testid="focus-check">
              {check}
            </p>
          )}
          {timeUp && !check && (
            <p role="status" className="text-[1.0625rem] font-medium" data-testid="focus-timeup">
              {FIRST_MINUTES} minutes done. You started.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button ref={doneButton} type="button" disabled={pending} className="lf-sb lf-sb-sun lf-sb-sm min-h-11" onClick={finish} data-testid="focus-done">
              <PixelIcon name="check" className="h-4 w-4" aria-hidden /> I finished it
            </button>
            {timeUp && (
              <button type="button" className="lf-sb lf-sb-glass lf-sb-sm min-h-11 lf-sb-day" onClick={() => begin(0)} data-testid="focus-keep">
                Keep going
              </button>
            )}
            <button
              type="button"
              className="lf-sb lf-sb-glass lf-sb-sm min-h-11 lf-sb-day"
              onClick={() => {
                stop();
                router.push("/");
              }}
              data-testid="focus-enough"
            >
              That&apos;s enough for now
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
