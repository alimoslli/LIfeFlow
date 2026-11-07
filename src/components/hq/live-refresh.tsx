"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Live HQ (ADR 0030): re-reads the page every `every` ms while the tab is visible, so who is working on what stays current
 * without a reload. Plain database reads, no AI. It waits while the owner types, picks or has a dialog open, so nothing
 * they are doing is disturbed, and catches up as soon as the tab is visible again.
 */
export function LiveRefresh({ every = 15_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      router.refresh();
    };
    const id = window.setInterval(tick, every);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, every]);
  return null;
}
