import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { exportUserData } from "@/server/services/data-export";
import { queryTransactions, toCsv } from "@/server/services/finance/transactions";

export const dynamic = "force-dynamic";

/** Full personal data export (JSON, every user table: services/data-export.ts) or transactions CSV. Secrets and hashes are never included. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`export:${user.id}`, 10, 3600);
    const format = new URL(req.url).searchParams.get("format");
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "transactions.csv") {
      const rows = await withUser(user.id, async (s) => {
        await audit(s, "user", "data.export.transactions_csv");
        return queryTransactions(s, { limit: 5000 });
      });
      const csv = toCsv(
        ["date", "description", "merchant", "amount", "kind", "category", "account", "pending", "source"],
        rows.map((r) => [r.date, r.description, r.merchantName, (r.amountCents / 100).toFixed(2), r.kind, r.categoryName, r.accountName, r.pending, r.source]),
      );
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lifeflow-transactions-${stamp}.csv"` },
      });
    }
    const data = await withUser(user.id, async (s) => {
      const out = await exportUserData(s, user);
      await audit(s, "user", "data.export.json");
      return out;
    });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="lifeflow-export-${stamp}.json"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
