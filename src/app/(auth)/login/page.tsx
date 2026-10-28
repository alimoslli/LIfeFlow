import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appleConfig } from "@/server/auth/apple";
import { getSessionUser } from "@/server/auth/current-user";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "apple-unavailable": "Sign in with Apple isn't set up on this server yet. Use your email and password.",
  "apple-expired": "That Sign in with Apple attempt expired. Please try again.",
  "apple-failed": "Sign in with Apple didn't work. Please try again, or use your email and password.",
  "rate-limited": "Too many attempts. Please wait a few minutes and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string; email?: string; error?: string; reset?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { next, link, email, error, reset } = await searchParams;
  const notice =
    link === "apple"
      ? { text: "You already have a LifeFlow account with this email. Sign in once to link Sign in with Apple to it.", tone: "info" as const }
      : reset
        ? { text: "Your password was changed and you were signed out everywhere. Sign in with the new password.", tone: "info" as const }
        : error && ERRORS[error]
          ? { text: ERRORS[error], tone: "danger" as const }
          : undefined;
  return <AuthForm mode="login" next={next} apple={!!appleConfig()} notice={notice} email={link === "apple" ? email?.slice(0, 254) : undefined} />;
}
