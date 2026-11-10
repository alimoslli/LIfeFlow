"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { prefersReducedMotion } from "@/components/motion/gsap";
import { celebrate, hop } from "@/components/motion/burst";
import type { ClockData } from "@/lib/day-clock";
import type { TodayMode } from "@/lib/theme";
import { createDayClock, type DayClockHandle } from "./engine";
import { createSky } from "./sky";
import { PinSheet } from "./pin-sheet";
import { toast } from "@/components/ui/toaster";
import { toggleTaskAction } from "@/app/(app)/tasks/actions";
import { toggleAssignmentAction } from "@/app/(app)/school/actions";
import { blockForEditAction } from "@/app/(app)/_today/actions";
import { BlockSheet, type Block } from "@/app/(app)/plan/block-editor";
import "./day-clock.css";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/**
 * The v3 home: your day as the sky (Day Sky, owner 2026-11-09), which pours into the timeline of your week
 * (docs/design/clock/spec.md section 8; concept docs/design/companions/day-sky.html).
 * React renders the skeleton once; the engine draws and moves it. New data from the server (a refresh)
 * is handed to the running engine instead of rebuilding the page.
 */
export function DayClock({
  data,
  mode = "full",
  companion,
  open,
  children,
}: {
  data: ClockData;
  /** Set to pour the sky into the week (true) or fold it back (false); left out, only the person opens it. */
  open?: boolean;
  mode?: TodayMode;
  /** The person's companion (lib/companions); the default until they pick. */
  companion?: string | null;
  children?: React.ReactNode;
}) {
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
    const sky = createSky(root, reduced);
    engine.current = createDayClock(root, first.current, {
      sky: sky.draw,
      onOpen: (href) => router.push(href),
      onNewDay: () => router.refresh(),
      onPin: ({ start }) => setPinAt(start),
      // Done right on the card: the same actions as To-dos and School; the line refreshes in place.
      onDone: async (it, at) => {
        if (!it.ref) return;
        const r = it.origin === "assignment" ? await toggleAssignmentAction(it.ref) : await toggleTaskAction(it.ref);
        if (r?.ok) {
          // the moment it's done: sparks from where it was done, and the skyling on the line jumps for joy
          celebrate(at, "small");
          hop(root.querySelector(".dc-now-who"));
          sky.cheer();
          toast(r.message ?? `Done: ${it.title}.`, { tone: "success" });
        } else toast(r?.error ?? "That didn't save. Try again.", { tone: "danger" });
        router.refresh();
      },
      onEdit: async (it) => {
        const b = await blockForEditAction(it.id);
        if (b) setEditing(b);
        else router.push(it.href);
      },
      reducedMotion: reduced,
    });
    // Diagnostics only (?debug=1): hold the motion at any point, for looking at it frame by frame.
    if (new URLSearchParams(window.location.search).get("debug") === "1")
      (window as unknown as { lfClock?: { seek: (p: number) => void; visit: typeof sky.visit } }).lfClock = {
        seek: (p) => engine.current?.seek(p),
        visit: sky.visit,
      };
    return () => {
      sky.destroy();
      engine.current?.destroy();
      engine.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (data !== first.current) engine.current?.update(data);
  }, [data]);
  useEffect(() => {
    if (open === undefined) return;
    // a beat after the sky appears, so the pour reads as a moment
    const t = setTimeout(() => engine.current?.setOpen(open), 500);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <>
      <div ref={ref} className="dc" data-open="false" data-mode={mode} data-companion={companion ?? undefined} data-testid="day-clock">
        {/* The window's sky at the time on top of the wheel; the line's own sky takes over as it opens. */}
        <div data-dc="skybg" className="dc-skybg" aria-hidden="true">
          <svg data-dc="stars" className="dc-stars" />
          <span data-dc="cloud" className="dc-cloud" style={{ left: "8%", top: "34%", width: 150, height: 46 }} />
          <span data-dc="cloud" className="dc-cloud dc-cloud-b" style={{ left: "58%", top: "52%", width: 120, height: 36 }} />
        </div>
        <svg data-dc="dome" className="dc-dome" aria-hidden="true" />
        <canvas data-dc="who" className="dc-who" width={24} height={24} aria-hidden="true" />
        {/* The wheel's way home: shown only while it's turned away from now (sky.ts places it, the engine rolls it). */}
        <button type="button" data-dc="back" className="dc-back" hidden>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Back to now
        </button>
        {/* Under the horizon, in words (the hit area's label says the same for screen readers). */}
        <div data-dc="words" className="dc-words" aria-hidden="true" />
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
            <PixelIcon name="plus" className="h-4 w-4" aria-hidden />
            Pin something
          </button>
        </div>
        <div data-dc="hintWrap" className="dc-hint">
          Pull down to fold it back into the sky
        </div>
        <div data-dc="hit" className="dc-hit" role="button" tabIndex={0} aria-label="Open your day as a timeline" />
        {/* Under the sky: the skyling's one line. It steps aside while the timeline is open. */}
        <div data-dc="foot" className="dc-foot">
          {children}
        </div>
        <label data-dc="hap" className="dc-hap" aria-hidden="true">
          <input type="checkbox" tabIndex={-1} />
        </label>
      </div>
      {/* Outside Today: its no-select gesture area mustn't reach the sheets' inputs (iOS Safari). */}
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
