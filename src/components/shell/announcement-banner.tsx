"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PixelIcon } from "@/components/pixel/pixel-icon";

const KEY = "lf-announcement-closed";

/** The owner's announcement (admin page). Closable; the choice is remembered on this device for this announcement. */
export function AnnouncementBanner({ a }: { a: { id: string; message: string; tone: "info" | "warning"; linkUrl: string | null } }) {
  const path = usePathname();
  // Hidden until we know whether it was closed here, so a closed banner never flashes.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      let closed = "";
      try {
        closed = localStorage.getItem(KEY) ?? "";
      } catch {}
      setShow(closed !== a.id);
    }, 0);
    return () => clearTimeout(t);
  }, [a.id]);
  // The full-screen chat has its own fixed layout.
  if (!show || path.startsWith("/jarvis")) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, a.id);
    } catch {}
    setShow(false);
  };
  const warn = a.tone === "warning";
  return (
    <div role="status" className={cn("mb-4 flex items-start gap-3 rounded-3xl px-4 py-3 shadow-soft", warn ? "bg-warning-soft" : "bg-accent-soft")}>
      {warn ? (
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      ) : (
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
        <p className="break-words">{a.message}</p>
        {a.linkUrl && (
          <Link
            href={a.linkUrl}
            {...(a.linkUrl.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent"
          >
            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close announcement"
        className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-2"
      >
        <PixelIcon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}
