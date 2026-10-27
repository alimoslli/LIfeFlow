import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/current-user";
import * as schema from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { queryTransactions, toCsv } from "@/server/services/finance/transactions";

export const dynamic = "force-dynamic";

/** Full personal data export (JSON) or transactions CSV. Credentials are never included. */
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
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="budgetflow-transactions-${stamp}.csv"` } });
    }
    const data = await withUser(user.id, async (s) => {
      const tables = {
        accounts: schema.financialAccounts,
        transactions: schema.transactions,
        categories: schema.categories,
        budgets: schema.budgets,
        recurring: schema.recurringItems,
        goals: schema.financialGoals,
        holdings: schema.holdings,
        courses: schema.courses,
        assignments: schema.assignments,
        materials: schema.courseMaterials,
        events: schema.calendarEvents,
        tasks: schema.tasks,
        projects: schema.projects,
        notes: schema.notes,
        employers: schema.employers,
        shifts: schema.workShifts,
        paychecks: schema.paychecks,
        memories: schema.memories,
        conversations: schema.conversations,
        messages: schema.messages,
        jarvisRuns: schema.jarvisRuns,
        integrations: schema.integrations,
      } as const;
      const out: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        profile: { name: user.name, email: user.email, timezone: user.timezone },
      };
      for (const [key, table] of Object.entries(tables)) {
        const rows = (await s.tx.select().from(table).where(eq(table.userId, s.userId))) as Record<string, unknown>[];
        // Never export credentials or internal search columns.
        out[key] = rows.map(({ encryptedCredentials: _c, searchVector: _s, ...rest }) => rest);
      }
      await audit(s, "user", "data.export.json");
      return out;
    });
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="budgetflow-export-${stamp}.json"` } });
  } catch (e) {
    return errorResponse(e);
  }
}
