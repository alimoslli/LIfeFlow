"use client";
import { useState } from "react";
import { goalTradeoff } from "@/lib/goal-math";
import { formatCents } from "@/lib/money";

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

/** "Put in $X more a month and you're there N months sooner." Uses the same math as the server. */
export function GoalTradeoff({ targetCents, savedCents, monthlyCents }: { targetCents: number; savedCents: number; monthlyCents: number }) {
  const [extra, setExtra] = useState(5000);
  const t = goalTradeoff({ targetCents, savedCents }, monthlyCents, extra);
  return (
    <div className="rounded-2xl bg-surface-2/70 p-3">
      <label className="flex items-center justify-between gap-3 text-xs text-text-2">
        <span>What if I added</span>
        <span className="tabular font-medium text-text">{whole(extra)}/month</span>
      </label>
      <input
        type="range"
        min={1000}
        max={50000}
        step={1000}
        value={extra}
        onChange={(e) => setExtra(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
        aria-label="Extra per month"
      />
      <p className="mt-1 text-sm" aria-live="polite">
        {t.monthsAfter == null
          ? "Add a monthly amount to see when you'd finish."
          : t.monthsBefore == null
            ? `You'd finish in about ${t.monthsAfter} month${t.monthsAfter === 1 ? "" : "s"}.`
            : t.monthsSooner
              ? `${t.monthsSooner} month${t.monthsSooner === 1 ? "" : "s"} sooner: about ${t.monthsAfter} instead of ${t.monthsBefore}.`
              : "About the same finish month."}
      </p>
    </div>
  );
}
