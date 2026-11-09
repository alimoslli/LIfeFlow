"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { whenIdle } from "@/lib/idle";
import { Toaster } from "@/components/ui/toaster";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setTourAction } from "@/app/(onboarding)/welcome/actions";
import { Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { assistantLabel, nameAtStart, UNNAMED_ASSISTANT } from "@/lib/assistant";
import { NAV, isActive, moduleForPath } from "./nav-items";
import { LifeAreasContext } from "./life-areas";
import type { LifeAreas } from "@/lib/life";

const ALL_AREAS: LifeAreas = { school: true, work: true };
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
import { NAME_KEY, TZ_KEY } from "../motion/splash";
import type { JarvisAvailability } from "../jarvis/types";
import { BrandMark } from "@/components/brand/brand-mark";
import { SkyScene } from "@/components/sky/sky-scene";
import { CompanionGlyph } from "@/components/sky/companion-glyph";

type ShellCtx = {
  openJarvis: (prompt?: string, opts?: { send?: boolean }) => void;
  assistantName: string;
  firstName: string;
  aiConsent: boolean;
  /** The user's time zone (Settings), for anything that depends on their local time. */
  tz: string;
  /** Their companion (lib/companions), drawn wherever the assistant is. */
  companion?: string | null;
};
const Ctx = createContext<ShellCtx>({ openJarvis: () => {}, assistantName: UNNAMED_ASSISTANT, firstName: "", aiConsent: false, tz: "UTC", companion: null });
export const useShell = () => useContext(Ctx);

type Drawer = { open: boolean; prompt?: string; send?: boolean; key: number };

export function AppShell({
  user,
  jarvis,
  tour = false,
  assistantName = UNNAMED_ASSISTANT,
  companion,
  aiConsent = false,
  unread = 0,
  areas = ALL_AREAS,
  children,
}: {
  /** Which parts of the app the user sees (from "What fills your week"). */
  areas?: LifeAreas;
  /** New Jarvis messages: a dot on the Jarvis tab. */
  unread?: number;
  /** The name the user gave their assistant ("your assistant" until they choose one). */
  assistantName?: string;
  /** Their companion (lib/companions), drawn on the assistant's tab and button. */
  companion?: string | null;
  /** The user allowed Jarvis to send their data to the AI provider. */
  aiConsent?: boolean;
  user: { name: string; email: string; accountKind: "standard" | "demo"; timezone?: string };
  jarvis: JarvisAvailability;
  /** Show the guided tour (once, after onboarding or when replayed). */
  tour?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs = NAV.filter((t) => t.module !== "school" || areas.school);
  const router = useRouter();
  // Keep every tab warm: after each move (and after a save clears the cache) prefetch the tabs again when idle,
  // so switching tabs opens a ready page instead of a skeleton.
  const tabHrefs = tabs.map((t) => t.href).join(" ");
  useEffect(() => {
    const warm = () => whenIdle(() => tabHrefs.split(" ").forEach((h) => router.prefetch(h)));
    let cancel = warm();
    // After a save (the cache is cleared) or coming back to the app, warm them again.
    const again = () => (cancel(), (cancel = warm()));
    window.addEventListener("lf:saved", again);
    window.addEventListener("focus", again);
    return () => {
      cancel();
      window.removeEventListener("lf:saved", again);
      window.removeEventListener("focus", again);
    };
  }, [pathname, router, tabHrefs]);
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
  // The ask button steps aside while you scroll down a page (so it never sits on what you're reading) and comes back
  // when you scroll up (A-to-Z audit C1).
  const [fabAway, setFabAway] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setFabAway(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const openJarvis = useCallback(
    (prompt?: string, opts?: { send?: boolean }) => setDrawer((d) => ({ open: true, prompt, send: opts?.send, key: prompt ? d.key + 1 : d.key })),
    [setDrawer],
  );

  // Remembered on this device so the opening screen can greet by name, at the hour in the user's time zone.
  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, user.name.split(" ")[0]);
      if (user.timezone) localStorage.setItem(TZ_KEY, user.timezone);
    } catch {}
  }, [user.name, user.timezone]);

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

  // The chat is full-screen; Updates, Profile and Memory are normal pages.
  const onJarvisPage =
    pathname.startsWith("/jarvis") && !["/jarvis/says", "/jarvis/memory", "/jarvis/profile", "/jarvis/ideas"].some((p) => pathname.startsWith(p));
  // The assistant's other pages (Updates, Ideas, Profile) keep the chat's own header and pill row,
  // so moving between them never swaps the whole interface (UX review).
  const assistantPage = !onJarvisPage && (pathname.startsWith("/jarvis") || pathname.startsWith("/inbox"));
  const settingsActive = pathname.startsWith("/settings");

  return (
    <Ctx.Provider value={{ openJarvis, assistantName, firstName: user.name.split(" ")[0], aiConsent, tz: user.timezone ?? "UTC", companion }}>
      <LifeAreasContext.Provider value={areas}>
        <div className="lf-glass">
          <TiltLayer />
          <SkyScene tz={user.timezone ?? "UTC"} />
          <div className="flex min-h-dvh">
            {/* Desktop rail */}
            <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center py-6 md:flex">
              <Link href="/" aria-label="LifeFlow home" className="mb-8">
                <Mark className="h-10 w-10" />
              </Link>
              {/* on the sky, no white pill (A-to-Z audit E4): where you are is the accent glyph and a thin accent line */}
              <nav ref={rail} className="relative flex flex-col gap-1 pl-2" aria-label="Main">
                <span data-indicator className="pointer-events-none absolute top-0 left-0 w-[3px] rounded-full bg-accent opacity-0" />
                {tabs.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      data-tour={item.label.toLowerCase()}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[0.6875rem] font-medium transition-colors",
                        active ? "text-text" : "text-muted hover:text-text",
                      )}
                    >
                      {item.href === "/jarvis" ? (
                        <CompanionGlyph companion={companion} className="h-6 w-6" />
                      ) : (
                        <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={active ? 2 : 1.6} />
                      )}
                      {item.href === "/jarvis" ? assistantLabel(assistantName) : item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <main
                className={cn(
                  "mx-auto w-full flex-1",
                  onJarvisPage
                    ? "max-w-none"
                    : assistantPage
                      ? "max-w-3xl pb-32 md:pb-16"
                      : "lf-main-pad max-w-5xl px-5 sm:px-8 md:max-w-6xl md:px-6 md:pt-5 md:pb-28",
                )}
              >
                {!onJarvisPage && !assistantPage && <MobileAppBar demo={user.accountKind === "demo"} onSearch={() => setPalette(true)} />}
                {!onJarvisPage && !assistantPage && <TopBar demo={user.accountKind === "demo"} settingsActive={settingsActive} onToday={pathname === "/"} />}
                {onJarvisPage ? (
                  <PageMotion>{children}</PageMotion>
                ) : assistantPage ? (
                  <>
                    <AssistantHeader name={nameAtStart(assistantName)} />
                    <SectionNav inline />
                    <div className="px-4 pt-4 md:px-6">
                      <PageMotion>{children}</PageMotion>
                    </div>
                  </>
                ) : (
                  // The page sits right on the sky, on a laptop too (owner, 2026-11-09: no more boxes); cards only where
                  // there's something to tap.
                  <div className="md:pt-2">
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
              <span data-indicator className="pointer-events-none absolute top-[6px] left-0 h-[52px] w-[74px] rounded-[22px] bg-accent-soft opacity-0" />
              {tabs.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    data-tour={item.label.toLowerCase()}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[0.6875rem] font-semibold",
                      active ? "text-text" : "text-muted",
                    )}
                  >
                    <span className="relative flex">
                      {item.href === "/jarvis" ? (
                        <span data-icon className="flex h-[22px] w-[22px] items-center justify-center">
                          <CompanionGlyph companion={companion} className="h-6 w-6" />
                        </span>
                      ) : (
                        <Icon data-icon className={cn("h-[22px] w-[22px]", active && "text-accent")} strokeWidth={active ? 2 : 1.7} />
                      )}
                      {item.href === "/jarvis" && unread > 0 && (
                        <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" aria-label={`${unread} new`} />
                      )}
                    </span>
                    <span className="max-w-full truncate px-0.5">{item.href === "/jarvis" ? assistantLabel(assistantName) : item.label}</span>
                  </Link>
                );
              })}
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
        <Suspense fallback={null}>
          <QuickAdd />
        </Suspense>
        {/* Not on Today: the clock has its own ask bar right under it. */}
        {!onJarvisPage && !assistantPage && pathname !== "/" && (
          <button
            type="button"
            onClick={() => openJarvis()}
            data-tour="ask"
            aria-label={`Ask ${assistantName}`}
            className={cn(
              "lf-fab fixed right-4 bottom-[calc(var(--tabbar-space)-4px)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lift transition-[transform,opacity] duration-300 active:scale-95 md:hidden",
              fabAway && "pointer-events-none translate-y-6 opacity-0",
            )}
          >
            <CompanionGlyph companion={companion} className="h-8 w-8" />
          </button>
        )}
        <KeyboardWatcher />
        <CommandPalette open={palette} onClose={() => setPalette(false)} onAsk={(q) => openJarvis(q, { send: !!q })} />
      </LifeAreasContext.Provider>
    </Ctx.Provider>
  );
}

/**
 * Laptops only: the ask field (⌘J) and Settings, on the sky. Today has its own ask bar, so there it's just Settings
 * (owner, 2026-11-09: no greeting, no second ask bar).
 */
function TopBar({ demo, settingsActive, onToday }: { demo: boolean; settingsActive: boolean; onToday: boolean }) {
  const { openJarvis, assistantName } = useShell();
  return (
    <div className="mb-3 hidden items-center gap-3 md:flex">
      {onToday ? (
        <span className="flex-1" />
      ) : (
        <button
          type="button"
          onClick={() => openJarvis()}
          className="mx-auto flex h-11 w-full max-w-md items-center gap-2.5 rounded-full bg-surface px-4 text-sm text-muted shadow-soft transition-colors hover:text-text"
        >
          <Sparkles className="h-4 w-4 text-accent" />
          Ask {assistantName} anything…
          <kbd className="ml-auto rounded-md bg-surface-3 px-1.5 py-0.5 font-sans text-[0.6875rem] text-muted">⌘J</kbd>
        </button>
      )}
      {demo && <span className="shrink-0 rounded-full bg-warning-soft px-3 py-1.5 text-xs text-warning">Sample data</span>}
      <Link
        href="/settings"
        data-tour="settings"
        aria-label="Settings"
        title="Settings"
        aria-current={settingsActive ? "page" : undefined}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-soft hover:bg-surface-2",
          settingsActive ? "text-accent" : "text-text-2",
        )}
      >
        <Settings className="h-5 w-5" />
      </Link>
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

/** @deprecated Use BrandMark for new surfaces. Kept as the compatibility mark for existing LifeFlow pages. */
/** The same top row the chat uses (title in the middle, Settings and the assistant's profile on the right). */
function AssistantHeader({ name }: { name: string }) {
  return (
    <header className="flex items-center gap-0.5 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4">
      <span className="h-11 w-11 shrink-0 lg:hidden" aria-hidden />
      <p className="min-w-0 flex-1 truncate px-1 text-center text-[0.9375rem] font-semibold lg:text-left">{name}</p>
      <Link
        href="/settings"
        aria-label="Settings"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Settings className="h-5 w-5" />
      </Link>
      <Link href="/jarvis/profile" aria-label="Assistant profile" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2">
        <BrandMark className="h-8 w-8" alt="" />
      </Link>
    </header>
  );
}

export function Mark({ className }: { className?: string }) {
  return <BrandMark className={cn("h-8 w-8", className)} alt="" />;
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
