import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../redirects";

/** Now a part of the App page (ADR 0027). */
export default async function Moved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/app", "activity");
}
