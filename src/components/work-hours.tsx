"use client";
import { cn } from "@/lib/utils";
import type { WorkSchedule } from "@/server/db/schema";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const FULL_TIME: WorkSchedule = { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" };

/** "My shifts change" or "Same hours every week" (days + start and end). `null` means shifts change. */
export function WorkHours({ value, onChange, name }: { value: WorkSchedule | null; onChange: (v: WorkSchedule | null) => void; name?: string }) {
  const set = (patch: Partial<WorkSchedule>) => onChange({ ...(value ?? FULL_TIME), ...patch });
  return (
    <div className="flex flex-col gap-3">
      {name && <input type="hidden" name={name} value={value ? JSON.stringify(value) : ""} />}
      <div role="radiogroup" aria-label="Your hours" className="grid grid-cols-2 gap-2">
        {(
          [
            [false, "My shifts change", "Add them as you get them"],
            [true, "Same hours every week", "Like 8 to 5, Monday to Friday"],
          ] as const
        ).map(([fixed, label, hint]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={!!value === fixed}
            onClick={() => onChange(fixed ? (value ?? FULL_TIME) : null)}
            className={cn(
              "flex min-h-11 flex-col rounded-2xl px-3 py-2.5 text-left transition-all",
              !!value === fixed ? "bg-hero text-hero-text shadow-lift" : "bg-surface shadow-soft",
            )}
          >
            <span className="text-[15px] font-medium">{label}</span>
            <span className={cn("text-xs", !!value === fixed ? "opacity-80" : "text-muted")}>{hint}</span>
          </button>
        ))}
      </div>
      {value && (
        <>
          <div className="flex justify-between gap-1" role="group" aria-label="Work days">
            {DAYS.map((d, i) => {
              const on = value.days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => {
                    const days = on ? value.days.filter((x) => x !== i) : [...value.days, i].sort();
                    if (days.length) set({ days });
                  }}
                  className={cn("h-11 w-11 rounded-full text-sm font-medium", on ? "bg-accent text-accent-text" : "bg-surface-2 text-text-2")}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-text-2">
              Starts
              <input
                type="time"
                value={value.start}
                onChange={(e) => e.target.value && set({ start: e.target.value })}
                className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-2">
              Ends
              <input
                type="time"
                value={value.end}
                onChange={(e) => e.target.value && set({ end: e.target.value })}
                className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text"
              />
            </label>
          </div>
          <p className="text-xs text-muted">Your shifts fill in 3 weeks ahead. Delete a day off and it stays off.</p>
        </>
      )}
    </div>
  );
}
