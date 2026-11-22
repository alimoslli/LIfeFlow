"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import { backOnTrackAction } from "./actions";

/**
 * Back on track (owner, 2026-11-22, the ADHD helps, item 3; lib/back-on-track.ts): one quiet line when to-dos are
 * waiting, and one tap spreads them across free time. Never a list of what slipped, never "overdue" or "missed", never how
 * long it's been. After the tap it says what moved where, with Undo. Stays mounted after the page re-renders without it.
 */
export function BackOnTrack({ count, line, className }: { count: number; line: string | null; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [done, setDone] = useState<{ text: string; undo?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!done && !count) return null;
  const go = () =>
    start(async () => {
      setError(null);
      const r = await backOnTrackAction();
      if (r?.ok) setDone({ text: line ? `${line}.` : (r.message ?? "Done."), undo: r.undo });
      else setError(r?.error ?? "That didn't work. Try again.");
    });
  const undo = (id: string) =>
    start(async () => {
      const r = await respondAction(id, "undo");
      if (r?.ok) setDone(null);
      else setError(r?.error ?? "That didn't work. Try again.");
      router.refresh();
    });
  return (
    <section aria-label="Back on track" className={`flex flex-col items-center gap-2 text-center ${className ?? ""}`} data-testid="back-on-track">
      {done ? (
        <>
          <p role="status" className="text-sm text-text-2" data-testid="back-on-track-done">
            {done.text}
          </p>
          {done.undo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => undo(done.undo!)}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              <PixelIcon name="undo" className="h-4 w-4" aria-hidden /> Undo
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-text-2">{count === 1 ? "1 to-do can find a new time." : `${count} to-dos can find new times.`}</p>
          <button type="button" disabled={busy} onClick={go} className="lf-sb lf-sb-glass lf-sb-sm lf-sb-day min-h-11" data-testid="back-on-track-go">
            Back on track
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
