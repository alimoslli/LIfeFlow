import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "../db/client";
import { adminFor, type Admin } from "./admin";
import { getSessionUser } from "./current-user";
import { SESSION_COOKIE, sessionSkippedSecondStep } from "./sessions";

/**
 * Every /admin page and every admin action calls this first (never rely on a layout alone). Anyone who isn't the
 * owner, signed in or not, gets the same 404 as a page that doesn't exist.
 */
export async function requireAdmin(): Promise<Admin> {
  const user = await getSessionUser();
  const admin = user ? await adminFor(getDb(), user.id) : null;
  if (!admin) notFound();
  // A session that skipped the second step (a remembered phone, or Google) is never enough for the admin area.
  if (await sessionSkippedSecondStep(getDb(), (await cookies()).get(SESSION_COOKIE)?.value ?? "")) notFound();
  return admin;
}
