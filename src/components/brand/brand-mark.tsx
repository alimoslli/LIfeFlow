import { useId } from "react";
import { cn } from "@/lib/utils";
import { MARK, MARK_COLORS } from "./morning-mark";

type BrandMarkProps = {
  className?: string;
  /** Leave blank when the nearby LifeFlow wordmark already names the image. */
  alt?: string;
  priority?: boolean;
};

/**
 * The one visual mark used throughout LifeFlow: the morning (owner, 2026-11-09). The sun rising on the morning
 * horizon, with its small face. Vector, so it's crisp at 16 px and clean at 512; the warm glow and the sky-blue
 * horizon read on light and dark pages alike. Geometry and colours live in morning-mark.ts, shared with the app icons
 * and the opening splash. Keeping it in one component stops the logo drifting between pages.
 */
export function BrandMark({ className, alt = "LifeFlow" }: BrandMarkProps) {
  // Ids are per instance so several marks on a page don't share gradients.
  const id = useId().replace(/:/g, "");
  const { horizon, cx, sunR, eyeDx, eyeDy, eyeR, line, glowR } = MARK;
  const lineTop = horizon - line.h / 2;
  return (
    <span
      className={cn("relative inline-flex aspect-square shrink-0", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={MARK_COLORS.sunTop} />
            <stop offset="0.55" stopColor={MARK_COLORS.sun} />
            <stop offset="1" stopColor={MARK_COLORS.sunLow} />
          </linearGradient>
          <radialGradient id={`${id}g`} cx={cx} cy={horizon} r={glowR} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={MARK_COLORS.glow} stopOpacity="0.95" />
            <stop offset="0.5" stopColor={MARK_COLORS.glowDeep} stopOpacity="0.45" />
            <stop offset="1" stopColor={MARK_COLORS.glowDeep} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}c`}>
            <rect x="0" y="0" width="100" height={lineTop} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}c)`}>
          <circle cx={cx} cy={horizon} r={glowR} fill={`url(#${id}g)`} />
          <circle cx={cx} cy={horizon} r={sunR} fill={`url(#${id}s)`} />
          <circle cx={cx - eyeDx} cy={horizon - eyeDy} r={eyeR} fill={MARK_COLORS.ink} />
          <circle cx={cx + eyeDx} cy={horizon - eyeDy} r={eyeR} fill={MARK_COLORS.ink} />
        </g>
        <rect x={line.x} y={lineTop} width={line.w} height={line.h} rx={line.h / 2} fill={MARK_COLORS.horizon} />
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
