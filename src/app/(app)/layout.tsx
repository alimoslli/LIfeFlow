import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/current-user";
import { jarvisStatus } from "@/server/jarvis/providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const status = jarvisStatus();
  return (
    <AppShell user={{ name: user.name, email: user.email, accountKind: user.accountKind }} jarvis={{ available: status.available, reason: status.reason, model: status.model, provider: status.provider }}>
      {children}
    </AppShell>
  );
}
