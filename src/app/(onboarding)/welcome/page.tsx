import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { billingConfig, FREE_JARVIS_PER_DAY, PRO_FEATURES } from "@/server/billing";
import { dayClockData } from "@/server/services/day-clock";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  if (user.preferences?.onboarding !== "pending") redirect("/");
  // Limits are shown only once paid plans are switched on; until then everything is free.
  const plan = { paid: !!billingConfig(), freeChatsPerDay: FREE_JARVIS_PER_DAY, proFeatures: Object.values(PRO_FEATURES) };
  // their own sky (no money on it), which fills up as they add things in "Build your sky"
  const clock = await withCurrentUser((s, u) => dayClockData(s, u.timezone || "UTC", new Date(), { money: false }));
  return <Onboarding firstName={user.name.split(" ")[0]} plan={plan} clock={clock} />;
}
