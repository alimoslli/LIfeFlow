import type { Metadata } from "next";
import { aiAllowed } from "@/lib/ai-consent";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { inAppSetup, SETUP_COOKIE } from "@/lib/setup-mode";
import { isCompanionChoice } from "@/lib/companions";
import { requireUserForWelcome, withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { canvasConnection } from "@/server/integrations/canvas";
import { googleConfig } from "@/server/integrations/google";
import { microsoftConfig } from "@/server/integrations/microsoft";
import { plaidConfig } from "@/server/integrations/plaid";
import { dayClockData } from "@/server/services/day-clock";
import { integrationStatus } from "@/server/services/integrations";
import { getDb } from "@/server/db/client";
import { accountHasPassword } from "@/server/services/accounts";
import { AgeBlocked } from "./age-blocked";
import { Onboarding, type Saved } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

const RESULTS = ["connected", "denied", "failed", "missing_scopes", "admin_consent", "not_configured", "use_main_site"] as const;

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ connected?: string; result?: string }> }) {
  const user = await requireUserForWelcome();
  // under 13: locked for this account, whatever year is typed later, also after setup (owner, 2026-11-10); the lock screen
  // comes before "setup is done", or a locked finished account would bounce between / and here
  if (user.preferences?.ageBlockedAt) return <AgeBlocked withPassword={await accountHasPassword(getDb(), user.id)} />;
  if (user.preferences?.onboarding !== "pending") redirect("/");
  // setup inside the app (owner, 2026-11-12): the providers still come back to this fixed address, which sends on to Today
  if (inAppSetup((await cookies()).get(SETUP_COOKIE)?.value)) {
    const q = await searchParams;
    const keep = new URLSearchParams();
    if ((q.connected === "google" || q.connected === "outlook") && RESULTS.includes(q.result as (typeof RESULTS)[number])) {
      keep.set("connected", q.connected);
      keep.set("result", q.result!);
    }
    redirect(keep.size ? `/?${keep}` : "/");
  }
  // their own sky (no money on it), and what's connected already (coming back from Google or Microsoft)
  const { clock, list, canvas } = await withCurrentUser(async (s, u) => {
    const [clock, list, canvas] = await series(
      () => dayClockData(s, u.timezone || "UTC", new Date(), { money: false }),
      () => integrationStatus(s),
      () => canvasConnection(s),
    );
    return { clock, list, canvas };
  });
  const on = (provider: string) => (list.find((i) => i.provider === provider)?.status ?? "not_connected") !== "not_connected";
  const p = user.preferences ?? {};
  const saved: Saved = {
    companion: isCompanionChoice(p.companion) ? p.companion : null,
    name: p.assistantName ?? "",
    style: p.assistantStyle === "coach" || p.assistantStyle === "direct" ? p.assistantStyle : "friend",
    lifeStage: p.lifeStage ?? null,
    birthDate: p.birthDate ?? "",
    school: p.school ?? "",
    job: p.welcomeJob ?? "",
  };
  const { connected, result } = await searchParams;
  const back =
    (connected === "google" || connected === "outlook") && RESULTS.includes(result as (typeof RESULTS)[number])
      ? { provider: connected as "google" | "outlook", result: result as (typeof RESULTS)[number] }
      : null;
  return (
    <Onboarding
      firstName={user.name.split(" ")[0]}
      aiOk={aiAllowed(user.preferences)}
      clock={clock}
      saved={saved}
      back={back}
      sources={{
        google: { available: !!googleConfig(), connected: on("google") },
        outlook: { available: !!microsoftConfig(), connected: on("outlook") },
        canvas: { available: true, connected: !!canvas },
        bank: { available: !!plaidConfig(), connected: on("plaid") },
      }}
    />
  );
}
