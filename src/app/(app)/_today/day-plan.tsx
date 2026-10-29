"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCw } from "lucide-react";
import { useShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

/** Re-reads today's data (the day plan is built on the server). */
export function RefreshPlan() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      aria-label="Refresh the plan"
      className="tap -my-2 flex items-center justify-center rounded-full text-muted hover:text-text"
    >
      <RotateCw className={cn("h-4 w-4", pending && "animate-spin")} />
    </button>
  );
}

const CHIPS = [
  ["Plan my day", "Plan my day: look at my schedule, deadlines, to-dos and shifts for today and give me a simple order to do things in."],
  ["Review my spending", "Review my spending this month against my budgets and tell me the one change that would help most."],
  ["Help me study", "Help me study: what's due soonest, and block study time for it in my free time."],
] as const;

/** Today's quick actions: each one asks Jarvis and sends right away. */
export function QuickChips() {
  const { openJarvis } = useShell();
  return (
    <div className="lf-hscroll -mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {CHIPS.map(([label, prompt]) => (
        <button
          key={label}
          type="button"
          onClick={() => openJarvis(prompt, { send: true })}
          className="flex min-h-11 shrink-0 items-center rounded-full bg-surface px-4 text-sm font-medium whitespace-nowrap shadow-soft"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
