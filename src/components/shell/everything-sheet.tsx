"use client";
import { useEffect, useState } from "react";
import { everythingDoorsAction } from "@/app/(app)/everything-actions";
import type { EverythingDoors } from "@/app/(app)/everything-data";
import { DoorGrid } from "@/components/settings/door-grid";
import { Sheet } from "@/components/ui/sheet";

const OPEN = "lf-open-everything";

/** Brings up "Everything else" (from the dock on a phone). */
export function openEverything() {
  window.dispatchEvent(new Event(OPEN));
}

/**
 * Everything else (owner, 2026-11-10, navigation concept A): Today, Money and School are the three places; every other
 * page is a door here, with a line about what's happening in it. It comes up from below and a door closes it behind you.
 */
export function EverythingSheet() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EverythingDoors | null>(null);
  useEffect(() => {
    const show = () => {
      setOpen(true);
      // fresh every time: the numbers on the doors are live
      everythingDoorsAction()
        .then(setData)
        .catch(() => {});
    };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onClose={close} label="Everything else">
      <div className="overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-5">
        <h2 className="px-1 font-display text-[1.5rem] leading-tight font-medium">Everything else</h2>
        <p className="mb-4 px-1 text-sm text-muted">Pull down to go back.</p>
        {data ? (
          <DoorGrid doors={data.doors} onPick={close} />
        ) : (
          <ul className="grid grid-cols-2 gap-3" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="min-h-[6.25rem] animate-pulse rounded-[1.375rem] bg-surface shadow-soft" />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
