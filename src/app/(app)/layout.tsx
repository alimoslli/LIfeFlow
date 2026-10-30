import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { assistantProfile } from "@/lib/assistant";
import { lifeAreas } from "@/lib/life";
import { requireUser } from "@/server/auth/current-user";
import { jarvisStatus } from "@/server/jarvis/providers";
import { withUser } from "@/server/db/with-user";
import { unreadCount } from "@/server/services/proactive/engine";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.preferences?.onboarding === "pending") redirect("/welcome");
  const status = jarvisStatus();
  const unread = await withUser(user.id, (s) => unreadCount(s)).catch(() => 0);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, accountKind: user.accountKind }}
      jarvis={{ available: status.available, reason: status.reason, model: status.model, provider: status.provider }}
      tour={user.preferences?.tour === "pending"}
      assistantName={assistantProfile(user.preferences).name}
      unread={unread}
      areas={lifeAreas(user.preferences?.lifeStage)}
    >
      {children}
    </AppShell>
  );
}
