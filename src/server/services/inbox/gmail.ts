import { and, eq, inArray, like } from "drizzle-orm";
import { inboxItems } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { getGoogleConnection, readEmail, searchEmail } from "../../integrations/google";
import { extractDocument, extractionClient } from "./extract";
import { parseFromAddress, senderAuthenticated } from "./email-auth";
import { processDocument, recordIgnored } from "./index";

/** Mail that's likely school, bills, work, receipts, deliveries or bookings, from the last `days` days. Promotions and social are skipped. */
export const gmailFilingQuery = (days: number) =>
  `newer_than:${days}d -category:promotions -category:social (syllabus OR due OR exam OR deadline OR quiz OR "rescheduled" OR "moved to" OR bill OR invoice OR "payment due" OR statement OR shift OR schedule OR paystub OR "pay stub" OR receipt OR "your order" OR shipped OR "out for delivery" OR delivery OR reservation OR booking OR itinerary OR ticket OR flight)`;
/** The first look reaches back two weeks (owner via the COO, 2026-11-12: Gmail must be visibly useful from the start); later runs stay small. */
export const FIRST_LOOK = { days: 14, max: 25 };
export const DAILY_LOOK = { days: 2, max: 10 };

/** Gmail filing is on once Google is connected, unless they turned it off (owner via the COO, 2026-11-12: no second switch). */
export const gmailFilingOn = (prefs: { gmailFiling?: boolean } | undefined) => prefs?.gmailFiling !== false;

/**
 * Files new school, bill, work, receipt, delivery and booking emails from the user's Gmail (on with the connection, off
 * in Settings). Each Gmail message is filed once (inbox_items.external_id); content is untrusted and goes through the
 * same strict extraction, sender check and Undo as forwarded mail. The first look reaches back two weeks.
 */
export async function fileFromGmail(scope: UserScope, tz: string, today: string, deps: { fetch?: typeof fetch; extract?: typeof extractDocument } = {}) {
  if (!(await getGoogleConnection(scope)) || !(deps.extract ?? extractionClient())) return { filed: 0, checked: 0 };
  const [before] = await scope.tx
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, scope.userId), like(inboxItems.externalId, "gmail:%")))
    .limit(1);
  const look = before ? DAILY_LOOK : FIRST_LOOK;
  const found = await searchEmail(scope, gmailFilingQuery(look.days), look.max, deps.fetch);
  if (!found.length) return { filed: 0, checked: 0 };
  const seen = new Set(
    (
      await scope.tx
        .select({ id: inboxItems.externalId })
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.userId, scope.userId),
            inArray(
              inboxItems.externalId,
              found.map((m) => `gmail:${m.id}`),
            ),
          ),
        )
    ).map((r) => r.id),
  );
  let filed = 0;
  let checked = 0;
  for (const m of found) {
    if (seen.has(`gmail:${m.id}`)) continue;
    checked++;
    const mail = await readEmail(scope, m.id, deps.fetch);
    const address = parseFromAddress(mail.from);
    if (!address || !senderAuthenticated(mail.authHeaders, address, { via: "gmail" })) {
      const [ig] = await recordIgnored(
        scope,
        address || mail.from,
        mail.subject,
        "Gmail couldn't confirm this was really sent by this address (SPF/DKIM failed).",
      );
      await scope.tx
        .update(inboxItems)
        .set({ externalId: `gmail:${m.id}` })
        .where(eq(inboxItems.id, ig.id));
      continue;
    }
    // Past the sender check above, so this is the authenticated path: it may update what the user already has.
    const row = await processDocument(
      scope,
      tz,
      today,
      {
        channel: "email",
        from: address,
        subject: mail.subject,
        text: mail.body,
        files: [],
        externalId: `gmail:${m.id}`,
        messageId: mail.messageId,
        authenticated: true,
      },
      deps.extract,
      { door: "gmail_filing" },
    );
    if (row.status === "filed") filed++;
  }
  return { filed, checked };
}
