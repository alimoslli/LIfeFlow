"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/pixel/pixel-icon";

const Explainer = dynamic(() => import("./sky-explainer-body"), { ssr: false });

/**
 * The one small entry on the waitlist (owner, 2026-11-12): "how your sky works", a read-only tour of the day wheel and its
 * timeline on a made-up day. It is a state of this page, never a route, so nobody waiting gains a way into the app. The
 * wheel's code loads only when it's opened.
 */
export function SkyExplainer({ name, tz, companion }: { name: string; tz: string; companion?: string | null }) {
  const [open, setOpen] = useState(false);
  const entry = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !open) entry.current?.focus();
    was.current = open;
  }, [open]);
  return (
    <>
      <section className="relative overflow-hidden rounded-[1.75rem] bg-white/[0.06] ring-1 ring-white/12 backdrop-blur-md" aria-labelledby="wl-sky">
        {/* the picture is the way in too (owner, 2026-11-17: "where is the demo"): a still of the real wheel on the example day */}
        <button type="button" onClick={() => setOpen(true)} tabIndex={-1} aria-hidden className="block w-full">
          <Image src="/waitlist/sky-preview.webp" alt="" width={780} height={520} className="block aspect-[3/2] w-full object-cover object-top" />
        </button>
        <div className="p-5 sm:p-6">
          <h2 id="wl-sky" className="font-display text-[1.75rem] leading-[1.15] font-medium tracking-[-0.03em]">
            Try your sky while you wait
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
            Your day is a wheel. Turn it, tap it open into your week, fold it back. A made-up day, two minutes.
          </p>
          <button
            ref={entry}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="lf-sb lf-sb-sun mt-4 inline-flex min-h-12 items-center gap-2"
          >
            Try it
            <PixelIcon name="arrow" className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
      {open && <Explainer name={name} tz={tz} companion={companion} onClose={() => setOpen(false)} />}
    </>
  );
}
