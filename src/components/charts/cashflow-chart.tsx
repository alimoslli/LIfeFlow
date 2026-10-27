"use client";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CashflowPoint = { month: string; label: string; incomeCents: number; spendingCents: number };

/**
 * Grouped monthly bars: income vs. net spending. One y-axis, thin bars with
 * rounded data-ends, a 2px gap between bars, hover/focus tooltip, legend,
 * and a table view so no value depends on hovering or on color alone.
 */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.spendingCents]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const H = 180;
  const money = (c: number) => formatCents(c, { compact: c >= 100000 });

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-text-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-series-income" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-series-spend" /> Spending
        </span>
        <button onClick={() => setTable((t) => !t)} className="ml-auto text-xs font-medium text-accent hover:underline">
          {table ? "View chart" : "View as table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Income</th>
              <th className="py-1 text-right font-medium">Spending</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d) => (
              <tr key={d.month} className="border-t border-border">
                <td className="py-1.5">{d.label}</td>
                <td className="py-1.5 text-right">{formatCents(d.incomeCents)}</td>
                <td className="py-1.5 text-right">{formatCents(d.spendingCents)}</td>
                <td className={cn("py-1.5 text-right", d.incomeCents - d.spendingCents < 0 && "text-danger")}>{formatCents(d.incomeCents - d.spendingCents, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative flex gap-2">
          <div className="tabular relative w-12 shrink-0 text-right text-[10px] text-muted" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>
                {formatCents(t, { compact: true })}
              </span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-0" style={{ height: H }}>
              {ticks.map((t) => (
                <div key={t} className={cn("absolute inset-x-0 border-t", t === 0 ? "border-border-strong" : "border-border/60")} style={{ top: H - (t / top) * H }} />
              ))}
            </div>
            <div className="relative flex items-end justify-around gap-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
              {data.map((d, i) => (
                <button
                  key={d.month}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center gap-[2px] outline-none"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${d.label}: income ${formatCents(d.incomeCents)}, spending ${formatCents(d.spendingCents)}`}
                >
                  <span className={cn("absolute inset-0 rounded-md transition-colors", hover === i && "bg-surface-2")} />
                  <span className="relative w-[min(18px,30%)] rounded-t-[4px] bg-series-income" style={{ height: `${(Math.max(0, d.incomeCents) / top) * 100}%` }} />
                  <span className="relative w-[min(18px,30%)] rounded-t-[4px] bg-series-spend" style={{ height: `${(Math.max(0, d.spendingCents) / top) * 100}%` }} />
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-around gap-1">
              {data.map((d) => (
                <span key={d.month} className="flex-1 text-center text-[11px] text-muted">
                  {d.label}
                </span>
              ))}
            </div>
            {hover != null && (
              <div
                className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: 0, transform: `translateX(${hover > data.length / 2 ? "-105%" : "8%"})` }}
              >
                <p className="mb-1 font-medium text-text">{data[hover].label}</p>
                <Row swatch="bg-series-income" label="Income" value={money(data[hover].incomeCents)} />
                <Row swatch="bg-series-spend" label="Spending" value={money(data[hover].spendingCents)} />
                <p className="mt-1 border-t border-border pt-1 text-text-2">
                  Net <strong className="tabular font-semibold text-text">{formatCents(data[hover].incomeCents - data[hover].spendingCents, { signed: true })}</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-1.5 text-text-2">
      <span className={cn("h-2 w-2 rounded-sm", swatch)} />
      <strong className="tabular font-semibold text-text">{value}</strong> {label}
    </p>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
