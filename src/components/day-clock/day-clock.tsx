"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { prefersReducedMotion } from "@/components/motion/gsap";
import type { ClockData } from "@/lib/day-clock";
import { createDayClock, type DayClockHandle } from "./engine";
import { createDome } from "./dome";
import { PinSheet } from "./pin-sheet";
import { toast } from "@/components/ui/toaster";
import { toggleTaskAction } from "@/app/(app)/tasks/actions";
import { toggleAssignmentAction } from "@/app/(app)/school/actions";
import { blockForEditAction } from "@/app/(app)/_today/actions";
import { BlockSheet, type Block } from "@/app/(app)/plan/block-editor";
import "./day-clock.css";

/**
 * The v3 home: your time today as a clock that turns into a timeline (docs/design/clock/spec.md).
 * React renders the skeleton once; the engine draws and moves it. New data from the server (a refresh)
 * is handed to the running engine instead of rebuilding the page.
 */
export function DayClock({ data, children }: { data: ClockData; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<DayClockHandle | null>(null);
  const router = useRouter();
  const first = useRef(data);
  // Where a new pin goes (minutes from the start of today), while its sheet is open.
  const [pinAt, setPinAt] = useState<number | null>(null);
  // The thing being edited from its card (an event, a shift or an assignment), in the same sheet as Plan.
  const [editing, setEditing] = useState<Exclude<Block, { origin: "task" }> | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // The iOS 18 switch tap is the only web haptic on iPhone; React doesn't know the attribute, so it's set here.
    root.querySelector("[data-dc=hap] input")?.setAttribute("switch", "");
    const reduced = prefersReducedMotion();
    const dome = createDome(root, reduced);
    engine.current = createDayClock(root, first.current, {
      face: dome.draw,
      onOpen: (href) => router.push(href),
      onNewDay: () => router.refresh(),
      onPin: ({ start }) => setPinAt(start),
      // Done right on the card: the same actions as To-dos and School; the line refreshes in place.
      onDone: async (it) => {
        if (!it.ref) return;
        const r = it.origin === "assignment" ? await toggleAssignmentAction(it.ref) : await toggleTaskAction(it.ref);
        if (r?.ok) toast(r.message ?? `Done: ${it.title}.`, { tone: "success" });
        else toast(r?.error ?? "That didn't save. Try again.", { tone: "danger" });
        router.refresh();
      },
      onEdit: async (it) => {
        const b = await blockForEditAction(it.id);
        if (b) setEditing(b);
        else router.push(it.href);
      },
      reducedMotion: reduced,
    });
    return () => {
      dome.destroy();
      engine.current?.destroy();
      engine.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (data !== first.current) engine.current?.update(data);
  }, [data]);

  return (
    <>
      <div ref={ref} className="dc" data-open="false" data-testid="day-clock">
        <canvas data-dc="goo" aria-hidden="true" />
        <svg data-dc="face" aria-hidden="true">
          <defs>
            <radialGradient id="dc-press">
              <stop offset="0" className="dc-stop-a" />
              <stop offset=".8" className="dc-stop-b" />
              <stop offset="1" className="dc-stop-c" />
            </radialGradient>
            <filter id="dc-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <filter id="dc-halo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" />
            </filter>
          </defs>
          <g data-dc="leaders" />
          <g data-dc="faceG">
            <circle data-dc="halo" className="dc-halo" filter="url(#dc-halo)" opacity="0" />
            <g data-dc="press" opacity="0">
              <circle fill="url(#dc-press)" />
              <circle className="dc-press-ring" />
            </g>
            <path data-dc="rim" className="dc-rim" />
            <g data-dc="arcs" />
            <g data-dc="ticks" />
            <g data-dc="day" />
            <g data-dc="hands">
              <line data-dc="hour" className="dc-hour" />
              <line data-dc="minute" className="dc-minute" />
              <circle data-dc="hub" className="dc-hub" r="4.2" />
            </g>
            <g data-dc="steps" />
          </g>
        </svg>
        <svg data-dc="dome" className="dc-dome" aria-hidden="true" />
        <canvas data-dc="who" className="dc-who" width={16} height={16} aria-hidden="true" />
        <div data-dc="callouts" className="dc-callouts" aria-hidden="true" />
        <div data-dc="micons" className="dc-micons" aria-hidden="true" />
        <div data-dc="hint" className="dc-hint">
          Tap the clock to open your day
        </div>
        <div data-dc="sub" className="dc-sub">
          <button type="button" data-dc="today" className="dc-todaybtn" aria-label="Open today as a timeline">
            Today
            <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
              <path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <nav data-dc="days" className="dc-days" aria-label="Days" />
        </div>
        <div data-dc="chips" className="dc-tiles" />
        <div data-dc="trackWrap" className="dc-trackwrap" role="region" aria-label="Timeline">
          <div data-dc="track" className="dc-track" />
        </div>
        <div data-dc="detail" className="dc-detail" aria-live="polite" />
        {/* Pin anything: here, or tap any empty spot on the line. Hidden while a card is open (CSS). */}
        <div data-dc="pinbar" className="dc-pinbar">
          <button type="button" onClick={() => setPinAt(engine.current?.pinTime() ?? 0)}>
            <Plus className="h-4 w-4" aria-hidden />
            Pin something
          </button>
        </div>
        <div data-dc="hintWrap" className="dc-hint dc-hint-wrap">
          Pull down to wrap your day
        </div>
        <div data-dc="hit" className="dc-hit" role="button" tabIndex={0} aria-label="Open your day as a timeline" />
        {/* Under the closed clock: the assistant's one line. It steps aside while the timeline is open. */}
        <div data-dc="foot" className="dc-foot">
          {children}
        </div>
        <label data-dc="hap" className="dc-hap" aria-hidden="true">
          <input type="checkbox" tabIndex={-1} />
        </label>
        <span data-dc="probe" className="dc-probe" aria-hidden="true" />
      </div>
      {/* Outside the clock: its no-select gesture area mustn't reach the sheets' inputs (iOS Safari). */}
      <BlockSheet
        block={editing}
        onClose={() => {
          setEditing(null);
          router.refresh();
        }}
      />
      <PinSheet
        at={pinAt}
        today={data.today}
        onClose={() => setPinAt(null)}
        onSaved={() => {
          setPinAt(null);
          router.refresh();
        }}
      />
    </>
  );
}
