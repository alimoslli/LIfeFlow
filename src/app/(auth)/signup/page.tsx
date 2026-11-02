import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appleConfig } from "@/server/auth/apple";
import { getSessionUser } from "@/server/auth/current-user";
import { googleSignInConfig } from "@/server/auth/google-signin";
import { getDb } from "@/server/db/client";
import { inviterFor } from "@/server/services/invites";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { invite } = await searchParams;
  const inviter = invite ? await inviterFor(getDb(), invite) : null;
  return (
    <AuthForm
      mode="signup"
      apple={!!appleConfig()}
      google={!!googleSignInConfig()}
      invite={inviter ? invite?.trim().toLowerCase() : undefined}
      notice={inviter ? { text: `${inviter.firstName} invited you to LifeFlow.`, tone: "info" } : undefined}
    />
  );
}
