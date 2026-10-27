"use client";
import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";

/** Optimistic completion checkbox backed by a server action. */
export function TaskCheck({ done, action, label }: { done: boolean; action: () => Promise<ActionState>; label: string }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={label}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await action();
        })
      }
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        optimistic ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-surface hover:border-accent",
      )}
    >
      {optimistic && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}
