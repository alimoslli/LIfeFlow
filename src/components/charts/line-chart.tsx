import { formatCents } from "@/lib/money";
import { formatDateStr } from "@/lib/dates";

type Series = { name: string; points: { date: string; cents: number }[]; dashed?: boolean; className: string };

/**
 * A simple, accessible line chart (server-rendered SVG). A zero line is drawn
 * when values cross zero, and every value is also available as a table, so
 * nothing depends on color or hovering.
 */
export function LineChart({ series, height = 150, label }: { series: Series[]; height?: number; label: string }) {
  const all = series.flatMap((s) => s.points.map((p) => p.cents));
  if (!all.length) return null;
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - (min < 0 ? pad : 0);
  const hi = max + pad;
  const W = 600;
  const n = Math.max(...series.map((s) => s.points.length));
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (c: number) => height - ((c - lo) / (hi - lo)) * height;
  const path = (pts: Series["points"]) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const first = series[0].points[0]?.date;
  const last = series[0].points.at(-1)?.date;
  const money = (c: number) => formatCents(c, { compact: Math.abs(c) >= 100000 });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-[150px] w-full overflow-visible" role="img" aria-label={label}>
        {min < 0 && (
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-danger/50" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={path(s.points)}
            fill="none"
            className={s.className}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.dashed ? "6 5" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" className={s.className} strokeWidth="2.5" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.name}
          </span>
        ))}
        {first && last && (
          <span className="ml-auto text-muted">
            {formatDateStr(first, "MMM d")} to {formatDateStr(last, "MMM d")}
          </span>
        )}
      </figcaption>
      <details className="mt-1 text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center text-accent">View as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {series[0].points.map((p, i) => (
                <tr key={p.date} className="border-t border-border/60">
                  <td className="py-1">{formatDateStr(p.date, "EEE, MMM d")}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 text-right">
                      {s.points[i] ? money(s.points[i].cents) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
