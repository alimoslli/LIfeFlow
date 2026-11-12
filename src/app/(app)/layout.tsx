import { aiAllowed } from "@/lib/ai-consent";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { assistantProfile } from "@/lib/assistant";
import { lifeAreas } from "@/lib/life";
import { cookies, headers } from "next/headers";
import { inAppSetup, SETUP_COOKIE } from "@/lib/setup-mode";
import { requireUser, waitingNow } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { unreadCount } from "@/server/services/proactive/engine";
import { activeAnnouncement } from "@/server/services/announcements";
import { getDb } from "@/server/db/client";
import { AnnouncementBanner } from "@/components/shell/announcement-banner";
import { currentInstant } from "@/lib/dates";

const ACCOUNT_PAGES = ["/settings/profile", "/settings/security", "/settings/data"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ account: true });
  const path = (await headers()).get("x-lf-path") ?? "";
  if (user.preferences?.onboarding === "pending") {
    // setup happens on Today itself (owner, 2026-11-12), so the rest of the app waits; or the old welcome screens
    if (!inAppSetup((await cookies()).get(SETUP_COOKIE)?.value)) redirect("/welcome");
    if (path && path !== "/") redirect("/");
  }
  // On the waitlist (the owner's switch on, setup done): only their account, security and privacy pages; the rest waits.
  // The pages' own data calls refuse them too; this only sends them to their place in line.
  if ((await waitingNow(user)) && !ACCOUNT_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) redirect("/waitlist");
  const unread = await withUser(user.id, (s) => unreadCount(s)).catch(() => 0);
  const announcement = await activeAnnouncement(getDb());
  const renderedAt = currentInstant().getTime();
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, accountKind: user.accountKind, timezone: user.timezone }}
      tour={user.preferences?.tour === "pending"}
      settingUp={user.preferences?.onboarding === "pending"}
      assistantName={assistantProfile(user.preferences, user.timezone).name}
      assistantNamed={assistantProfile(user.preferences, user.timezone).named}
      companion={user.preferences?.companion}
      aiConsent={aiAllowed(user.preferences)}
      moneyLock={user.preferences?.moneyLock?.enabled === true}
      unread={unread}
      areas={lifeAreas(user.preferences?.lifeStage)}
      renderedAt={renderedAt}
    >
      {announcement && <AnnouncementBanner a={announcement} />}
      {children}
    </AppShell>
  );
}
