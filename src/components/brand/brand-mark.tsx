import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Leave blank when the nearby LifeFlow wordmark already names the image. */
  alt?: string;
  priority?: boolean;
};

/**
 * The one visual mark used throughout LifeFlow. Keeping this in one component
 * means the app shell, onboarding, and public pages never drift into separate
 * versions of the logo.
 */
export function BrandMark({ className, alt = "LifeFlow", priority = false }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex aspect-square shrink-0 overflow-hidden rounded-[30%] bg-[#fbf8f0] shadow-[0_7px_18px_-9px_rgb(41_68_57_/_0.42)] ring-1 ring-[#e5ddca]/80",
        className,
      )}
    >
      <Image src="/brand/lifeflow-logo.png" alt={alt} fill priority={priority} sizes="(max-width: 768px) 72px, 96px" className="object-cover" />
    </span>
  );
}

export function BrandLockup({ className, markClassName, priority = false }: { className?: string; markClassName?: string; priority?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-9 w-9", markClassName)} alt="" priority={priority} />
      <span className="font-display text-[22px] font-medium tracking-[-0.035em] text-text">LifeFlow</span>
    </span>
  );
}
