"use client";
import { useEffect } from "react";

const TABS = new Set(["/", "/plan", "/jarvis", "/money"]);
const depth = (path: string) => path.split("/").filter(Boolean).length;

type Dir = "forward" | "back" | "fade" | "none";

/** Read once by the page template when the next screen mounts (then back to a plain fade). */
export function consumeNavDirection(): Dir {
  const root = document.documentElement;
  const dir = (root.dataset.nav as Dir | undefined) ?? "fade";
  root.dataset.nav = "fade";
  return dir;
}

/**
 * Tells the page transition (app/(app)/template.tsx) which way to move, like
 * a native app: deeper pages come in from the right, going back comes in from
 * the left, switching tabs crossfades. Set on <html data-nav> when the
 * navigation starts.
 */
export function NavDirection() {
  useEffect(() => {
    const root = document.documentElement;
    let reset: ReturnType<typeof setTimeout> | undefined;
    const set = (dir: Dir) => {
      root.dataset.nav = dir;
      clearTimeout(reset);
      // A click that didn't navigate shouldn't decide a later navigation's direction.
      reset = setTimeout(() => (root.dataset.nav = "fade"), 4000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || to.pathname === location.pathname) return;
      if (TABS.has(to.pathname) && TABS.has(location.pathname)) return set("fade");
      if (a.dataset.nav === "back") return set("back");
      const d = depth(to.pathname) - depth(location.pathname);
      set(d > 0 ? "forward" : d < 0 ? "back" : "fade");
    };
    // Browser back/forward: slide back, unless the browser already animated it (iOS edge swipe).
    const onPop = (e: PopStateEvent) => set((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition ? "none" : "back");
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clearTimeout(reset);
    };
  }, []);
  return null;
}
