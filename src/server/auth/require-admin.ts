import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "../db/client";
import { adminFor, type Admin } from "./admin";
import { getSessionUser } from "./current-user";

/**
 * Every /admin page and every admin action calls this first (never rely on a layout alone). Anyone who isn't the
 * owner, signed in or not, gets the same 404 as a page that doesn't exist.
 */
export async function requireAdmin(): Promise<Admin> {
  const user = await getSessionUser();
  const admin = user ? await adminFor(getDb(), user.id) : null;
  if (!admin) notFound();
  return admin;
}
