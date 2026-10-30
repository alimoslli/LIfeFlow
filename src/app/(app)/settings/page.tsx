import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Brain, ChevronRight, Link2, Lock, Palette, Shield, Sparkles, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { ReplayTour } from "@/components/replay-tour";
import { assistantProfile } from "@/lib/assistant";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listPlaidConnections } from "@/server/integrations/plaid";
import { integrationStatus } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Settings" };

type Row = { href: string; icon: LucideIcon; tint: string; label: string; detail?: string };

/** Settings home: a short grouped list, like the phone's own Settings. */
export default async function SettingsHome() {
  const d = await withCurrentUser(async (s, u) => {
    const [list, banks] = await series(
      () => integrationStatus(s),
      () => listPlaidConnections(s),
    );
    const google = list.find((i) => i.provider === "google")?.connections.length ?? 0;
    return { name: u.name, email: u.email, assistant: assistantProfile(u.preferences).name, connected: google + banks.length };
  });
  const initials = d.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const groups: Row[][] = [
    [
      { href: "/settings/profile", icon: Palette, tint: "bg-[#5b7cfa]", label: "Profile & appearance" },
      { href: "/settings/notifications", icon: Bell, tint: "bg-[#ef5b5b]", label: "Notifications" },
      { href: "/settings/security", icon: Lock, tint: "bg-[#6b7280]", label: "Face ID & passwords" },
    ],
    [
      { href: "/settings/jarvis", icon: Sparkles, tint: "bg-accent", label: d.assistant, detail: "Personality" },
      { href: "/jarvis/memory", icon: Brain, tint: "bg-[#8b5cf6]", label: `What ${d.assistant} knows` },
    ],
    [
      {
        href: "/settings/integrations",
        icon: Link2,
        tint: "bg-[#0ea5e9]",
        label: "Connected accounts",
        detail: d.connected ? `${d.connected} connected` : "None yet",
      },
    ],
    [
      { href: "/settings/data", icon: Shield, tint: "bg-[#10b981]", label: "Privacy & data" },
      { href: "/settings/trash", icon: Trash2, tint: "bg-[#9ca3af]", label: "Recently deleted" },
    ],
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[38px] leading-tight font-medium tracking-tight">Settings</h1>
      <Link href="/settings/profile" className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-soft">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-hero text-lg font-semibold text-hero-text">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">{d.name}</span>
          <span className="block truncate text-sm text-muted">{d.email}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" />
      </Link>
      {groups.map((g, i) => (
        <ul key={i} className="divide-y divide-border overflow-hidden rounded-3xl bg-surface shadow-soft">
          {g.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-surface-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white ${r.tint}`}>
                  <r.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px]">{r.label}</span>
                {r.detail && <span className="shrink-0 text-sm text-muted">{r.detail}</span>}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ))}
      <div className="flex flex-col items-center gap-3 pt-2">
        <SignOutButton />
        <ReplayTour />
        <p className="flex gap-4 text-xs text-muted">
          <Link href="/privacy" className="hover:text-text">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
          <Link href="/integrity" className="hover:text-text">
            Academic integrity
          </Link>
        </p>
      </div>
    </div>
  );
}
