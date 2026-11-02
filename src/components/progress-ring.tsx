import { cn } from "@/lib/utils";

/** A small ring with the percentage inside. The track is soft accent, the arc is the accent. */
export function ProgressRing({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("relative inline-flex h-14 w-14 shrink-0 items-center justify-center", className)} role="img" aria-label={`${pct}% done`}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--accent-soft)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="tabular text-[0.8125rem] font-semibold">{pct}%</span>
    </span>
  );
}
