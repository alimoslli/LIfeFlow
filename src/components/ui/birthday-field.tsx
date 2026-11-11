"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Select } from "./field";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Days in a month; before the year is picked, a leap year so the 29th of February stays possible. */
const daysIn = (year: number, month: number) => new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();

/**
 * A birthday as three quick picks, month, day and year (owner, 2026-11-11: the calendar "is so old and annoying"; it
 * opened on today and made people page back years). Every year is listed, newest first, so the list never hints at an
 * age rule. Gives "YYYY-MM-DD" once all three are picked, "" before that; with `name` it also posts that in a form.
 */
export function BirthdayField({
  value = "",
  onChange,
  name,
  id,
  invalid,
  className,
}: {
  value?: string;
  onChange?: (date: string) => void;
  name?: string;
  id?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [y0 = "", m0 = "", d0 = ""] = value.split("-");
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : "");
  const [day, setDay] = useState(d0 ? String(Number(d0)) : "");
  const thisYear = new Date().getFullYear();
  const days = daysIn(Number(year), Number(month) || 1);
  const full = year && month && day ? `${year}-${pad(Number(month))}-${pad(Math.min(Number(day), days))}` : "";

  const set = (next: { year?: string; month?: string; day?: string }) => {
    const y = next.year ?? year;
    const m = next.month ?? month;
    let d = next.day ?? day;
    // the 31st becomes the 30th in a shorter month, never an impossible date
    if (d && m) d = String(Math.min(Number(d), daysIn(Number(y), Number(m))));
    setYear(y);
    setMonth(m);
    setDay(d);
    onChange?.(y && m && d ? `${y}-${pad(Number(m))}-${pad(Number(d))}` : "");
  };

  const pick = cn("min-h-11", invalid && "border-danger");
  return (
    <div role="group" aria-label="Your birthday" className={cn("grid grid-cols-[1.5fr_1fr_1.2fr] gap-2", className)}>
      <Select id={id} aria-label="Birthday month" value={month} onChange={(e) => set({ month: e.target.value })} autoComplete="bday-month" className={pick}>
        <option value="" disabled>
          Month
        </option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </Select>
      <Select aria-label="Birthday day" value={day} onChange={(e) => set({ day: e.target.value })} autoComplete="bday-day" className={pick}>
        <option value="" disabled>
          Day
        </option>
        {Array.from({ length: days }, (_, i) => (
          <option key={i} value={String(i + 1)}>
            {i + 1}
          </option>
        ))}
      </Select>
      <Select aria-label="Birthday year" value={year} onChange={(e) => set({ year: e.target.value })} autoComplete="bday-year" className={pick}>
        <option value="" disabled>
          Year
        </option>
        {Array.from({ length: 121 }, (_, i) => String(thisYear - i)).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      {name && <input type="hidden" name={name} value={full} />}
    </div>
  );
}
