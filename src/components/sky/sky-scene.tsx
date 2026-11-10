"use client";

import { useEffect, useRef } from "react";
import { sunTimes } from "@/lib/day-clock";
import { skyWash } from "@/lib/sky";

/** Minutes into the day and the date there, in the user's time zone. */
export function localNow(tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  return { date: `${p.year}-${p.month}-${p.day}`, minute: (+p.hour % 24) * 60 + +p.minute };
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
};

/**
 * The page's backdrop (Day Sky, v3): the app's scene with a soft wash of the real sky for this hour at its top, so
 * every page carries the time of day. Set after the first paint (it depends on the clock) and once a minute after.
 */
export function SkyScene({ tz }: { tz: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let zone = tz;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      zone = "UTC";
    }
    const paint = () => {
      const { date, minute } = localNow(zone);
      const { rise, set } = sunTimes(date, zone);
      const w = skyWash(minute, rise, set, isDark());
      el.style.setProperty("--sky-a", w.a);
      el.style.setProperty("--sky-b", w.b);
      el.style.setProperty("--sky-o", "1");
    };
    paint();
    const timer = window.setInterval(paint, 60_000);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", paint);
    const obs = new MutationObserver(paint);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.clearInterval(timer);
      mq.removeEventListener("change", paint);
      obs.disconnect();
    };
  }, [tz]);
  return <div ref={ref} className="lf-scene" aria-hidden />;
}
