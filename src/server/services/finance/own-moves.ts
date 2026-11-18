import { and, eq, gte, inArray } from "drizzle-orm";
import { addDaysStr } from "@/lib/dates";
import { isOwnTopUp, ownMovePairs, OWN_MOVE_DAYS } from "@/lib/own-moves";
import { personPaymentApp } from "@/lib/vendor";
import { transactions } from "../../db/schema";
import type { UserScope } from "../../db/with-user";

/** How far back each sync looks for the two halves of a move. */
const LOOK_BACK_DAYS = 60;

/**
 * The person's own money changing places is a transfer, never spending going out or money coming in (owner, 2026-11-18):
 * a Zelle, Cash App, Apple Cash or Venmo move between two of their own accounts (`ownMovePairs`), and money added to their
 * own PayPal, Venmo or Cash App balance from their bank or card (`isOwnTopUp`). Runs after every bank sync; safe to run
 * again (a row already a transfer is left alone). Returns how many rows it changed.
 */
export async function settleOwnMoves(scope: UserScope, today: string): Promise<number> {
  const from = addDaysStr(today, -(LOOK_BACK_DAYS + OWN_MOVE_DAYS));
  const rows = await scope.tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchantName: transactions.merchantName,
      description: transactions.description,
      excluded: transactions.excluded,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, scope.userId), gte(transactions.date, from)));
  const paired = ownMovePairs(rows);
  const topUps = rows.filter((r) => r.amountCents < 0 && !r.excluded && personPaymentApp(r.merchantName, r.description) && isOwnTopUp(r.description));
  const ids = [...rows.filter((r) => paired.has(r.id)), ...topUps].filter((r) => r.kind === "income" || r.kind === "expense").map((r) => r.id);
  if (!ids.length) return 0;
  await scope.tx
    .update(transactions)
    .set({ kind: "transfer", categoryId: null })
    .where(and(eq(transactions.userId, scope.userId), inArray(transactions.id, ids)));
  return ids.length;
}

/** The rows of a list that are the person's own money changing places, for reads that count transfers to people. */
export function ownMoveIds(rows: Parameters<typeof ownMovePairs>[0]): Set<string> {
  const ids = ownMovePairs(rows);
  for (const r of rows) if (r.amountCents < 0 && isOwnTopUp(r.description)) ids.add(r.id);
  return ids;
}
