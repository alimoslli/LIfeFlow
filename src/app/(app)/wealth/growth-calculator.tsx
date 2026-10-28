"use client";
import { useState } from "react";
import { projectInvesting } from "@/lib/invest-math";
import { formatCents } from "@/lib/money";

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

/** "What if I invest $X a month for N years?" A range of assumed returns, never a promise. */
export function GrowthCalculator({ startCents }: { startCents: number }) {
  const [monthly, setMonthly] = useState(100);
  const [years, setYears] = useState(30);
  const [includeStart, setIncludeStart] = useState(false);
  const p = projectInvesting({ startCents: includeStart ? startCents : 0, monthlyCents: Math.round(monthly * 100), years });
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Each month ($)
          <input
            type="number"
            min={0}
            max={100000}
            value={monthly}
            onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-[15px] text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          For {years} years
          <input type="range" min={1} max={50} value={years} onChange={(e) => setYears(Number(e.target.value))} className="mt-3 accent-[var(--accent)]" />
        </label>
      </div>
      {startCents > 0 && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-text-2">
          <input type="checkbox" checked={includeStart} onChange={(e) => setIncludeStart(e.target.checked)} className="accent-[var(--accent)]" /> Start from my
          current {whole(startCents)}
        </label>
      )}
      <ul className="mt-4 grid grid-cols-3 gap-2" aria-live="polite">
        {p.scenarios.map((s) => (
          <li key={s.ratePercent} className="rounded-2xl bg-surface-2/70 p-3 text-center">
            <p className="text-xs text-muted">{s.ratePercent}% a year</p>
            <p className="tabular mt-1 font-medium">{whole(s.valueCents)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-2">You&apos;d put in {whole(p.contributedCents)}. The rest would be growth.</p>
      <p className="mt-1 text-xs text-muted">{p.assumptions}</p>
    </div>
  );
}
