"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useShell } from "@/components/shell/app-shell";
import type { DayLoad, LoadLevel, WeekLoad } from "@/lib/life-load";
import { cn } from "@/lib/utils";

const FILL: Record<LoadLevel, string> = {
  light: "bg-accent/30",
  steady: "bg-accent/60",
  heavy: "bg-accent",
  overloaded: "bg-warning",
};
const WORD: Record<LoadLevel, string> = { light: "Light", steady: "Steady", heavy: "Full", overloaded: "Too much" };
const roughly = (h: number) => (h < 0.5 ? "nothing planned" : `about ${Math.max(1, Math.round(h))} hour${Math.round(h) > 1 ? "s" : ""}`);
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * The week ahead at a glance: one quiet row of bars and one sentence. Details
 * (why a day is full, bills due) only appear for the day the user taps.
 */
export function LifeLoad({ week }: { week: WeekLoad }) {
  const { openJarvis, assistantName } = useShell();
  const [picked, setPicked] = useState<DayLoad | null>(null);
  return (
    <section aria-label="Your week ahead" className="rounded-3xl bg-surface p-4 shadow-soft">
      <h2 className="text-[15px] font-semibold">Your week</h2>
      <p className="mt-0.5 text-sm text-text-2">{week.summary}</p>

      <div className="mt-4 -mx-1 grid grid-cols-7" role="group" aria-label="How full each day is">
        {week.days.map((d) => {
          const on = picked?.date === d.date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setPicked(on ? null : d)}
              aria-pressed={on}
              className="flex min-h-11 flex-col items-center gap-1.5 px-[3px]"
            >
              <span className={cn("flex h-14 w-full items-end overflow-hidden rounded-xl bg-surface-2", on && "ring-2 ring-text/70")}>
                <span className={cn("w-full rounded-xl transition-[height] duration-500", FILL[d.level])} style={{ height: `${Math.max(6, d.percent)}%` }} />
              </span>
              <span className={cn("text-xs", d.short === "Today" ? "font-semibold text-text" : "text-muted")}>{d.short}</span>
              <span className="sr-only">
                {d.label === "Tomorrow" && " (tomorrow)"}: {WORD[d.level].toLowerCase()}, {roughly(d.hours)}
                {d.money.length ? ", bill due" : ""}
              </span>
              {d.money.length > 0 && <span className={cn("-mt-1 h-1 w-1 rounded-full", d.money.some((m) => m.short) ? "bg-warning" : "bg-muted")} />}
            </button>
          );
        })}
      </div>

      {picked ? (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4" aria-live="polite">
          <p className="text-[15px] font-medium">
            {picked.label} · {WORD[picked.level]}
            {picked.hours >= 0.5 && <span className="font-normal text-text-2"> · {roughly(picked.hours)}</span>}
          </p>
          {picked.reasons.length ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-text-2">
              {picked.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-2">Nothing scheduled. Room to rest or get ahead.</p>
          )}
          {picked.money.map((m) => (
            <p key={m.name} className={cn("mt-1 text-sm", m.short ? "text-warning" : "text-text-2")}>
              {m.name} {usd(m.amountCents)} due{m.short ? ", more than what's in checking" : ""}
            </p>
          ))}
          {(picked.level === "heavy" || picked.level === "overloaded") && (
            <button
              type="button"
              onClick={() =>
                openJarvis(
                  `${picked.label} looks ${picked.level === "overloaded" ? "like too much" : "full"}: ${picked.reasons.join(", ")}. Help me move what I can to a lighter day before it.`,
                )
              }
              className="mt-3 flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
            >
              <Sparkles className="h-4 w-4" /> Lighten this day with {assistantName}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Tap a day to see why.</p>
      )}
    </section>
  );
}
