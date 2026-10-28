"use client";
import { useState } from "react";
import { CalendarDays, Check, ChevronRight, Clock, Flag } from "lucide-react";
import { addDaysStr, dayOfWeek, formatDateStr } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";

/** A full-width row that shows the current value and opens a picker sheet. */
function PickerRow({ icon, label, value, onOpen, id }: { icon: React.ReactNode; label: string; value: string; onOpen: () => void; id?: string }) {
  return (
    <button
      type="button"
      id={id}
      onClick={onOpen}
      className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left text-[16px] transition-colors hover:bg-surface-2"
    >
      <span className="text-accent">{icon}</span>
      <span className="flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block">{value}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted" />
    </button>
  );
}

function Option({ selected, onClick, children, hint }: { selected: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onClick();
      }}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[16px]",
        selected ? "bg-accent-soft text-accent" : "hover:bg-surface-2",
      )}
      aria-pressed={selected}
    >
      <span className="flex-1">{children}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
      {selected && <Check className="h-4 w-4" />}
    </button>
  );
}

/** Date picker sheet with quick choices (Today, Tomorrow, Weekend, Next week) and a calendar. */
export function DateField({
  name,
  label = "Date",
  defaultValue = "",
  today,
  required,
  allowNone = true,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  today: string;
  required?: boolean;
  allowNone?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const sat = addDaysStr(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const mon = addDaysStr(today, (8 - dayOfWeek(today)) % 7 || 7);
  const quick = [
    { label: "Today", v: today },
    { label: "Tomorrow", v: addDaysStr(today, 1) },
    { label: "This weekend", v: sat },
    { label: "Next week", v: mon },
  ];
  const pretty = value
    ? value === today
      ? "Today"
      : value === addDaysStr(today, 1)
        ? "Tomorrow"
        : formatDateStr(value, "EEE, MMM d, yyyy")
    : allowNone
      ? "No date"
      : "Choose a date";
  const pick = (v: string) => {
    setValue(v);
    setOpen(false);
  };
  return (
    <>
      <input type="hidden" name={name} value={value} required={required} />
      <PickerRow icon={<CalendarDays className="h-5 w-5" />} label={label} value={pretty} onOpen={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-col gap-1">
          {quick.map((q) => (
            <Option key={q.label} selected={value === q.v} onClick={() => pick(q.v)} hint={formatDateStr(q.v, "EEE, MMM d")}>
              {q.label}
            </Option>
          ))}
          {allowNone && (
            <Option selected={!value} onClick={() => pick("")}>
              No date
            </Option>
          )}
          <label className="mt-2 flex flex-col gap-1 px-1 text-sm text-text-2">
            Or pick a date
            <input
              type="date"
              value={value}
              onChange={(e) => e.target.value && pick(e.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[16px] text-text"
            />
          </label>
        </div>
      </Sheet>
    </>
  );
}

const TIMES = ["08:00", "09:00", "10:00", "12:00", "13:00", "15:00", "17:00", "18:00", "20:00", "21:00"];
const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Time picker sheet: common times as big buttons, plus an exact time. */
export function TimeField({
  name,
  label = "Time",
  defaultValue = "",
  required,
  allowNone = true,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  allowNone?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const pick = (v: string) => {
    setValue(v);
    setOpen(false);
  };
  return (
    <>
      <input type="hidden" name={name} value={value} required={required} />
      <PickerRow
        icon={<Clock className="h-5 w-5" />}
        label={label}
        value={value ? t12(value) : allowNone ? "No time" : "Choose a time"}
        onOpen={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="grid grid-cols-2 gap-2">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                haptic("light");
                pick(t);
              }}
              className={cn("min-h-12 rounded-2xl border text-[16px]", value === t ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface")}
              aria-pressed={value === t}
            >
              {t12(t)}
            </button>
          ))}
        </div>
        {allowNone && (
          <div className="mt-2">
            <Option selected={!value} onClick={() => pick("")}>
              No time
            </Option>
          </div>
        )}
        <label className="mt-2 flex flex-col gap-1 px-1 text-sm text-text-2">
          Exact time
          <input
            type="time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[16px] text-text"
          />
        </label>
        <button type="button" onClick={() => setOpen(false)} className="mt-3 min-h-12 w-full rounded-full bg-accent text-[15px] font-medium text-accent-text">
          Done
        </button>
      </Sheet>
    </>
  );
}

const PRIORITIES = [
  { v: "low", label: "Low", dot: "bg-muted" },
  { v: "medium", label: "Medium", dot: "bg-info" },
  { v: "high", label: "High", dot: "bg-warning" },
  { v: "urgent", label: "Urgent", dot: "bg-danger" },
] as const;

/** Priority as a full-width segmented control (no tiny select that cuts off "Medium"). */
export function PriorityField({ name, defaultValue = "medium" }: { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Flag className="h-3.5 w-3.5" /> Priority
      </legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-surface-2 p-1">
        {PRIORITIES.map((p) => (
          <button
            key={p.v}
            type="button"
            onClick={() => {
              haptic("light");
              setValue(p.v);
            }}
            aria-pressed={value === p.v}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm",
              value === p.v ? "bg-surface font-medium shadow-soft" : "text-text-2",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", p.dot)} />
            {p.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
