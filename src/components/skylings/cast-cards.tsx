"use client";
import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/components/motion/gsap";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { COMPANIONS, type CompanionKey, ownsNight } from "@/lib/companions";

/**
 * The five skylings as cards on the landing page: each blinks on its own beat and hops when you point at it (or tap it).
 * Words come from lib/companions, the same the welcome and Settings use.
 */
export function CastCards() {
  const [tick, setTick] = useState(0);
  const [hot, setHot] = useState<CompanionKey | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);
  return (
    // five: two by two on a phone with the last one centred, all in a row on a laptop
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 max-lg:[&>li:last-child]:col-span-2 max-lg:[&>li:last-child]:w-[calc(50%-0.5rem)] max-lg:[&>li:last-child]:justify-self-center">
      {COMPANIONS.map((c, i) => {
        const on = hot === c.key;
        const frame = on ? tick % 4 : (tick + i * 7) % 26 === 0 ? 1 : 0;
        return (
          <li
            key={c.key}
            onPointerEnter={() => setHot(c.key)}
            onPointerLeave={() => setHot((h) => (h === c.key ? null : h))}
            onClick={() => setHot(c.key)}
            className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white/[0.06] p-4 ring-1 ring-white/12 backdrop-blur-md transition-[background-color,transform] duration-300 hover:-translate-y-1 hover:bg-white/[0.1] sm:p-5"
          >
            <span
              className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-45 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
              style={{ background: c.key === "star" ? "#ffd77a" : c.key === "moon" ? "#fff3c4" : c.look.trim }}
              aria-hidden
            />
            <CompanionGlyph
              companion={c.key}
              night={ownsNight(c.key)}
              pose={on ? "celebrate" : "idle"}
              frame={frame}
              className="lf-pixel relative h-20 w-20 sm:h-24 sm:w-24"
            />
            <p className="relative mt-3 font-display text-[1.375rem] leading-none font-medium tracking-[-0.02em] text-white">{c.name}</p>
            <p className="relative mt-1 text-[0.6875rem] font-semibold tracking-[0.1em] text-[#ffd77a] uppercase">{c.moment}</p>
            <p className="relative mt-2.5 text-[0.875rem] leading-snug text-white/75">{c.line}</p>
            <p className="relative mt-auto pt-3 text-[0.8125rem] leading-snug text-white/55">
              <span className="text-white/80">Best at</span> {c.skill.charAt(0).toLowerCase() + c.skill.slice(1)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
