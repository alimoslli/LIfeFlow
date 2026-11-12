"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/pixel/pixel-icon";

const Explainer = dynamic(() => import("./sky-explainer-body"), { ssr: false });

/**
 * The one small entry on the waitlist (owner, 2026-11-12): "how your sky works", a read-only tour of the day wheel and its
 * timeline on a made-up day. It is a state of this page, never a route, so nobody waiting gains a way into the app. The
 * wheel's code loads only when it's opened.
 */
export function SkyExplainer({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const entry = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !open) entry.current?.focus();
    was.current = open;
  }, [open]);
  return (
    <>
      <section className="relative overflow-hidden rounded-[1.75rem] bg-white/[0.06] p-5 ring-1 ring-white/12 backdrop-blur-md sm:p-6" aria-labelledby="wl-sky">
        <p className="text-[0.75rem] font-semibold tracking-[0.14em] text-star-gold uppercase">While you wait</p>
        <h2 id="wl-sky" className="mt-2 font-display text-[1.75rem] leading-[1.05] font-medium tracking-[-0.03em]">
          See how your sky works
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
          A two-minute look at the wheel that shows your day, and the line it opens into. It uses a made-up day.
        </p>
        <button
          ref={entry}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="lf-sb lf-sb-sun lf-sb-sm mt-4 inline-flex min-h-11 items-center gap-2"
        >
          Show me
          <PixelIcon name="arrow" className="h-4 w-4" aria-hidden />
        </button>
      </section>
      {open && <Explainer name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
