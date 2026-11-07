import { requireAdmin } from "@/server/auth/require-admin";
import { redirectKeeping } from "../../redirects";

/** The Founder Office is now Work: what needs the owner (ADR 0027). */
export default async function FounderOffice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return redirectKeeping(searchParams, "/admin/work");
}
