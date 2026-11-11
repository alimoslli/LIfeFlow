import { getAccountUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { exportBusy, exportStream } from "@/server/services/data-export";
import { forEachTransactionPage, toCsv } from "@/server/services/finance/transactions";

export const dynamic = "force-dynamic";

/** Said as plain text, since the browser shows it in place of the download. */
const MONEY_LOCKED = "Unlock Money first, then download your data again.";

const CSV_HEADER = ["date", "description", "merchant", "amount", "kind", "category", "account", "pending", "source"];

/** Every transaction, newest first, one bounded page at a time inside the user's own scope (never one big string, never cut off). */
export function transactionsCsvStream(userId: string) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(enc.encode(toCsv(CSV_HEADER, [])));
        await withUser(userId, (s) =>
          forEachTransactionPage(s, {}, (rows) => {
            const body = toCsv(
              [],
              rows.map((r) => [
                r.date,
                r.description,
                r.merchantName,
                (r.amountCents / 100).toFixed(2),
                r.kind,
                r.categoryName,
                r.accountName,
                r.pending,
                r.source,
              ]),
            );
            controller.enqueue(enc.encode("\n" + body.replace(/^\n/, "")));
          }),
        );
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

/**
 * Full personal data export (JSON, every user table: services/data-export.ts) or transactions CSV. Secrets and
 * hashes are never included. Both hold money, so both wait while Money is locked. The JSON is streamed table by
 * table in batches, so years of transactions never build one huge string (and Vercel's 4.5 MB limit only applies
 * to responses that aren't streamed).
 */
export async function GET(req: Request) {
  try {
    const user = await getAccountUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (await moneyLocked(user)) return new Response(MONEY_LOCKED, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
    await enforceRateLimit(`export:${user.id}`, 10, 3600);
    const format = new URL(req.url).searchParams.get("format");
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "transactions.csv") {
      await withUser(user.id, (s) => audit(s, "user", "data.export.transactions_csv"));
      return new Response(transactionsCsvStream(user.id), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="lifeflow-transactions-${stamp}.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    if (exportBusy(user.id)) throw new HttpError(429, "A download of your data is already running. Wait for it to finish, then try again.");
    await withUser(user.id, (s) => audit(s, "user", "data.export.json"));
    return new Response(exportStream(user.id, user), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="lifeflow-export-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
