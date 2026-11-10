"use client";
import { useEffect, useState } from "react";
import { SKY_CHOICE, type CompanionKey } from "@/lib/companions";
import { resolveSkyling } from "@/lib/skyling-now";

/**
 * The skyling to draw for a saved choice. "Changes with the sky" follows the time in their time zone and is looked at
 * again every minute, so it swaps by itself at first light, midday, golden hour, after sunset and at night.
 *
 * `renderedAt` is the server's time for this page: the first render uses it, so the page wakes up showing exactly what
 * the server drew even when the phone's clock disagrees. The phone's own clock takes over at the next minute's tick,
 * never straight after loading: an update then reaches parts of the page that are still arriving and makes React throw
 * the server's copy away.
 */
export function useSkyling(choice: string | null | undefined, tz: string, renderedAt?: number): CompanionKey | null {
  const [at, setAt] = useState<number | undefined>(renderedAt);
  useEffect(() => {
    if (choice !== SKY_CHOICE) return;
    const id = setInterval(() => setAt(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [choice]);
  return resolveSkyling(choice, tz, at == null ? undefined : new Date(at));
}
