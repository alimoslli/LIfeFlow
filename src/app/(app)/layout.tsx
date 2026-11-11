import { aiAllowed } from "@/lib/ai-consent";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { assistantProfile } from "@/lib/assistant";
import { lifeAreas } from "@/lib/life";
import { headers } from "next/headers";
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
  if (user.preferences?.onboarding === "pending") redirect("/welcome");
  // On the waitlist (the owner's switch on, setup done): only their account, security and privacy pages; the rest waits.
  // The pages' own data calls refuse them too; this only sends them to their place in line.
  const path = (await headers()).get("x-lf-path") ?? "";
  if ((await waitingNow(user)) && !ACCOUNT_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) redirect("/waitlist");
  const unread = await withUser(user.id, (s) => unreadCount(s)).catch(() => 0);
  const announcement = await activeAnnouncement(getDb());
  const renderedAt = currentInstant().getTime();
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, accountKind: user.accountKind, timezone: user.timezone }}
      tour={user.preferences?.tour === "pending"}
      assistantName={assistantProfile(user.preferences, user.timezone).name}
      assistantNamed={assistantProfile(user.preferences, user.timezone).named}
      companion={user.preferences?.companion}
      aiConsent={aiAllowed(user.preferences)}
      unread={unread}
      areas={lifeAreas(user.preferences?.lifeStage)}
      renderedAt={renderedAt}
    >
      {announcement && <AnnouncementBanner a={announcement} />}
      {children}
    </AppShell>
  );
}
