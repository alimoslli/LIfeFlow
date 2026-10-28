"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setTourAction } from "@/app/(onboarding)/welcome/actions";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive, moduleForPath } from "./nav-items";
import { JarvisDrawer } from "../jarvis/jarvis-drawer";
import { SectionNav } from "./section-nav";
import { KeyboardWatcher, MobileAppBar, PullToRefresh } from "./mobile-chrome";
import { CommandPalette } from "./command-palette";
import { QuickAdd } from "./quick-add";
import { PwaClient } from "../pwa/pwa-client";
import { PasskeyOffer } from "../auth/passkey-offer";
import { NavDirection } from "../motion/nav-direction";
import { PageMotion } from "../motion/page-motion";
import { gsap, MOTION, prefersReducedMotion } from "../motion/gsap";
import { TiltLayer } from "../motion/tilt";
import { Tour } from "../motion/tour";
import type { JarvisAvailability } from "../jarvis/types";

type ShellCtx = { openJarvis: (prompt?: string, opts?: { send?: boolean }) => void; assistantName: string };
const Ctx = createContext<ShellCtx>({ openJarvis: () => {}, assistantName: "Jarvis" });
export const useShell = () => useContext(Ctx);

type Drawer = { open: boolean; prompt?: string; send?: boolean; key: number };

export function AppShell({
  user,
  jarvis,
  tour = false,
  assistantName = "Jarvis",
  children,
}: {
  /** The name the user gave their assistant. */
  assistantName?: string;
  user: { name: string; email: string; accountKind: "standard" | "demo" };
  jarvis: JarvisAvailability;
  /** Show the guided tour (once, after onboarding or when replayed). */
  tour?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [tourOpen, setTourOpen] = useState(tour);
  const endTour = useCallback(() => {
    setTourOpen(false);
    void setTourAction("done");
  }, []);
  const rail = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useSlidingIndicator(rail, pathname, "y");
  useSlidingIndicator(bar, pathname, "x");
  const [drawer, setDrawer] = useState<Drawer>({ open: false, key: 0 });
  const [palette, setPalette] = useState(false);
  const openJarvis = useCallback(
    (prompt?: string, opts?: { send?: boolean }) => setDrawer((d) => ({ open: true, prompt, send: opts?.send, key: prompt ? d.key + 1 : d.key })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDrawer((d) => ({ ...d, open: !d.open, prompt: undefined, send: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onJarvisPage = pathname.startsWith("/jarvis");
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const settingsActive = pathname.startsWith("/settings");

  return (
    <Ctx.Provider value={{ openJarvis, assistantName }}>
      <div className="lf-glass">
        <TiltLayer />
        <div className="lf-scene" aria-hidden />
        <div className="flex min-h-dvh">
          {/* Desktop rail */}
          <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center py-6 md:flex">
            <Link href="/" aria-label="LifeFlow home" className="mb-8">
              <Mark />
            </Link>
            <nav ref={rail} className="relative flex flex-col gap-1 rounded-[28px] bg-surface p-1.5 shadow-soft" aria-label="Main">
              <span data-indicator className="pointer-events-none absolute top-0 left-1.5 w-16 rounded-[22px] bg-surface-3 opacity-0" />
              {NAV.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.label.toLowerCase()}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-medium transition-colors",
                      active ? "text-text" : "text-muted hover:text-text",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={active ? 2 : 1.6} />
                    {item.href === "/jarvis" ? assistantName : item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <main
              className={cn("mx-auto w-full flex-1", onJarvisPage ? "max-w-none" : "lf-main-pad max-w-5xl px-5 sm:px-8 md:max-w-6xl md:px-6 md:pt-5 md:pb-6")}
            >
              {!onJarvisPage && <MobileAppBar initials={initials} demo={user.accountKind === "demo"} onSearch={() => setPalette(true)} />}
              {!onJarvisPage && (
                <TopBar firstName={user.name.split(" ")[0]} initials={initials} demo={user.accountKind === "demo"} settingsActive={settingsActive} />
              )}
              {onJarvisPage ? (
                <PageMotion>{children}</PageMotion>
              ) : (
                // Desktop: the page sits in one large frosted panel. Phones: no panel.
                <div className="md:rounded-[32px] md:bg-surface md:p-8 md:shadow-soft lg:p-10">
                  <SectionNav />
                  <PageMotion>{children}</PageMotion>
                </div>
              )}
            </main>
          </div>
        </div>

        {/* Mobile tab bar */}
        <nav
          className="lf-tabbar fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] lf-bar z-40 rounded-[28px] bg-surface shadow-lift md:hidden"
          aria-label="Main"
        >
          <div ref={bar} className="relative mx-auto flex max-w-md items-stretch justify-around px-2">
            <span data-indicator className="pointer-events-none absolute top-[5px] left-0 h-8 w-14 rounded-full bg-accent-soft opacity-0" />
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={item.label.toLowerCase()}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium", active ? "text-accent" : "text-muted")}
                >
                  <Icon data-icon className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.6} />
                  {item.href === "/jarvis" ? assistantName : item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium", settingsActive ? "text-accent" : "text-muted")}
            >
              <span
                className={cn(
                  "flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-semibold",
                  settingsActive ? "bg-accent text-accent-text" : "bg-surface-3 text-text-2",
                )}
              >
                {initials}
              </span>
              You
            </Link>
          </div>
        </nav>

        {tourOpen && pathname === "/" && <Tour onDone={endTour} assistantName={assistantName} />}

        {!onJarvisPage && (
          <JarvisDrawer
            key={drawer.key}
            open={drawer.open}
            onClose={() => setDrawer((d) => ({ ...d, open: false }))}
            module={moduleForPath(pathname)}
            availability={jarvis}
            initialPrompt={drawer.prompt}
            autoSend={drawer.send}
            assistantName={assistantName}
          />
        )}
      </div>
      <Toaster />
      <PullToRefresh />
      <PwaClient />
      <PasskeyOffer />
      <NavDirection />
      {!onJarvisPage && (
        <Suspense fallback={null}>
          <QuickAdd />
        </Suspense>
      )}
      <KeyboardWatcher />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onAsk={(q) => openJarvis(q, { send: !!q })} />
    </Ctx.Provider>
  );
}

/** Desktop only: a floating glass bar with a greeting, a Jarvis search field and the account. */
function TopBar({ firstName, initials, demo, settingsActive }: { firstName: string; initials: string; demo: boolean; settingsActive: boolean }) {
  const { openJarvis, assistantName } = useShell();
  return (
    <div className="mb-4 hidden items-center gap-4 rounded-full bg-surface p-1.5 shadow-soft md:flex">
      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="flex shrink-0 items-center gap-2.5 rounded-full py-0.5 pr-3 pl-0.5 hover:bg-surface-2"
      >
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
            settingsActive ? "bg-accent text-accent-text" : "bg-surface-3 text-text-2",
          )}
        >
          {initials}
        </span>
        <span className="text-sm font-medium">Welcome, {firstName}</span>
      </Link>
      <button
        type="button"
        onClick={() => openJarvis()}
        className="mx-auto flex h-10 w-full max-w-md items-center gap-2.5 rounded-full bg-surface-2 px-4 text-sm text-muted transition-colors hover:text-text"
      >
        <Sparkles className="h-4 w-4 text-accent" />
        Ask {assistantName} anything…
        <kbd className="ml-auto rounded-md bg-surface-3 px-1.5 py-0.5 font-sans text-[11px] text-muted">⌘J</kbd>
      </button>
      {demo ? <span className="shrink-0 rounded-full bg-warning-soft px-3 py-1.5 text-xs text-warning">Sample data</span> : <span className="w-9 shrink-0" />}
    </div>
  );
}

/**
 * Glides the active-tab highlight between tabs instead of jumping.
 * The highlight is a single absolutely positioned element per nav.
 */
function useSlidingIndicator(ref: React.RefObject<HTMLElement | null>, pathname: string, axis: "x" | "y") {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const nav = ref.current;
    const ind = nav?.querySelector<HTMLElement>("[data-indicator]");
    if (!nav || !ind) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      gsap.to(ind, { opacity: 0, duration: 0.15 });
      return;
    }
    const target =
      axis === "x"
        ? { x: active.offsetLeft + active.offsetWidth / 2 - ind.offsetWidth / 2, opacity: 1 }
        : { y: active.offsetTop, height: active.offsetHeight, opacity: 1 };
    if (!placed.current || prefersReducedMotion()) {
      gsap.set(ind, target);
      placed.current = true;
      return;
    }
    gsap.to(ind, { ...target, duration: 0.42, ease: MOTION.ease, overwrite: true });
    const icon = active.querySelector("[data-icon]");
    if (icon) gsap.fromTo(icon, { scale: 0.86 }, { scale: 1, duration: 0.4, ease: "back.out(2.2)" });
  }, [pathname, ref, axis]);
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="10" className="fill-hero" />
      <path d="M8 19.5c2.6-4.6 5.2-6.9 8-6.9s4.6 2.2 8-2.6" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M8 24c2.6-3 5.2-4.5 8-4.5s4.6 1.4 8-1.7" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/** Opens the Jarvis drawer. With `send`, the prompt is sent immediately. */
export function AskJarvisButton({ prompt, send, children, className }: { prompt?: string; send?: boolean; children: ReactNode; className?: string }) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(prompt, { send })} className={cn("lf-touch", className)}>
      {children}
    </button>
  );
}
