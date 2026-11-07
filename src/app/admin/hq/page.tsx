import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../redirects";

/** The HQ office is now the Office at /admin (ADR 0027). */
export default async function HqHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin");
}
