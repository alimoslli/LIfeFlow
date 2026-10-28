"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";
import { toast } from "./ui/toaster";

/** Optimistic completion checkbox backed by a server action. The visible box is small; the touch target is 44×44. */
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
          if (!optimistic) haptic("success");
          const r = await action();
          if (r && !r.ok) toast(r.error ?? "Couldn't update.", { tone: "danger" });
          else if (r?.message && (!optimistic || r.message.includes("Next"))) toast(r.message);
        })
      }
      className="tap -m-2.5 flex shrink-0 items-center justify-center rounded-full"
    >
      <span
        className={cn(
          "flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] transition-colors",
          optimistic ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-surface",
          toggled && optimistic && "lf-pop",
        )}
      >
        {optimistic && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
