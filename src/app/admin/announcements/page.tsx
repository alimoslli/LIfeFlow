import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../redirects";

/** Announcements are now a part of the People page (ADR 0027). */
export default async function AdminAnnouncements({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/people", "announcements");
}
