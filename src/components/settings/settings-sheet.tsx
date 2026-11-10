"use client";
import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { settingsDoorsAction } from "@/app/(app)/settings/actions";
import type { SettingsDoors } from "@/app/(app)/settings/doors-data";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { MySkyling } from "@/components/skylings/sprite";
import { Sheet } from "@/components/ui/sheet";
import { DoorGrid } from "./door-grid";

const OPEN = "lf-open-settings";

/**
 * For the gear: a plain tap brings Settings up from below instead of leaving the page. It stays a real link, so a new
 * tab, a long press and a screen reader all still reach /settings.
 */
export function openSettings(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  window.dispatchEvent(new Event(OPEN));
}

/** The gear, for a page that is drawn on the server: the same link, opening the sheet on a plain tap. */
export function SettingsGear({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link href="/settings" aria-label="Settings" onClick={openSettings} className={className}>
      {children}
    </Link>
  );
}

/**
 * Settings, coming up from below over whatever you were doing (owner, 2026-11-10): your skyling and your name, then
 * the doors. Pull it down and you're back where you were. On a laptop it's a small window in the middle.
 */
export function SettingsSheet() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SettingsDoors | null>(null);
  useEffect(() => {
    const show = () => {
      setOpen(true);
      // fresh every time it opens: a new connection or a new name shows at once
      settingsDoorsAction()
        .then(setData)
        .catch(() => {});
    };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onClose={close} label="Settings">
      <div className="overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-5">
        <Link href="/settings/profile" onClick={close} className="mb-4 flex items-center gap-3 rounded-[1.375rem] p-1">
          <span className="lf-chip-night flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-[1.125rem]">
            <MySkyling className="h-12 w-12" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[1.5rem] leading-tight font-medium">{data?.name ?? "Settings"}</span>
            <span className="block truncate text-sm text-muted">{data?.email ?? " "}</span>
          </span>
        </Link>
        {data ? (
          <DoorGrid doors={data.doors} onPick={close} />
        ) : (
          <ul className="grid grid-cols-2 gap-3" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="min-h-[6.25rem] animate-pulse rounded-[1.375rem] bg-surface shadow-soft" />
            ))}
          </ul>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Link href="/settings" onClick={close} className="inline-flex min-h-11 items-center text-sm text-text-2 underline-offset-4 hover:underline">
            Open as a page
          </Link>
          <SignOutButton />
        </div>
      </div>
    </Sheet>
  );
}
