"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { SubmitButton } from "@/components/ui/button";
import type { ActionState } from "@/server/actions";

const MANUAL = [
  ["sleep_hours", "Sleep (hours)"],
  ["steps", "Steps"],
  ["exercise_minutes", "Exercise (minutes)"],
  ["mindful_minutes", "Mindful minutes"],
  ["weight_kg", "Weight (kg)"],
] as const;

/** The date, the title, an Apple Health chip, and a "+" that opens the by-hand log one tap deeper. */
export function HealthHeader({
  date,
  apple,
  action,
  today,
}: {
  date: string;
  apple: boolean;
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-text-2">{date}</p>
          <h1 className="font-display text-[2.75rem] leading-none font-medium tracking-tight">Health</h1>
        </div>
        <div className="flex items-center gap-2">
          {apple && (
            <span className="flex h-8 items-center gap-1.5 rounded-full bg-accent/10 px-3 text-sm font-medium text-accent">
              <PixelIcon name="check" className="h-4 w-4" /> Apple Health
            </span>
          )}
          <button
            type="button"
            aria-label="Log something"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-soft"
          >
            <PixelIcon name={open ? "close" : "plus"} className="h-4 w-4" />
          </button>
        </div>
      </header>
      {open && (
        <ActionForm action={action} showSuccess className="rounded-3xl bg-surface p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-text-2">
              What
              <select name="metric" className="h-11 rounded-xl bg-surface-2 px-3 text-[0.9375rem] text-text">
                {MANUAL.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Amount
              <input name="value" inputMode="decimal" required className="h-11 rounded-xl bg-surface-2 px-3 text-[0.9375rem] text-text" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Day
              <input name="date" type="date" defaultValue={today} max={today} className="h-11 rounded-xl bg-surface-2 px-3 text-[0.9375rem] text-text" />
            </label>
          </div>
          <SubmitButton className="self-end">Save</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
