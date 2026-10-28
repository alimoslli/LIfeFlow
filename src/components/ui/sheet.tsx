"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion } from "../motion/gsap";

/**
 * A native-feeling bottom sheet on phones (drag the handle down to close)
 * and a centered dialog on larger screens. Built on <dialog> for focus
 * trapping, Escape and an inert background.
 */
export function Sheet({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title?: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      if (!prefersReducedMotion())
        gsap.fromTo(d, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: MOTION.settle, clearProps: "transform,opacity" });
    }
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    const d = ref.current;
    if (!d?.open || prefersReducedMotion()) return onClose();
    gsap.to(d, {
      y: 60,
      opacity: 0,
      duration: 0.18,
      ease: "power2.in",
      overwrite: true,
      onComplete: () => (gsap.set(d, { clearProps: "transform,opacity" }), onClose()),
    });
  };

  return (
    <dialog
      ref={ref}
      aria-label={label ?? title}
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
      className="m-auto w-[min(520px,calc(100vw-2rem))] overflow-visible rounded-[28px] bg-bg p-0 text-text shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-[2px] max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div
            className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden"
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, dy: 0 };
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current || !ref.current) return;
              drag.current.dy = Math.max(0, e.clientY - drag.current.y);
              ref.current.style.transform = `translateY(${drag.current.dy}px)`;
            }}
            onPointerUp={() => {
              const d = ref.current;
              const dy = drag.current?.dy ?? 0;
              drag.current = null;
              if (!d) return;
              if (dy > 90) close();
              else gsap.to(d, { y: 0, duration: 0.25, ease: MOTION.ease, clearProps: "transform" });
            }}
            aria-hidden
          >
            <span className="h-1.5 w-10 rounded-full bg-surface-3" />
          </div>
          {title && (
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-1 sm:pt-5">
              <h2 className="font-display text-xl font-medium">{title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="tap -mr-2 flex items-center justify-center rounded-full text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="overflow-y-auto px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom)+var(--kb))]">{children}</div>
        </div>
      )}
    </dialog>
  );
}
