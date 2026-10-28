"use client";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion } from "../motion/gsap";
import { Button, type ButtonProps } from "./button";

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

/**
 * Accessible modal built on the native <dialog> element (focus trapping,
 * Escape to close, inert background). `children` receives a close callback.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerProps,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  triggerProps?: ButtonProps;
}) {
  // The element is kept in state (not a ref) so `close` can be handed to children during render.
  const [d, setDialog] = useState<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Phones: a sheet that settles up from the bottom. Larger screens: a gentle scale-in.
      if (!prefersReducedMotion())
        gsap.fromTo(d, isPhone() ? { y: 56, opacity: 0 } : { y: 8, scale: 0.97, opacity: 0 }, {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: isPhone() ? 0.5 : 0.32,
          ease: MOTION.settle,
          clearProps: "transform,opacity",
        });
    }
    if (!open && d.open) d.close();
  }, [open, d]);
  const close = () => {
    if (!d?.open || prefersReducedMotion()) return setOpen(false);
    gsap.to(d, {
      ...(isPhone() ? { y: 48 } : { scale: 0.97 }),
      opacity: 0,
      duration: 0.18,
      ease: "power2.in",
      overwrite: true,
      onComplete: () => {
        setOpen(false);
        gsap.set(d, { clearProps: "transform,opacity" });
      },
    });
  };
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...triggerProps}>
        {trigger}
      </Button>
      <dialog
        ref={setDialog}
        onClose={(e) => e.target === e.currentTarget && setOpen(false)}
        onCancel={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault(); // Esc: animate out instead of vanishing
          close();
        }}
        onClick={(e) => e.target === d && close()}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-[28px] bg-bg p-0 text-text shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px] max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      >
        {open && (
          <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-medium">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={close} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {children(close)}
          </div>
        )}
      </dialog>
    </>
  );
}
