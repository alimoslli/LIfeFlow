import { formatCents } from "@/lib/money";

/** Ranked horizontal bars for one measure; identity is carried by the text label, not color. */
export function BarList({ items, total }: { items: { name: string; cents: number; href?: string }[]; total?: number }) {
  const max = Math.max(1, ...items.map((i) => i.cents));
  const sum = total ?? items.reduce((s, i) => s + Math.max(0, i.cents), 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.name} title={`${i.name}: ${formatCents(i.cents)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-text">{i.name}</span>
            <span className="tabular shrink-0 text-text-2">
              {formatCents(i.cents)} <span className="text-xs text-muted">· {sum ? Math.round((Math.max(0, i.cents) / sum) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(Math.max(0, i.cents) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
