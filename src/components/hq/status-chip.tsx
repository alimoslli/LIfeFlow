import { STATE_LABEL, type ChipState } from "@/server/hq/state";

/** A small rounded status chip. Text is real HTML so it follows text size and screen readers. */
export function StateChip({ state, className = "" }: { state: ChipState; className?: string }) {
  return (
    <span className={`hq-chip ${className}`} data-state={state}>
      <span className="hq-chip-dot" aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}
