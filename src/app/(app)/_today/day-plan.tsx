"use client";
import { AudioLines } from "lucide-react";
import { SkylingSprite } from "@/components/skylings/sprite";
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
        <button key={label} type="button" onClick={() => openJarvis(prompt, { send: true })} className="lf-sb lf-sb-app lf-sb-sm max-w-full">
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The one place to ask: tap to open the chat (type or talk). Above it stands the skyling with its name, so it's clear who
 * you're talking to (owner, 2026-11-10: "it's not an assistant, it's your skyling"): small, on the bar's edge, not over the sky.
 */
export function AskBar({ name, chips = true }: { name: string; chips?: boolean }) {
  const { openJarvis, skyling } = useShell();
  return (
    <div className="flex flex-col gap-3">
      <div className="relative pt-7">
        {/* the skyling stands on the bar's top edge with its name beside it; tap it and it hops */}
        <div className="absolute top-0 left-4 z-10 flex items-end gap-1.5" data-testid="ask-skyling">
          <SkylingSprite companion={skyling} className="-mb-1.5 h-9 w-9 cursor-pointer" />
          <span className="lf-chip-night mb-1 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold">{name}</span>
        </div>
        <button
          type="button"
          data-tour="ask"
          onClick={() => openJarvis()}
          className="flex min-h-14 w-full items-center gap-3 rounded-[1.5rem] bg-surface py-2 pr-2 pl-5 text-left shadow-lift ring-1 ring-border/70 transition-shadow hover:shadow-lift active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1 truncate text-[1rem] text-muted">Message {name}…</span>
          <span className="lf-send flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.875rem]" aria-hidden>
            <AudioLines className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>
      {chips && <QuickChips />}
    </div>
  );
}
