"use client";
import { useState, useTransition, type ReactNode } from "react";
import { PartyPopper, X } from "lucide-react";
import { Confetti } from "@/components/motion/celebrate";
import { useShell } from "@/components/shell/app-shell";
import { celebrateMilestoneAction } from "./actions";

/** Opens the assistant with a prompt already sent. */
export function AskJarvisButton({ prompt, children }: { prompt: string; children: ReactNode }) {
  const { openJarvis } = useShell();
  return (
    <button
      type="button"
      onClick={() => openJarvis(prompt, { send: true })}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-medium text-text hover:bg-surface-3"
    >
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
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const close = () => {
    setOpen(false);
    start(async () => {
      await celebrateMilestoneAction(goalId, percent);
    });
  };
  if (!open) return null;
  return (
    <>
      <Confetti />
      <div
        role="status"
        className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[71] mx-auto max-w-sm animate-rise rounded-3xl bg-surface p-5 shadow-lift lg:bottom-8"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <PartyPopper className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {name}: {percent}%
            </p>
            <p className="mt-0.5 text-sm text-text-2">{MESSAGES[percent]}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="tap -m-3 flex items-center justify-center text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
