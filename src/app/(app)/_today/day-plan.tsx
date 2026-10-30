"use client";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Mic, RotateCw, Sparkles, X } from "lucide-react";
import { useShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

/** Re-reads today's data (the day plan is built on the server). */
export function RefreshPlan({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      aria-label="Refresh the plan"
      className={cn("tap flex items-center justify-center rounded-full", className ?? "-my-2 text-muted hover:text-text")}
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

/** The one place to ask: tap to open Jarvis (type or talk), with three quick asks under it. */
export function AskBar({ name }: { name: string }) {
  const { openJarvis } = useShell();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => openJarvis()}
        className="flex min-h-14 items-center gap-3 rounded-full bg-surface px-5 text-left shadow-soft transition-shadow hover:shadow-lift"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-accent" />
        <span className="flex-1 text-[15px] text-muted">Ask {name} or tell him something…</span>
        <Mic className="h-5 w-5 shrink-0 text-muted" />
      </button>
      <QuickChips />
    </div>
  );
}

/** One idea a day, until the user is a regular. Dismissed for the day on this device. */
export function TryThis({ title, prompt, day }: { title: string; prompt: string; day: string }) {
  const { openJarvis } = useShell();
  const key = `lf_try_${day}`;
  const [closed, setClosed] = useState(false);
  // Hidden on the server and until the browser says it wasn't dismissed today.
  const dismissed = useSyncExternalStore(
    noSubscribe,
    () => readFlag(key),
    () => true,
  );
  const hidden = closed || dismissed;
  if (hidden) return null;
  const hide = () => {
    setClosed(true);
    try {
      localStorage.setItem(key, "1");
    } catch {}
  };
  return (
    <section aria-label="Try this" className="animate-rise flex items-center gap-3 rounded-3xl bg-accent-soft px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-accent uppercase">Try this</p>
        <button type="button" onClick={() => openJarvis(prompt)} className="mt-0.5 min-h-11 text-left text-[15px] font-medium">
          {title}
        </button>
      </div>
      <button type="button" onClick={hide} aria-label="Hide for today" className="tap flex items-center justify-center rounded-full text-muted">
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}

const noSubscribe = () => () => {};
function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
