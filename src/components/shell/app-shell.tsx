"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { whenIdle } from "@/lib/idle";
import { Toaster } from "@/components/ui/toaster";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setTourAction } from "@/app/(onboarding)/welcome/actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { openSettings, SettingsSheet } from "@/components/settings/settings-sheet";
import { EverythingSheet, openEverything } from "./everything-sheet";
import { cn } from "@/lib/utils";
import { isChatPage } from "@/lib/app-routes";
import { holdWindow } from "@/lib/chat-session";
import { ASK_EVENT, handOff, type AskDetail } from "@/lib/ask-handoff";
import { assistantLabel, nameAtStart, UNNAMED_ASSISTANT } from "@/lib/assistant";
import { isActive, tabsFor } from "./nav-items";
import { LifeAreasContext } from "./life-areas";
import type { LifeAreas } from "@/lib/life";

const ALL_AREAS: LifeAreas = { school: true, work: true };
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
import { BrandMark } from "@/components/brand/brand-mark";
import { SkyScene } from "@/components/sky/sky-scene";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { useSkyling } from "@/components/skylings/use-skyling";
import { companionOf, type CompanionKey, ownsNight } from "@/lib/companions";

type ShellCtx = {
  openJarvis: (prompt?: string, opts?: { send?: boolean }) => void;
  assistantName: string;
  firstName: string;
  aiConsent: boolean;
  /** The user's time zone (Settings), for anything that depends on their local time. */
  tz: string;
  /** Their skyling choice (lib/companions): one of the five, or "sky". */
  companion?: string | null;
  /** The skyling to draw now: the one picked, or whoever's moment it is for "Changes with the sky". */
  skyling?: CompanionKey | null;
};
const Ctx = createContext<ShellCtx>({
  openJarvis: () => {},
  assistantName: UNNAMED_ASSISTANT,
  firstName: "",
  aiConsent: false,
  tz: "UTC",
  companion: null,
  skyling: null,
});
export const useShell = () => useContext(Ctx);

export function AppShell({
  user,
  tour = false,
  settingUp = false,
  assistantName = UNNAMED_ASSISTANT,
  assistantNamed = false,
  companion,
  aiConsent = false,
  moneyLock = false,
  unread = 0,
  areas = ALL_AREAS,
  renderedAt,
  children,
}: {
  /** The server's time for this page, so "Changes with the sky" wakes up as the server drew it (use-skyling). */
  renderedAt?: number;
  /** Which parts of the app the user sees (from "What fills your week"). */
  areas?: LifeAreas;
  /** New Jarvis messages: a dot on the Jarvis tab. */
  unread?: number;
  /** The skyling's name: the one they gave it, or its own (lib/assistant `assistantProfile`). */
  assistantName?: string;
  /** They gave it a name; otherwise it goes by its skyling's own, which for "Changes with the sky" follows whoever is up. */
  assistantNamed?: boolean;
  /** Their skyling (lib/companions), drawn on the skyling's tab and button. */
  companion?: string | null;
  /** The user allowed Jarvis to send their data to the AI provider. */
  aiConsent?: boolean;
  /** The Money lock is on: the service worker must not keep the home page (it shows money) for offline reading. */
  moneyLock?: boolean;
  user: { id: string; name: string; email: string; accountKind: "standard" | "demo"; timezone?: string };
  /** Show the guided tour (once, after onboarding or when replayed). */
  tour?: boolean;
  /** Setup is running on Today (owner, 2026-11-12): the skyling guides it, so the rest of the app's chrome waits. */
  settingUp?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs = tabsFor(areas);
  const router = useRouter();
  // this window is one of the app's open windows (a new window joins the open chat, lib/chat-session.ts)
  useEffect(() => {
    holdWindow();
  }, []);
  // Keep every tab warm: after each move (and after a save clears the cache) prefetch the tabs again when idle,
  // so switching tabs opens a ready page instead of a skeleton. The chat page is the one tab never prefetched (isChatPage).
  const tabHrefs = tabs
    .map((t) => t.href)
    .filter((h) => !isChatPage(h))
    .join(" ");
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
  const [palette, setPalette] = useState(false);
  // Talking to the skyling happens in one chat (owner, 2026-11-10: no side panel). On the chat page a question goes into
  // the open conversation; anywhere else it opens the chat page with it, sent only when the app itself asked to send.
  const openJarvis = useCallback(
    (prompt?: string, opts?: { send?: boolean }) => {
      const text = prompt?.slice(0, 500);
      if (isChatPage(window.location.pathname)) {
        window.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, { detail: { prompt: text, send: opts?.send } }));
        return;
      }
      if (text) handOff(text, !!opts?.send);
      router.push("/jarvis");
    },
    [router],
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
        router.push("/jarvis");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // The chat is full-screen; Updates, Profile and Memory are normal pages.
  const onJarvisPage = isChatPage(pathname);
  // The skyling's other pages (Updates, Ideas, Profile) keep the chat's own header and pill row,
  // so moving between them never swaps the whole interface (UX review).
  const assistantPage = !onJarvisPage && (pathname.startsWith("/jarvis") || pathname.startsWith("/inbox"));
  const settingsActive = pathname.startsWith("/settings");
  // The skyling's bar sits on the dock everywhere except where the page has its own (Today, the chat).

  // "Changes with the sky": whoever's moment it is, looked at again every minute
  const skyling = useSkyling(companion, user.timezone ?? "UTC", renderedAt);
  // without a name of their own it goes by its skyling's, so "Changes with the sky" is called whoever is up right now
  if (!assistantNamed && skyling) assistantName = companionOf(skyling).name;
  return (
    <Ctx.Provider value={{ openJarvis, assistantName, firstName: user.name.split(" ")[0], aiConsent, tz: user.timezone ?? "UTC", companion, skyling }}>
      <LifeAreasContext.Provider value={areas}>
        <div className="lf-glass">
          <TiltLayer />
          <SkyScene tz={user.timezone ?? "UTC"} />
          <div className="flex min-h-dvh">
            {/* Desktop rail */}
            <aside className={cn("sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center py-6", settingUp ? "md:hidden" : "md:flex")}>
              {/* The sun on top is the Today tab itself (owner, 2026-11-11: a logo above Today looked clickable and people
                  went to it), so nothing in the corner is a second, unnamed way to the same place.
                  On the sky, no white pill (A-to-Z audit E4): where you are is the accent glyph and a thin accent line */}
              <nav ref={rail} className="relative flex flex-col gap-1 pl-2" aria-label="Main">
                <span data-indicator className="pointer-events-none absolute top-0 left-0 w-[3px] rounded-full bg-accent opacity-0" />
                {tabs.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={!isChatPage(item.href)}
                      data-tour={item.label.toLowerCase()}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[0.6875rem] font-medium transition-colors",
                        item.href === "/" && "mb-3",
                        active ? "text-text" : "text-muted hover:text-text",
                      )}
                    >
                      {item.href === "/" ? (
                        <BrandMark className="h-10 w-10" alt="" />
                      ) : item.href === "/jarvis" ? (
                        <CompanionGlyph companion={skyling} night={ownsNight(skyling)} className="h-6 w-6" />
                      ) : (
                        <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={active ? 2 : 1.6} />
                      )}
                      {item.href === "/jarvis" ? assistantLabel(assistantName) : item.label}
                    </Link>
                  );
                })}
                {/* everything else (to-dos, calendar, goals, health, work, updates, settings), the same doors as a phone's
                    More (owner, 2026-11-10: "the more icon doesn't show up on my computer") */}
                <button
                  type="button"
                  onClick={openEverything}
                  aria-haspopup="dialog"
                  className="group relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[0.6875rem] font-medium text-muted transition-colors hover:text-text"
                >
                  <PixelIcon name="more" className="h-5 w-5" />
                  More
                </button>
              </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <main
                className={cn(
                  "mx-auto w-full flex-1",
                  onJarvisPage
                    ? "max-w-none"
                    : assistantPage
                      ? "max-w-3xl pb-48 md:pb-16"
                      : "lf-main-pad max-w-5xl px-5 sm:px-8 md:max-w-6xl md:px-6 md:pt-5 md:pb-28",
                )}
              >
                {!onJarvisPage && !assistantPage && !settingUp && <MobileAppBar demo={user.accountKind === "demo"} onSearch={() => setPalette(true)} />}
                {!onJarvisPage && !assistantPage && !settingUp && (
                  <TopBar demo={user.accountKind === "demo"} settingsActive={settingsActive} onToday={pathname === "/"} />
                )}
                {onJarvisPage ? (
                  <PageMotion>{children}</PageMotion>
                ) : assistantPage ? (
                  <>
                    <AssistantHeader name={nameAtStart(assistantName)} skyling={skyling} />
                    <SectionNav inline />
                    <div className="px-4 pt-4 md:px-6">
                      <PageMotion>{children}</PageMotion>
                    </div>
                  </>
                ) : (
                  // The page sits right on the sky, on a laptop too (owner, 2026-11-09: no more boxes); cards only where
                  // there's something to tap.
                  <div className="md:pt-2">
                    {!settingUp && <SectionNav />}
                    <PageMotion>{children}</PageMotion>
                  </div>
                )}
              </main>
            </div>
          </div>

          {/* Phone dock: Today, the skyling, Money, School and one door to everything else. The skyling has its own tab
              again on every page (owner, 2026-11-10: "a small icon of him on all other pages that smoothly connects and
              be able to continue a chat"); Today has its own chat bar. */}
          <div
            className={cn(
              "lf-tabbar fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] lf-bar z-40 rounded-[28px] bg-surface shadow-lift md:hidden",
              settingUp && "hidden",
            )}
          >
            <nav aria-label="Main">
              <div ref={bar} className="relative mx-auto flex max-w-md items-stretch justify-around px-2">
                <span data-indicator className="pointer-events-none absolute top-[6px] left-0 h-[52px] w-[62px] rounded-[22px] bg-accent-soft opacity-0" />
                {tabs.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  const sky = item.href === "/jarvis";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={!isChatPage(item.href)}
                      data-tour={item.label.toLowerCase()}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[0.6875rem] font-semibold",
                        active ? "text-text" : "text-muted",
                      )}
                    >
                      {sky ? (
                        <span className="relative" data-icon>
                          <CompanionGlyph companion={skyling} night={ownsNight(skyling)} className="h-[22px] w-[22px]" />
                          {unread > 0 && <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />}
                        </span>
                      ) : (
                        <Icon data-icon className={cn("h-[22px] w-[22px]", active && "text-accent")} strokeWidth={active ? 2 : 1.7} />
                      )}
                      <span className="max-w-full truncate px-0.5">{sky ? assistantLabel(assistantName) : item.label}</span>
                    </Link>
                  );
                })}
                {/* everything that isn't one of the three places, as doors in a sheet from below */}
                <button
                  type="button"
                  onClick={openEverything}
                  aria-haspopup="dialog"
                  className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[0.6875rem] font-semibold text-muted"
                >
                  <PixelIcon name="more" className="h-[22px] w-[22px]" />
                  <span className="max-w-full truncate px-0.5">More</span>
                </button>
              </div>
            </nav>
          </div>

          {tourOpen && pathname === "/" && <Tour onDone={endTour} assistantName={assistantName} companion={skyling} />}
        </div>
        <Toaster />
        <PullToRefresh />
        <PwaClient userId={user.id} moneyLock={moneyLock} />
        <SettingsSheet />
        <EverythingSheet />
        <PasskeyOffer />
        <NavDirection />
        <Suspense fallback={null}>
          <QuickAdd />
        </Suspense>
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
  const { openJarvis, assistantName, skyling } = useShell();
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
          <CompanionGlyph companion={skyling} night={ownsNight(skyling)} className="lf-pixel h-6 w-6" />
          Ask {assistantName} anything…
          <kbd className="ml-auto rounded-md bg-surface-3 px-1.5 py-0.5 font-sans text-[0.6875rem] text-text-2">⌘J</kbd>
        </button>
      )}
      {demo && <span className="shrink-0 rounded-full bg-warning-soft px-3 py-1.5 text-xs text-warning">Sample data</span>}
      <Link
        href="/settings"
        data-tour="settings"
        aria-label="Settings"
        title="Settings"
        onClick={openSettings}
        aria-current={settingsActive ? "page" : undefined}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-soft hover:bg-surface-2",
          settingsActive ? "text-accent" : "text-text-2",
        )}
      >
        <PixelIcon name="cog" className="h-6 w-6" />
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
/** The same top row the chat uses (title in the middle, Settings and the skyling's profile on the right). */
function AssistantHeader({ name, skyling }: { name: string; skyling: CompanionKey | null }) {
  return (
    <header className="flex items-center gap-0.5 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4">
      <span className="h-11 w-11 shrink-0 lg:hidden" aria-hidden />
      <p className="min-w-0 flex-1 truncate px-1 text-center text-[0.9375rem] font-semibold lg:text-left">{name}</p>
      <Link
        href="/settings"
        aria-label="Settings"
        onClick={openSettings}
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
      >
        <PixelIcon name="cog" className="h-6 w-6" />
      </Link>
      <Link href="/jarvis/profile" aria-label="Skyling profile" className="lf-hop flex h-11 w-11 items-center justify-center">
        <span className="lf-chip-night h-9 w-9 overflow-hidden rounded-[0.75rem]">
          <CompanionGlyph companion={skyling} night={ownsNight(skyling)} className="lf-pixel h-8 w-8 translate-y-[3px]" />
        </span>
      </Link>
    </header>
  );
}

export function Mark({ className }: { className?: string }) {
  return <BrandMark className={cn("h-8 w-8", className)} alt="" />;
}

/** Opens the Jarvis drawer. With `send`, the prompt is sent immediately. */
export function AskJarvisButton({
  prompt,
  send,
  children,
  className,
  label,
}: {
  prompt?: string;
  send?: boolean;
  children: ReactNode;
  className?: string;
  /** What it does, for a button that shows only a picture. */
  label?: string;
}) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(prompt, { send })} className={cn("lf-touch", className)} aria-label={label}>
      {children}
    </button>
  );
}
