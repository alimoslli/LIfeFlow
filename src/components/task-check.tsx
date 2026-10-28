"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";

/** Optimistic completion checkbox backed by a server action. */
export function TaskCheck({ done, action, label }: { done: boolean; action: () => Promise<ActionState>; label: string }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  const [toggled, setToggled] = useState(false); // pop only when the user ticks it, not on page load
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={label}
      onClick={() =>
        start(async () => {
          setToggled(true);
          setOptimistic(!optimistic);
          await action();
        })
      }
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        optimistic ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-surface hover:border-accent",
      )}
    >
      {optimistic && <Check className={cn("h-3 w-3", toggled && "lf-pop")} strokeWidth={3} />}
    </button>
  );
}
