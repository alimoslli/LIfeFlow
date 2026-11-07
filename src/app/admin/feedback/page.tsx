import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../redirects";

/** Feedback is now a part of the People page (ADR 0027). The old status and kind filters keep working. */
export default async function AdminFeedback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/people", "feedback", { status: "fstatus", kind: "fkind" });
}
