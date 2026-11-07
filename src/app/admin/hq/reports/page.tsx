import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../../redirects";

/** Moved to Work (ADR 0027). */
export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/work", "report");
}
