import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../../redirects";

/** Moved to Work (ADR 0027). Mission pages (/admin/hq/missions/[id]) stay. */
export default async function Missions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/work", "missions");
}
