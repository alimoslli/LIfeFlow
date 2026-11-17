import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Leave blank when the nearby LifeFlow wordmark already names the image. */
  alt?: string;
  priority?: boolean;
};

/**
 * The one visual mark used throughout LifeFlow: the owner's logo picture itself (the pixel sun rising out of the
 * water, public/brand/*), the same file as the app icon. It used to be redrawn in code, and the copy drifted from the
 * real logo (owner, 2026-11-17: "why is the logo on the top left the old one"). Keeping it in one component stops the
 * logo drifting between pages.
 */
export function BrandMark({ className, alt = "LifeFlow", priority = false }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed 192 px file shown small; next/image adds nothing here
    <img
      src="/brand/lifeflow-mark-192.png"
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={192}
      height={192}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn("inline-block aspect-square shrink-0 select-none", className)}
      draggable={false}
    />
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
