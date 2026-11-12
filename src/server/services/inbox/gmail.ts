import { and, eq, inArray, like } from "drizzle-orm";
import { inboxItems, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { getGoogleConnection, readEmail, searchEmail } from "../../integrations/google";
import { NOT_READ_YET, extractDocument, extractionClient } from "./extract";
import { parseFromAddress, senderAuthenticated } from "./email-auth";
import { processDocument, recordIgnored } from "./index";

/** Mail that's likely school, bills, work, receipts, deliveries or bookings, from the last `days` days. Promotions and social are skipped. */
export const gmailFilingQuery = (days: number) =>
  `newer_than:${days}d -category:promotions -category:social (syllabus OR due OR exam OR deadline OR quiz OR "rescheduled" OR "moved to" OR bill OR invoice OR "payment due" OR statement OR shift OR schedule OR paystub OR "pay stub" OR receipt OR "your order" OR shipped OR "out for delivery" OR delivery OR reservation OR booking OR itinerary OR ticket OR flight)`;
/**
 * The first look reaches back 30 days for up to 50 emails (owner via the COO, 2026-11-12: "do more than 25", then 50); later
 * runs stay small. Every read counts against the person's monthly document reads like any other (services/ai-gate.ts).
 */
export const FIRST_LOOK = { days: 30, max: 50 };
export const DAILY_LOOK = { days: 2, max: 10 };

/** Each email provider's off switch in Settings. A new provider (Outlook mail, say) adds its key here. */
const FILING_SWITCH = { gmail: "gmailFiling" } as const satisfies Record<string, keyof UserPreferences>;

/**
 * Reading a connected mailbox starts with the connection, for every email provider (owner via the COO, 2026-11-12: "the same
 * goes for any other email we connect in future ... with no second switch"); only its own switch in Settings turns it off.
 */
export const emailFilingOn = (prefs: UserPreferences | undefined, provider: keyof typeof FILING_SWITCH) => prefs?.[FILING_SWITCH[provider]] !== false;

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
  // what the limits refused earlier is read again first (owner via the COO: never dropped silently): its kept row makes way
  const waiting = await scope.tx
    .select({ id: inboxItems.id, externalId: inboxItems.externalId })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        like(inboxItems.externalId, "gmail:%"),
        eq(inboxItems.status, "failed"),
        like(inboxItems.reason, `${NOT_READ_YET}%`),
      ),
    )
    .limit(look.max);
  if (waiting.length)
    await scope.tx.delete(inboxItems).where(
      inArray(
        inboxItems.id,
        waiting.map((w) => w.id),
      ),
    );
  const again = waiting.map((w) => ({ id: w.externalId!.slice("gmail:".length) }));
  const fresh = await searchEmail(scope, gmailFilingQuery(look.days), look.max, deps.fetch, FIRST_LOOK.max);
  const found = [...again, ...fresh.filter((m) => !again.some((a) => a.id === m.id))];
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
