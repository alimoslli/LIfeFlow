"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LogOut, Menu, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive, moduleForPath } from "./nav-items";
import { JarvisDrawer } from "../jarvis/jarvis-drawer";
import type { JarvisAvailability } from "../jarvis/types";

type ShellCtx = { openJarvis: (prompt?: string) => void };
const Ctx = createContext<ShellCtx>({ openJarvis: () => {} });
export const useShell = () => useContext(Ctx);

export function AppShell({
  user,
  jarvis,
  logout,
  children,
}: {
  user: { name: string; email: string; accountKind: "standard" | "demo" };
  jarvis: JarvisAvailability;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; prompt?: string; key: number }>({ open: false, key: 0 });
  const openJarvis = useCallback((prompt?: string) => setDrawer((d) => ({ open: true, prompt, key: prompt ? d.key + 1 : d.key })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDrawer((d) => ({ ...d, open: !d.open }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onJarvisPage = pathname.startsWith("/jarvis");
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setNavOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-2.5 py-[7px] text-sm transition-colors",
              active ? "bg-surface font-medium text-text shadow-soft" : "text-text-2 hover:bg-surface-2 hover:text-text",
              item.href === "/jarvis" && !active && "text-accent",
            )}
          >
            <Icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-accent" : "text-muted group-hover:text-text-2", item.href === "/jarvis" && "text-accent")} strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-border px-3 py-3">
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <form action={logout}>
          <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={{ openJarvis }}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-bg lg:flex">
          <Brand />
          {nav}
          {footer}
        </aside>

        {/* Mobile drawer nav */}
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setNavOpen(false)} />
            <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-72 flex-col bg-bg shadow-xl">
              <div className="flex items-center justify-between pr-3">
                <Brand />
                <button className="rounded-md p-2 text-muted" onClick={() => setNavOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
              {footer}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
            <button className="-ml-1 rounded-md p-2 text-text-2" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-display text-lg font-medium">BudgetFlow</span>
          </header>
          {user.accountKind === "demo" && (
            <div className="border-b border-warning/20 bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">
              Demo workspace — every record here is sample data, separate from any real account.
            </div>
          )}
          <main className={cn("mx-auto w-full flex-1", onJarvisPage ? "max-w-none" : "max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10")}>{children}</main>
        </div>
      </div>

      {!onJarvisPage && (
        <button
          onClick={() => openJarvis()}
          className="fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full bg-accent py-2.5 pr-4 pl-3.5 text-sm font-medium text-accent-text shadow-lg transition-transform hover:scale-[1.02] sm:right-6 sm:bottom-6"
          aria-label="Ask Jarvis"
        >
          <Sparkles className="h-4 w-4" />
          Ask Jarvis
          <kbd className="ml-1 hidden rounded bg-white/15 px-1.5 text-[10px] sm:inline">⌘J</kbd>
        </button>
      )}
      {!onJarvisPage && (
        <JarvisDrawer key={drawer.key} open={drawer.open} onClose={() => setDrawer((d) => ({ ...d, open: false }))} module={moduleForPath(pathname)} availability={jarvis} initialPrompt={drawer.prompt} />
      )}
    </Ctx.Provider>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-5 py-5">
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" aria-hidden>
        <path d="M3 17c3-6 6-9 9-9s5 3 9-3" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M3 21c3-4 6-6 9-6s5 2 9-2" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.45" />
      </svg>
      <span className="font-display text-xl font-medium tracking-tight">BudgetFlow</span>
    </Link>
  );
}

/** Client button that opens the Jarvis drawer with an optional prefilled prompt. */
export function AskJarvisButton({ prompt, children, className }: { prompt?: string; children: ReactNode; className?: string }) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(prompt)} className={className}>
      {children}
    </button>
  );
}
