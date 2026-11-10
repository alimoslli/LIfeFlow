import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { adminFor } from "@/server/auth/admin";
import { withCurrentUser } from "@/server/auth/current-user";
import { billingConfig } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { series } from "@/server/db/series";
import { listPlaidConnections } from "@/server/integrations/plaid";
import { smsConfig } from "@/server/integrations/twilio";
import { integrationStatus } from "@/server/services/integrations";
import type { Door } from "@/components/settings/door-grid";

export type SettingsDoors = { name: string; email: string; doors: Door[] };

/**
 * Settings as doors (owner, 2026-11-10: nothing in the app may look like a phone's own Settings list): what each one
 * is called, its picture and, where there is one, a line that says how things stand. Plain data, for the page and for
 * the sheet that comes up from below.
 */
export async function settingsDoors(): Promise<SettingsDoors> {
  const d = await withCurrentUser(async (s, u) => {
    const [list, banks] = await series(
      () => integrationStatus(s),
      () => listPlaidConnections(s),
    );
    const google = list.find((i) => i.provider === "google")?.connections.length ?? 0;
    return { id: u.id, name: u.name, email: u.email, assistant: assistantProfile(u.preferences, u.timezone).name, connected: google + banks.length };
  });
  // Only the owner sees this door (ADR 0022); for everyone else it doesn't exist.
  const isAdmin = !!(await adminFor(getDb(), d.id).catch(() => null));
  const doors: Door[] = [
    { href: "/settings/profile", icon: "person", label: "You and the look", detail: "Name, theme, text size" },
    { href: "/settings/notifications", icon: "bell", label: "Notifications", detail: "What reaches you, and when" },
    { href: "/settings/jarvis", icon: "skyling", label: nameAtStart(d.assistant), detail: "Its name and how it talks" },
    { href: "/jarvis/memory", icon: "idea", label: `What ${d.assistant} knows`, detail: "See it, fix it, forget it" },
    { href: "/settings/integrations", icon: "plug", label: "Connected", detail: d.connected ? `${d.connected} connected` : "Nothing yet" },
    { href: "/settings/security", icon: "lock", label: "Sign-in and locks", detail: "Face ID, passwords, two-step" },
    ...(billingConfig() ? [{ href: "/settings/plan", icon: "star", label: "Plan" } satisfies Door] : []),
    ...(smsConfig() ? [{ href: "/settings/text", icon: "chat", label: `Text ${d.assistant}` } satisfies Door] : []),
    { href: "/settings/data", icon: "shield", label: "Privacy and your data", detail: "Download, bring back or delete" },
    { href: "/settings/invite", icon: "gift", label: "Invite friends", detail: "Your own link to share" },
    { href: "/settings/feedback", icon: "health", label: "Send feedback", detail: "It goes straight to the team" },
    ...(isAdmin ? [{ href: "/admin", icon: "cog", label: "Admin", detail: "Owner only" } satisfies Door] : []),
  ];
  return { name: d.name, email: d.email, doors };
}
