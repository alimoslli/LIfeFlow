import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { usersCsv } from "@/server/services/admin";

export const dynamic = "force-dynamic";

/** Every account as a CSV download (accounts only, never their content). Owner only; anyone else gets a 404. Logged. */
export async function GET() {
  // The shared gate (also refuses a session that skipped the second step); notFound() answers 404.
  const admin = await requireAdmin();
  const csv = await usersCsv(getDb(), admin);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lifeflow-users-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
