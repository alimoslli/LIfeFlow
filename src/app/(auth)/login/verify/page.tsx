import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/current-user";
import { CHALLENGE_COOKIE } from "@/server/auth/two-factor";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  if (!(await cookies()).get(CHALLENGE_COOKIE)) redirect("/login");
  const { next } = await searchParams;
  return <VerifyForm next={next} />;
}
