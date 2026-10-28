import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appleConfig } from "@/server/auth/apple";
import { getSessionUser } from "@/server/auth/current-user";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/");
  return <AuthForm mode="signup" apple={!!appleConfig()} />;
}
