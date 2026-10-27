"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NAV, isActive, moduleForPath } from "./nav-items";
import { JarvisDrawer } from "../jarvis/jarvis-drawer";
import type { JarvisAvailability } from "../jarvis/types";

type ShellCtx = { openJarvis: (prompt?: string, opts?: { send?: boolean }) => void };
const Ctx = createContext<ShellCtx>({ openJarvis: () => {} });
export const useShell = () => useContext(Ctx);

type Drawer = { open: boolean; prompt?: string; send?: boolean; key: number };

export function AppShell({
  user,
  jarvis,
  children,
}: {
  user: { name: string; email: string; accountKind: "standard" | "demo" };
  jarvis: JarvisAvailability;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState<Drawer>({ open: false, key: 0 });
  const openJarvis = useCallback(
    (prompt?: string, opts?: { send?: boolean }) => setDrawer((d) => ({ open: true, prompt, send: opts?.send, key: prompt ? d.key + 1 : d.key })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDrawer((d) => ({ ...d, open: !d.open, prompt: undefined, send: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onJarvisPage = pathname.startsWith("/jarvis");
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const settingsActive = pathname.startsWith("/settings");

  return (
    <Ctx.Provider value={{ openJarvis }}>
      <div className="flex min-h-dvh">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center py-6 md:flex">
          <Link href="/" aria-label="LifeFlow home" className="mb-8">
            <Mark />
          </Link>
          <nav className="flex flex-col gap-1.5" aria-label="Main">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("group flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-medium transition-colors", active ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text")}
                >
                  <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={active ? 2 : 1.6} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/settings"
            title={`${user.name} · Settings`}
            aria-label="Settings"
            className={cn("mt-auto flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold transition-shadow", settingsActive ? "bg-accent text-accent-text" : "bg-surface-3 text-text-2 hover:shadow-soft")}
          >
            {initials}
          </Link>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {user.accountKind === "demo" && (
            <div className="px-4 pt-3 text-center text-[11px] tracking-wide text-muted md:pt-4">Test account · everything here is sample data</div>
          )}
          <main className={cn("mx-auto w-full flex-1", onJarvisPage ? "max-w-none" : "max-w-5xl px-5 pt-6 pb-32 sm:px-8 md:pt-10 md:pb-16")}>{children}</main>
        </div>
      </div>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium", active ? "text-accent" : "text-muted")}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.6} />
                {item.label}
              </Link>
            );
          })}
          <Link href="/settings" aria-label="Settings" className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium", settingsActive ? "text-accent" : "text-muted")}>
            <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-semibold", settingsActive ? "bg-accent text-accent-text" : "bg-surface-3 text-text-2")}>{initials}</span>
            You
          </Link>
        </div>
      </nav>

      {!onJarvisPage && (
        <JarvisDrawer
          key={drawer.key}
          open={drawer.open}
          onClose={() => setDrawer((d) => ({ ...d, open: false }))}
          module={moduleForPath(pathname)}
          availability={jarvis}
          initialPrompt={drawer.prompt}
          autoSend={drawer.send}
        />
      )}
    </Ctx.Provider>
  );
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="10" className="fill-accent" />
      <path d="M8 19.5c2.6-4.6 5.2-6.9 8-6.9s4.6 2.2 8-2.6" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M8 24c2.6-3 5.2-4.5 8-4.5s4.6 1.4 8-1.7" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/** Opens the Jarvis drawer. With `send`, the prompt is sent immediately. */
export function AskJarvisButton({ prompt, send, children, className }: { prompt?: string; send?: boolean; children: ReactNode; className?: string }) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(prompt, { send })} className={className}>
      {children}
    </button>
  );
}
