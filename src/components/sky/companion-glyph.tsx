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
  const px = pixels(companionOf(companion), pose, frame, night);
  return (
    <svg viewBox={`1 2 ${GRID - 2} ${GRID - 2}`} className={cn("shrink-0", className)} shapeRendering="crispEdges" aria-hidden="true">
      {px.map(([x, y, col], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill={col} />
      ))}
    </svg>
  );
}
