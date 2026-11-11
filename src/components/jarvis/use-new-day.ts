"use client";
import { useEffect, useRef } from "react";
import { todayIn } from "@/lib/dates";

/** Calls `onNewDay` once when the day in the person's time zone changes while the page is open (a chat is one day's). */
export function useNewDay(tz: string, onNewDay: () => void) {
  const day = useRef(todayIn(tz));
  const callback = useRef(onNewDay);
  useEffect(() => {
    callback.current = onNewDay;
  });
  useEffect(() => {
    const check = () => {
      const now = todayIn(tz);
      if (now === day.current) return;
      day.current = now;
      callback.current();
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [tz]);
}
