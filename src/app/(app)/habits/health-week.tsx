"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";

type Metric = {
  metric: string;
  label: string;
  unit: string;
  average: number;
  latest: { day: string; value: number };
  series: { day: string; value: number }[];
};

const ORDER = ["sleep_hours", "steps", "exercise_minutes", "resting_heart_rate", "mindful_minutes", "weight_kg", "distance_km", "active_energy_kcal"];
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** The last 7 days of what Apple Health (or the user) recorded: average and a small bar per day. */
export function HealthWeek({ metrics, today }: { metrics: Metric[]; today: string }) {
  if (!metrics.length)
    return (
      <section aria-label="This week" className="rounded-3xl bg-surface p-5 shadow-soft">
        <p className="text-[15px] font-medium">No health data yet</p>
        <p className="mt-1 text-sm text-text-2">
          Connect Apple Health and your sleep, steps and workouts fill in by themselves. Or log something below, or tell Jarvis &ldquo;I slept 7 hours.&rdquo;
        </p>
        <Link href="/settings/integrations" className="mt-3 flex min-h-11 items-center text-sm font-medium text-accent">
          Connect Apple Health
        </Link>
      </section>
    );
  const shown = [...metrics].sort((a, b) => ORDER.indexOf(a.metric) - ORDER.indexOf(b.metric)).slice(0, 6);
  return (
    <section aria-label="This week" className="grid grid-cols-2 gap-3">
      {shown.map((m) => {
        const max = Math.max(...m.series.map((x) => x.value), 1);
        return (
          <div key={m.metric} className="rounded-3xl bg-surface p-4 shadow-soft">
            <p className="text-xs text-muted">{m.label}, 7-day average</p>
            <p className="tabular mt-1 text-xl font-medium">
              {fmt(m.average)} <span className="text-sm font-normal text-text-2">{m.unit}</span>
            </p>
            <div className="mt-3 flex h-8 items-end gap-1" aria-hidden>
              {m.series.slice(-7).map((x) => (
                <span
                  key={x.day}
                  className={cn("flex-1 rounded-full", x.day === today ? "bg-accent" : "bg-accent/35")}
                  style={{ height: `${Math.max(8, (x.value / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

const MANUAL = [
  ["sleep_hours", "Sleep (hours)"],
  ["steps", "Steps"],
  ["exercise_minutes", "Exercise (minutes)"],
  ["mindful_minutes", "Mindful minutes"],
  ["weight_kg", "Weight (kg)"],
] as const;

/** Log a day by hand: one measurement at a time, replacing that day's value. */
export function LogHealth({ action, today }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="-mt-2 flex min-h-11 items-center self-start text-sm font-medium text-accent">
        Log something
      </button>
    );
  return (
    <ActionForm action={action} showSuccess className="rounded-3xl bg-surface p-4 shadow-soft">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-2">
          What
          <select name="metric" className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text">
            {MANUAL.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Amount
          <input name="value" inputMode="decimal" required className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Day
          <input name="date" type="date" defaultValue={today} max={today} className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text" />
        </label>
      </div>
      <SubmitButton className="self-end">Save</SubmitButton>
    </ActionForm>
  );
}
