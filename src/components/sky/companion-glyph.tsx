import { GRID, pixels, type Pose } from "@/components/day-clock/companion";
import { companionOf } from "@/lib/companions";
import { cn } from "@/lib/utils";

/**
 * The skyling as a crisp little picture (SVG pixels, so it renders on the server and at any size): the person's pick,
 * or the default until they choose, in its night form when `night`. Decorative; the label next to it names the skyling.
 */
export function CompanionGlyph({
  className,
  companion,
  night = false,
  pose = "idle",
  frame = 0,
}: {
  className?: string;
  companion?: string | null;
  night?: boolean;
  pose?: Pose;
  frame?: number;
}) {
  // one path per colour (a rect per pixel was most of a page's markup); where two pixels share a spot the later one
  // wins, as it did when it was painted over the other
  const top = new Map<string, [number, number, string]>();
  for (const [x, y, col] of pixels(companionOf(companion), pose, frame, night)) top.set(`${x},${y}`, [x, y, col]);
  const byColour = new Map<string, string>();
  for (const [x, y, col] of top.values()) byColour.set(col, (byColour.get(col) ?? "") + `M${x} ${y}h1v1h-1z`);
  return (
    <svg viewBox={`1 2 ${GRID - 2} ${GRID - 2}`} className={cn("shrink-0", className)} shapeRendering="crispEdges" aria-hidden="true">
      {[...byColour].map(([col, d]) => (
        <path key={col} d={d} fill={col} />
      ))}
    </svg>
  );
}
