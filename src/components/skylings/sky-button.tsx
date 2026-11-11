"use client";
import Link from "next/link";
import { isChatPage } from "@/lib/app-routes";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { forwardRef, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { prefersReducedMotion } from "@/components/motion/gsap";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import type { CompanionKey } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { cheerSkylings } from "./night";
import "./skylings.css";

type Variant = "sun" | "glass" | "ink";
type Common = {
  variant?: Variant;
  size?: "md" | "sm";
  /** The chip on the right: an arrow that a skyling replaces on hover. `false` for a plain button. */
  chip?: boolean;
  /** Who peeks into the chip. */
  skyling?: CompanionKey;
  /** On a light page (glass only). */
  day?: boolean;
  /** Hovering makes every skyling on the page cheer. */
  cheer?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

const SPARK = ["#fff3c4", "#ffd77a", "#8fb6ff", "#ffffff"];

/** Pixel sparks from where the button was pressed. */
function sparks(e: PointerEvent<HTMLElement>) {
  if (prefersReducedMotion()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("span");
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
    const d = 22 + Math.random() * 18;
    s.className = "lf-sb-spark";
    s.style.cssText = `--x:${x}px;--y:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${SPARK[i % SPARK.length]}`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }
}

function classes({ variant = "sun", size = "md", day, className }: Common) {
  return cn("lf-sb", `lf-sb-${variant}`, size === "sm" && "lf-sb-sm", day && "lf-sb-day", className);
}

function Inner({ chip = true, skyling = "ray", loading, variant = "sun", children }: Common) {
  const showChip = chip && variant !== "glass";
  return (
    <>
      <span className="min-w-0 truncate">{children}</span>
      {(showChip || loading) && (
        <span className="lf-sb-chip" aria-hidden>
          {loading ? (
            <PixelIcon name="sync" className="lf-sb-wait" />
          ) : (
            <>
              <PixelIcon name="arrow" className="lf-sb-arrow" />
              <CompanionGlyph companion={skyling} pose="celebrate" frame={2} className="lf-sb-peek" />
            </>
          )}
        </span>
      )}
    </>
  );
}

/** The new button (first-run pages): a real <button>. */
export const SkyButton = forwardRef<HTMLButtonElement, Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">>(function SkyButton(props, ref) {
  const { variant, size, chip, skyling, day, cheer, loading, className, children, disabled, onPointerDown, onPointerEnter, ...rest } = props;
  const look = { variant, size, chip, skyling, day, cheer, loading, className, children };
  return (
    <button
      ref={ref}
      className={classes(look)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onPointerDown={(e) => {
        sparks(e);
        onPointerDown?.(e);
      }}
      onPointerEnter={(e) => {
        if (cheer) cheerSkylings();
        onPointerEnter?.(e);
      }}
      {...rest}
    >
      <Inner {...look} />
    </button>
  );
});

/** The new button as a link. */
export function SkyLink({ href, ...look }: Common & { href: string }) {
  return (
    <Link
      href={href}
      prefetch={isChatPage(href) ? false : undefined}
      className={classes(look)}
      onPointerDown={sparks}
      onPointerEnter={look.cheer ? () => cheerSkylings() : undefined}
    >
      <Inner {...look} />
    </Link>
  );
}
