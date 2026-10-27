"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "./button";

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
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...triggerProps}>
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-[28px] bg-bg p-0 text-text shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px] max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      >
        {open && (
          <div className="animate-rise p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
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
