import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Brain,
  ChevronRight,
  Gift,
  LayoutDashboard,
  Link2,
  Lock,
  MessageCircleHeart,
  MessageSquare,
  Palette,
  Shield,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { billingConfig } from "@/server/billing";
import { smsConfig } from "@/server/integrations/twilio";
import type { LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { ReplayTour } from "@/components/replay-tour";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { adminFor } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listPlaidConnections } from "@/server/integrations/plaid";
import { integrationStatus } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Settings" };

type Row = { href: string; icon: LucideIcon; tint: string; label: string; detail?: string };
/** Every row's icon tile uses the one green theme (audit A23), readable in light and dark. */
const TILE = "bg-accent-soft text-accent";

/** Settings home: a short grouped list, like the phone's own Settings. */
export default async function SettingsHome() {
  const d = await withCurrentUser(async (s, u) => {
    const [list, banks] = await series(
      () => integrationStatus(s),
      () => listPlaidConnections(s),
    );
    const google = list.find((i) => i.provider === "google")?.connections.length ?? 0;
    return { id: u.id, name: u.name, email: u.email, assistant: assistantProfile(u.preferences).name, connected: google + banks.length };
  });
  // Only the owner sees this row (ADR 0022); for everyone else it doesn't exist.
  const isAdmin = !!(await adminFor(getDb(), d.id).catch(() => null));
  const initials = d.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const groups: Row[][] = [
    [
      { href: "/settings/profile", icon: Palette, tint: TILE, label: "Profile & appearance" },
      { href: "/settings/notifications", icon: Bell, tint: TILE, label: "Notifications" },
      { href: "/settings/security", icon: Lock, tint: TILE, label: "Face ID & passwords" },
    ],
    [
      { href: "/settings/jarvis", icon: Sparkles, tint: TILE, label: nameAtStart(d.assistant), detail: "Personality" },
      ...(billingConfig() ? [{ href: "/settings/plan", icon: Star, tint: TILE, label: "Plan" }] : []),
      ...(smsConfig() ? [{ href: "/settings/text", icon: MessageSquare, tint: TILE, label: `Text ${d.assistant}` }] : []),
      { href: "/jarvis/memory", icon: Brain, tint: TILE, label: `What ${d.assistant} knows` },
    ],
    [
      {
        href: "/settings/integrations",
        icon: Link2,
        tint: TILE,
        label: "Connected accounts",
        detail: d.connected ? `${d.connected} connected` : "None yet",
      },
    ],
    [
      { href: "/settings/data", icon: Shield, tint: TILE, label: "Privacy & data" },
      { href: "/settings/trash", icon: Trash2, tint: TILE, label: "Recently deleted" },
    ],
    [
      { href: "/settings/invite", icon: Gift, tint: TILE, label: "Invite friends" },
      { href: "/settings/feedback", icon: MessageCircleHeart, tint: TILE, label: "Send feedback" },
    ],
    ...(isAdmin ? [[{ href: "/admin", icon: LayoutDashboard, tint: TILE, label: "Admin", detail: "Owner only" }]] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[2.375rem] leading-tight font-medium tracking-tight">Settings</h1>
      <Link href="/settings/profile" className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-soft">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-hero text-lg font-semibold text-hero-text">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem] font-semibold">{d.name}</span>
          <span className="block truncate text-sm text-muted">{d.email}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" />
      </Link>
      {groups.map((g, i) => (
        <ul key={i} className="divide-y divide-border overflow-hidden rounded-3xl bg-surface shadow-soft">
          {g.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-surface-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${r.tint}`}>
                  <r.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[1rem]">{r.label}</span>
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
