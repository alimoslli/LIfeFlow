/** Pixel hills for the sunrise, stepped like the skylings' world (the landing page and About). */
export function PixelHills({ className, fill }: { className?: string; /** a fill-* class */ fill: string }) {
  const steps = Array.from({ length: 61 }, (_, i) => {
    const x = i * 2;
    const y = Math.round(18 + 7 * Math.sin(i / 6.5) + 3 * Math.sin(i / 2.3 + 1));
    return `${x},${y} ${x + 2},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" shapeRendering="crispEdges" className={className} aria-hidden>
      <polygon points={`0,40 ${steps} 122,40`} className={fill} />
    </svg>
  );
}
