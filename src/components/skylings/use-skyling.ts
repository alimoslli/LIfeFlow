"use client";
import { useEffect, useState } from "react";
import { SKY_CHOICE, type CompanionKey } from "@/lib/companions";
import { resolveSkyling } from "@/lib/skyling-now";

/**
 * The skyling to draw for a saved choice. "Changes with the sky" follows the time in their time zone and is looked at
 * again every minute, so it swaps by itself at first light, midday, golden hour, after sunset and at night.
 */
export function useSkyling(choice: string | null | undefined, tz: string): CompanionKey | null {
  // a minute's tick re-renders, and the time is read again (only "Changes with the sky" ticks)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (choice !== SKY_CHOICE) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [choice]);
  return resolveSkyling(choice, tz);
}
