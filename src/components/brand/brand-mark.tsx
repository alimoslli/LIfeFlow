import { useId } from "react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Leave blank when the nearby LifeFlow wordmark already names the image. */
  alt?: string;
  priority?: boolean;
};

/**
 * The one visual mark used throughout LifeFlow: the transparent 3D icon, with no
 * background tile. Keeping it in one component stops the logo drifting between pages.
 */
export function BrandMark({ className, alt = "LifeFlow" }: BrandMarkProps) {
  // v3 Day Sky (owner, 2026-11-09): one circle cut by the horizon (your timeline). Above it the day: a clear sky and the
  // sun rising with a face (your companion). Below it the night: a moon and two stars (what you finished). Vector, so
  // it's sharp anywhere. Ids are per instance so several marks on a page don't share gradients.
  const id = useId().replace(/:/g, "");
  return (
    <span
      className={cn("relative inline-flex aspect-square shrink-0", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a76d0" />
            <stop offset="0.7" stopColor="#8cc0f0" />
            <stop offset="1" stopColor="#ffd4a0" />
          </linearGradient>
          <linearGradient id={`${id}n`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#13284d" />
            <stop offset="1" stopColor="#071226" />
          </linearGradient>
          <clipPath id={`${id}c`}>
            <circle cx="50" cy="50" r="46" />
          </clipPath>
          <clipPath id={`${id}t`}>
            <rect x="0" y="0" width="100" height="52" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}c)`}>
          <rect x="0" y="0" width="100" height="52" fill={`url(#${id}d)`} />
          <rect x="0" y="52" width="100" height="48" fill={`url(#${id}n)`} />
          <circle cx="50" cy="54" r="19" fill="#f5a524" clipPath={`url(#${id}t)`} />
          <circle cx="43.5" cy="44" r="2.6" fill="#0f1a2a" />
          <circle cx="56.5" cy="44" r="2.6" fill="#0f1a2a" />
          <rect x="0" y="50.5" width="100" height="3" fill="#ffffff" />
          <path d="M66 63 a8 8 0 1 0 5.5 13.6 a6.2 6.2 0 1 1 -5.5 -13.6 z" fill="#e6edf8" />
          <path d="M33 66.4 L33.8 68.2 L35.6 69 L33.8 69.8 L33 71.6 L32.2 69.8 L30.4 69 L32.2 68.2 Z" fill="#ffd77a" />
          <path d="M43 77.2 L43.5 78.5 L44.8 79 L43.5 79.5 L43 80.8 L42.5 79.5 L41.2 79 L42.5 78.5 Z" fill="#ffd77a" />
        </g>
      </svg>
    </span>
  );
}

export function BrandLockup({ className, markClassName, priority = false }: { className?: string; markClassName?: string; priority?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-9 w-9", markClassName)} alt="" priority={priority} />
      <span className="font-display text-[1.375rem] font-medium tracking-[-0.035em] text-text">LifeFlow</span>
    </span>
  );
}
