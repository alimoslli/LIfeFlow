"use client";
import { useEffect, useTransition, type ReactNode } from "react";
import { celebrate } from "@/components/motion/burst";
import { useShell } from "@/components/shell/app-shell";
import { celebrateMilestoneAction } from "./actions";

/** Opens the skyling with a prompt already sent. */
export function AskJarvisButton({ prompt, children }: { prompt: string; children: ReactNode }) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(prompt, { send: true })} className="lf-sb lf-sb-app lf-sb-sm">
      {children}
    </button>
  );
}

const MESSAGES: Record<number, string> = {
  25: "A quarter of the way there.",
  50: "Halfway there!",
  75: "Three quarters done. The finish line is close.",
  100: "You did it. Goal reached!",
};

/** Celebrates a goal milestone once, then remembers it was seen. */
export function CelebrateGoal({ goalId, name, percent }: { goalId: string; name: string; percent: number }) {
  const [, start] = useTransition();
  useEffect(() => {
    // seen the moment it shows: leaving the page within its few seconds used to bring it back on every visit
    start(async () => {
      await celebrateMilestoneAction(goalId, percent);
    });
    // the milestone sun with the goal's line (owner, 2026-11-10): it pops up over the middle and is gone in about three
    // seconds. It used to be a card stuck over the bottom of the page, covering the goal for eight (nothing over anything).
    const t = setTimeout(() => celebrate(null, "big", `${name}: ${percent}%`, { silent: true }), 350);
    return () => clearTimeout(t);
  }, [goalId, percent, name]);
  // the words for screen readers (the sun is a picture)
  return (
    <p role="status" className="sr-only">
      {name}: {percent}%. {MESSAGES[percent]}
    </p>
  );
}
