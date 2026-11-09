import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, FREE_JARVIS_PER_DAY, PRO_FEATURES } from "@/server/billing";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  if (user.preferences?.onboarding !== "pending") redirect("/");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // Limits are shown only once paid plans are switched on; until then everything is free.
  const plan = { paid: !!billingConfig(), freeChatsPerDay: FREE_JARVIS_PER_DAY, proFeatures: Object.values(PRO_FEATURES) };
  return <Onboarding firstName={user.name.split(" ")[0]} theme={theme} plan={plan} tz={user.timezone ?? "UTC"} />;
}
