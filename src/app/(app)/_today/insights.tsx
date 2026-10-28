"use client";
import Link from "next/link";
import { VoiceButton } from "@/components/jarvis/voice-call";
import { ArrowRight, BookOpen, CalendarClock, Clock, Flag, Sparkles, Split, TrendingUp, Wallet } from "lucide-react";
import { useShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";
import type { Insight } from "@/server/briefing/types";

const ICONS = { clock: Clock, conflict: Split, book: BookOpen, money: Wallet, trend: TrendingUp, calendar: CalendarClock, goal: Flag, spark: Sparkles };
const TONE = {
  attention: "bg-danger-soft text-danger",
  "heads-up": "bg-warning-soft text-warning",
  good: "bg-success-soft text-success",
};

/** "Jarvis noticed" — each observation has at most one action. */
export function InsightList({ insights }: { insights: Insight[] }) {
  const { openJarvis } = useShell();
  return (
    <ul className="flex flex-col gap-2.5">
      {insights.map((i, n) => {
        const Icon = ICONS[i.icon];
        const action = i.action;
        return (
          <li key={i.id} className="animate-rise" style={{ animationDelay: `${120 + n * 70}ms` }}>
            <div data-tilt className="flex gap-3.5 rounded-3xl bg-surface p-4 shadow-soft sm:p-5">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE[i.tone])}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1 pt-1.5">
                <p className="text-[15.5px] leading-snug text-text">{i.text}</p>
                {i.detail && <p className="mt-1 text-sm text-muted">{i.detail}</p>}
                {action &&
                  (action.href ? (
                    <Link
                      href={action.href}
                      className="mt-1 -mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent transition-all hover:gap-2.5"
                    >
                      {action.label} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => openJarvis(action.prompt, { send: true })}
                      className="mt-1 -mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent transition-all hover:gap-2.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> {action.label}
                    </button>
                  ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The "ask anything" bar at the bottom of Today. */
export function AskBar({ name }: { name: string }) {
  const { openJarvis, assistantName } = useShell();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
        const q = input.value.trim();
        openJarvis(q || undefined, { send: !!q });
        input.value = "";
      }}
      className="flex items-center gap-3 rounded-full bg-surface py-1.5 pr-1.5 pl-5 shadow-soft focus-within:shadow-lift transition-shadow"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-accent" />
      <input
        name="q"
        placeholder={`What's on your mind, ${name}?`}
        aria-label={`Ask ${assistantName}`}
        className="min-w-0 flex-1 bg-transparent py-2 text-[15px] placeholder:text-muted focus:outline-none"
      />
      <VoiceButton module="home" assistantName={assistantName} />
      <button className="min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-text">Ask</button>
    </form>
  );
}
