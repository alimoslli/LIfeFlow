import Image from "next/image";
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
export function BrandMark({ className, alt = "LifeFlow", priority = false }: BrandMarkProps) {
  return (
    <span className={cn("relative inline-flex aspect-square shrink-0", className)}>
      <Image src="/brand/lifeflow-mark-transparent.png" alt={alt} fill priority={priority} sizes="(max-width: 768px) 72px, 96px" className="object-contain" />
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
