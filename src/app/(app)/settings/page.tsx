import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { ReplayTour } from "@/components/replay-tour";
import { DoorGrid } from "@/components/settings/door-grid";
import { MySkyling } from "@/components/skylings/sprite";
import { settingsDoors } from "./doors-data";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings home: your skyling and your name, then doors (owner, 2026-11-10: nothing here may look like a phone's own
 * Settings list). The same doors come up from below as a sheet when the gear is tapped (settings-sheet.tsx).
 */
export default async function SettingsHome() {
  const d = await settingsDoors();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[2.375rem] leading-tight font-medium tracking-tight">Settings</h1>
      <Link href="/settings/profile" className="flex items-center gap-4 rounded-[1.375rem] bg-surface p-3.5 shadow-soft">
        <span className="lf-chip-night flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-[1.25rem]">
          <MySkyling className="h-14 w-14" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[1.5rem] leading-tight font-medium">{d.name}</span>
          <span className="block truncate text-sm text-muted">{d.email}</span>
        </span>
      </Link>
      <DoorGrid doors={d.doors} className="sm:grid-cols-3" />
      <div className="flex flex-col items-center gap-3 pt-2">
        <SignOutButton />
        <ReplayTour />
        <p className="flex flex-wrap justify-center gap-x-4 text-xs text-muted">
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-text">
            Privacy Policy
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-text">
            Terms
          </Link>
          <Link href="/integrity" className="inline-flex min-h-11 items-center hover:text-text">
            Academic integrity
          </Link>
        </p>
      </div>
    </div>
  );
}
