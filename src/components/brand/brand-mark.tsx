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
  // v3 (owner, 2026-11-09): Morrow's mark. A circle cut by the horizon (your timeline): the sun above with a face (your
  // companion, by day), the moon and two stars below (the night, and what you finished). Vector, so it's sharp anywhere.
  return (
    <span
      className={cn("relative inline-flex aspect-square shrink-0", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <clipPath id="bm-sky">
            <rect x="0" y="0" width="100" height="52" />
          </clipPath>
        </defs>
        <circle cx="50" cy="52" r="40" fill="none" stroke="#5b4bd6" strokeWidth="5" opacity="0.35" />
        <circle cx="50" cy="58" r="26" fill="#f4a44a" clipPath="url(#bm-sky)" />
        <circle cx="42" cy="44" r="3" fill="#1b1736" />
        <circle cx="58" cy="44" r="3" fill="#1b1736" />
        <rect x="4" y="50" width="92" height="5" rx="2.5" fill="#5b4bd6" />
        <path d="M64 66 a9 9 0 1 0 6 15 a7 7 0 1 1 -6 -15 z" fill="#b3a8ff" />
        <path d="M34 69.4 L34.8 71.2 L36.6 72 L34.8 72.8 L34 74.6 L33.2 72.8 L31.4 72 L33.2 71.2 Z" fill="#b3a8ff" />
        <path d="M44 78.2 L44.5 79.5 L45.8 80 L44.5 80.5 L44 81.8 L43.5 80.5 L42.2 80 L43.5 79.5 Z" fill="#b3a8ff" />
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
