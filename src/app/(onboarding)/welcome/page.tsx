import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireUser } from "@/server/auth/current-user";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  if (user.preferences?.onboarding !== "pending") redirect("/");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <Onboarding firstName={user.name.split(" ")[0]} theme={theme} />;
}
