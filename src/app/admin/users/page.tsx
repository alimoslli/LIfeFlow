import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../redirects";

/** The users list is now the People part of the People page (ADR 0027). /admin/users/[id] and the export stay. */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/people", "people", { status: "status" });
}
