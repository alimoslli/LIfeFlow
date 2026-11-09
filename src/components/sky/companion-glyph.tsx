import { COMPANIONS, nightOf, pixels, type Pose } from "@/components/day-clock/companion";
import { cn } from "@/lib/utils";

/**
 * The companion as a crisp little picture (SVG pixels, so it renders on the server and at any size): Sol by default,
 * the night form when `night`. Decorative; the label next to it names the assistant.
 */
export function CompanionGlyph({ className, night = false, pose = "stand" }: { className?: string; night?: boolean; pose?: Pose }) {
  const c = night ? nightOf(COMPANIONS[1]) : COMPANIONS[1];
  const px = [...pixels(c, pose, 0)];
  return (
    <svg viewBox="0 0 16 16" className={cn("shrink-0", className)} shapeRendering="crispEdges" aria-hidden="true">
      {px.map(([k, col]) => (
        <rect key={k} x={k % 16} y={Math.floor(k / 16)} width="1" height="1" fill={col} />
      ))}
    </svg>
  );
}
