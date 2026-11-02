import { getSessionUser } from "@/server/auth/current-user";
import { adminFor } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { usersCsv } from "@/server/services/admin";

export const dynamic = "force-dynamic";

/** Every account as a CSV download (accounts only, never their content). Owner only; anyone else gets a 404. Logged. */
export async function GET() {
  const user = await getSessionUser();
  const admin = user ? await adminFor(getDb(), user.id) : null;
  if (!admin) return new Response("Not found", { status: 404 });
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
