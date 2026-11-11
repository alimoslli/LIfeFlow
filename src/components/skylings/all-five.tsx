import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { COMPANION_KEYS, ownsNight } from "@/lib/companions";
import { cn } from "@/lib/utils";

/** Each one's place along the sky's arc, from first light up over the day and down into the night: [left, top] in px. */
const ARC = [
  [0, 18],
  [10, 6],
  [20, 0],
  [30, 6],
  [40, 18],
] as const;

/**
 * "Changes with the sky" as a picture (owner, 2026-11-11: "the option will show all of them cutely"): all five, small, in
 * the order they come up, along the sky's arc. Decorative; the choice's name says what it is.
 */
export function AllFive({ className }: { className?: string }) {
  return (
    <span className={cn("relative block h-12 w-16 shrink-0", className)} aria-hidden>
      {COMPANION_KEYS.map((k, i) => (
        <span key={k} className="absolute" style={{ left: ARC[i][0], top: ARC[i][1] + 6 }}>
          <CompanionGlyph companion={k} night={ownsNight(k)} className="h-6 w-6" />
        </span>
      ))}
    </span>
  );
}
