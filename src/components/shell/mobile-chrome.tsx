"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/** Compact titles and back targets for the phone app bar. Detail views get a back button. */
const ROUTES: { test: RegExp; title: string; back?: string }[] = [
  { test: /^\/$/, title: "Today" },
  { test: /^\/plan$/, title: "Plan" },
  { test: /^\/calendar/, title: "Calendar" },
  { test: /^\/tasks\/[^/]+$/, title: "To-do", back: "/tasks" },
  { test: /^\/tasks/, title: "To-dos" },
  { test: /^\/school\/courses\/[^/]+$/, title: "Class", back: "/school" },
  { test: /^\/school/, title: "Classes" },
  { test: /^\/work/, title: "Work" },
  { test: /^\/notes\/[^/]+$/, title: "Note", back: "/notes" },
  { test: /^\/notes/, title: "Notes" },
  { test: /^\/trips\/[^/]+$/, title: "Trip", back: "/trips" },
  { test: /^\/trips/, title: "Trips" },
  { test: /^\/money\/coach/, title: "Coach", back: "/money" },
  { test: /^\/money\/report/, title: "Reports", back: "/money" },
  { test: /^\/money/, title: "Money" },
  { test: /^\/finances\/transactions/, title: "Transactions" },
  { test: /^\/finances\/budgets/, title: "Budgets" },
  { test: /^\/finances\/bills/, title: "Bills" },
  { test: /^\/finances\/goals/, title: "Goals" },
  { test: /^\/finances\/accounts/, title: "Accounts" },
  { test: /^\/finances\/rules/, title: "Category rules", back: "/finances/transactions" },
  { test: /^\/wealth/, title: "Investments" },
  { test: /^\/settings/, title: "Settings" },
];

export function routeInfo(pathname: string): { title: string; back?: string } {
  return ROUTES.find((r) => r.test.test(pathname)) ?? { title: "LifeFlow" };
}

/**
 * Phones only: a sticky glass app bar. The page's own large title scrolls
 * away and the compact title fades in, like iOS. Detail views get a back
 * button; the avatar opens Settings.
 */
export function MobileAppBar({ initials, demo, onSearch }: { initials: string; demo: boolean; onSearch: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const info = routeInfo(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [demoHidden, setDemoHidden] = useState(true);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [pathname]);
  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem("lf-demo-pill") === "hidden";
    } catch {}
    const t = setTimeout(() => setDemoHidden(hidden), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <header
      className={cn(
        "lf-appbar sticky top-0 z-30 -mx-5 mb-2 flex items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-[background,box-shadow] duration-200 sm:-mx-8 md:hidden",
        scrolled && "lf-appbar-scrolled",
      )}
    >
      <div className="flex h-12 min-w-11 items-center">
        {info.back ? (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(info.back!))}
            className="tap -ml-1 flex items-center gap-0.5 rounded-full pr-2 text-accent"
            aria-label="Back"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            <span className="text-[15px]">Back</span>
          </button>
        ) : null}
      </div>
      <p
        className={cn(
          "pointer-events-none absolute inset-x-24 bottom-0 flex h-12 items-center justify-center truncate text-[16px] font-semibold transition-opacity duration-200",
          scrolled || info.back ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!scrolled && !info.back}
      >
        {info.title}
      </p>
      <div className="ml-auto flex items-center">
        {demo && !demoHidden && (
          <span className="mr-1 flex items-center rounded-full bg-warning-soft pl-2.5 text-[11px] text-warning">
            Sample data
            <button
              type="button"
              aria-label="Hide the sample data label"
              className="tap flex items-center justify-center"
              onClick={() => {
                setDemoHidden(true);
                try {
                  localStorage.setItem("lf-demo-pill", "hidden");
                } catch {}
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <button type="button" onClick={onSearch} aria-label="Search and ask" className="tap flex items-center justify-center rounded-full text-text-2">
          <Search className="h-5 w-5" />
        </button>
        <Link href="/settings" aria-label="Settings and profile" className="tap flex items-center justify-center rounded-full">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-text-2">{initials}</span>
        </Link>
      </div>
    </header>
  );
}

/**
 * Pull down at the top of a page to refresh it. Works in installed apps,
 * where browsers don't provide their own. Touch only; skipped while typing.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  useEffect(() => {
    const THRESHOLD = 70;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || busy || document.documentElement.dataset.typing === "true") return;
      if ((e.target as HTMLElement).closest("dialog,[data-no-ptr]")) return;
      start.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const eased = Math.min(110, dy * 0.5);
      if (pullRef.current < THRESHOLD && eased >= THRESHOLD) haptic("light");
      pullRef.current = eased;
      setPull(eased);
    };
    const onEnd = () => {
      if (start.current == null) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD) {
        setBusy(true);
        setPull(56);
        router.refresh();
        setTimeout(() => {
          setBusy(false);
          setPull(0);
        }, 900);
      } else setPull(0);
      pullRef.current = 0;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router, busy]);
  if (!pull && !busy) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-50 flex justify-center md:hidden"
      style={{ transform: `translateY(${Math.max(0, pull - 30)}px)`, opacity: Math.min(1, pull / 60) }}
      role="status"
      aria-label={busy ? "Refreshing" : undefined}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-lift">
        <Loader2 className={cn("h-4 w-4 text-accent", busy && "animate-spin")} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
}

/**
 * Keeps inputs visible above the on-screen keyboard: marks the page while
 * typing (the tab bar hides) and exposes the keyboard height as --kb.
 */
export function KeyboardWatcher() {
  useEffect(() => {
    const root = document.documentElement;
    const isField = (el: Element | null) =>
      !!el &&
      (el.matches("textarea, [contenteditable=true], select") ||
        (el.matches("input") && !/^(checkbox|radio|button|submit|range|color|file)$/i.test((el as HTMLInputElement).type)));
    const sync = () => {
      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty("--kb", `${Math.round(kb)}px`);
      root.dataset.typing = isField(document.activeElement) && window.matchMedia("(pointer: coarse)").matches ? "true" : "false";
    };
    const onFocus = () => {
      sync();
      const el = document.activeElement as HTMLElement | null;
      if (isField(el)) setTimeout(() => el?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", () => setTimeout(sync, 50));
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("focusin", onFocus);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);
  return null;
}
