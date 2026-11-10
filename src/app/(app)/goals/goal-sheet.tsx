"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** A tile that opens its full card in a sheet (edit, delete, log progress: one tap deeper). */
export function GoalSheet({ title, trigger, className, children }: { title: string; trigger: ReactNode; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("min-w-0 text-left", className)}>
        {trigger}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {children}
      </Sheet>
    </>
  );
}

/** The sun "+ Goal" / "+ Milestone" button in the header; its form opens in a sheet. */
export function AddSheet({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // a saved form inside closes the sheet (every successful action announces itself with "lf:saved")
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("lf:saved", close);
    return () => window.removeEventListener("lf:saved", close);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lf-sb lf-sb-sun shrink-0">
        <PixelIcon name="plus" className="h-4 w-4" /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col gap-4">{children}</div>
      </Sheet>
    </>
  );
}
