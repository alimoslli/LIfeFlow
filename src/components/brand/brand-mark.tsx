import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Leave blank when the nearby LifeFlow wordmark already names the image. */
  alt?: string;
  priority?: boolean;
};

/** The owner's logo (docs/design/logo/, 2026-11-10) in pixels: the half sun with its face and rays, on a glowing line. */
const PAL: Record<string, string> = { k: "#3b2414", y: "#ffc83d", Y: "#f7a823", c: "#fff0bf", w: "#ffffff", p: "#ff7f6e" };
const SUN = [
  ".......kkkk.......",
  ".....kkccyykk.....",
  "....kccyyyyyyk....",
  "...kcyyyyyyyyYk...",
  "..kyykwyyyykwyYk..",
  "..kyykkyyyykkyYk..",
  "..kyppyyyyyyppYk..",
  "..kyyyyyyyyyyyYk..",
];
const RAYS: [number, number, string][] = [
  [5, -3, "c"],
  [6, -2, "Y"],
  [8, -4, "c"],
  [9, -4, "c"],
  [8, -3, "Y"],
  [9, -3, "Y"],
  [12, -3, "c"],
  [11, -2, "Y"],
  [-1, 2, "c"],
  [0, 2, "Y"],
  [18, 2, "c"],
  [17, 2, "Y"],
];
/** One rect per run of a colour in a row, so the mark is a few dozen shapes. */
const CELLS = SUN.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  for (let x = 0; x < row.length;) {
    let n = 1;
    while (row[x + n] === row[x]) n++;
    if (row[x] !== ".") out.push({ x, y, w: n, fill: PAL[row[x]] });
    x += n;
  }
  return out;
});

/**
 * The one visual mark used throughout LifeFlow: the owner's pixel sun rising on its glowing line (2026-11-10; it
 * replaced the round "morning" sun). Crisp pixels at any size, readable on light and dark pages alike. The app icons are
 * made from the same logo picture (public/brand/*). Keeping it in one component stops the logo drifting between pages.
 */
export function BrandMark({ className, alt = "LifeFlow" }: BrandMarkProps) {
  return (
    <span
      className={cn("relative inline-flex aspect-square shrink-0", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <svg viewBox="-2 -8 22 22" className="h-full w-full overflow-visible">
        <g shapeRendering="crispEdges">
          {RAYS.map(([x, y, c]) => (
            <rect key={`r${x}:${y}`} x={x} y={y} width={1} height={1} fill={PAL[c]} />
          ))}
          {CELLS.map((r) => (
            <rect key={`${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
          ))}
        </g>
        {/* the glowing glass line it rises from */}
        <rect x={-1.5} y={7.6} width={21} height={2} rx={1} fill="#7cc4ff" opacity={0.45} />
        <rect x={-1} y={7.9} width={20} height={1.4} rx={0.7} fill="#3d8ef0" />
        <rect x={-0.5} y={7.95} width={19} height={0.5} rx={0.25} fill="#d6eeff" opacity={0.9} />
      </svg>
    </span>
  );
}

export function BrandLockup({
  className,
  markClassName,
  priority = false,
  light = false,
}: {
  className?: string;
  markClassName?: string;
  priority?: boolean;
  /** White words, for the night sky. */
  light?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-9 w-9", markClassName)} alt="" priority={priority} />
      <span className={cn("font-display text-[1.375rem] font-medium tracking-[-0.035em]", light ? "text-white" : "text-text")}>LifeFlow</span>
    </span>
  );
}
