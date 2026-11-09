"use client";
import { AudioLines } from "lucide-react";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { useShell } from "@/components/shell/app-shell";

const CHIPS = [
  ["Plan my day", "Plan my day: look at my schedule, deadlines, to-dos and shifts for today and give me a simple order to do things in."],
  ["Review my spending", "Review my spending this month against my budgets and tell me the one change that would help most."],
  ["Help me study", "Help me study: what's due soonest, and block study time for it in my free time."],
] as const;

/** Today's quick actions: each one asks Jarvis and sends right away. */
export function QuickChips() {
  const { openJarvis } = useShell();
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map(([label, prompt]) => (
        <button
          key={label}
          type="button"
          onClick={() => openJarvis(prompt, { send: true })}
          className="flex min-h-11 max-w-full items-center rounded-full bg-surface px-4 text-[0.875rem] font-medium text-text-2 shadow-soft ring-1 ring-border/60 transition-colors hover:text-accent active:scale-[0.98]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The one place to ask: tap to open Jarvis (type or talk), with three quick asks under it. */
export function AskBar({ name, chips = true }: { name: string; chips?: boolean }) {
  const { openJarvis, companion } = useShell();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        data-tour="ask"
        onClick={() => openJarvis()}
        className="flex min-h-14 items-center gap-3 rounded-[28px] bg-surface py-2 pr-2 pl-3 text-left shadow-lift ring-1 ring-border/70 transition-shadow hover:shadow-lift active:scale-[0.99]"
      >
        {/* the companion, the one on top of the day: it's the assistant you're about to talk to */}
        <CompanionGlyph companion={companion} className="lf-bob h-9 w-9" />
        <span className="min-w-0 flex-1 truncate text-[1rem] text-muted">Message {name}…</span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text shadow-soft" aria-hidden>
          <AudioLines className="h-[18px] w-[18px]" />
        </span>
      </button>
      {chips && <QuickChips />}
    </div>
  );
}
