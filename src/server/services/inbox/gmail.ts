import { and, eq, inArray } from "drizzle-orm";
import { inboxItems } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { getGoogleConnection, readEmail, searchEmail } from "../../integrations/google";
import { extractDocument, extractionClient } from "./extract";
import { processDocument } from "./index";

/** Recent mail that's likely school, bills or work. Promotions and social are skipped. */
export const GMAIL_FILING_QUERY =
  'newer_than:2d -category:promotions -category:social (syllabus OR due OR exam OR deadline OR quiz OR "rescheduled" OR "moved to" OR bill OR invoice OR "payment due" OR statement OR shift OR schedule OR paystub OR "pay stub")';
const MAX_PER_RUN = 10;

/**
 * Files new school, bill and work emails from the user's Gmail (only when they turned
 * it on). Each Gmail message is filed once (inbox_items.external_id); content is
 * untrusted and goes through the same strict extraction and Undo as forwarded mail.
 */
export async function fileFromGmail(scope: UserScope, tz: string, today: string, deps: { fetch?: typeof fetch; extract?: typeof extractDocument } = {}) {
  if (!(await getGoogleConnection(scope)) || !(deps.extract ?? extractionClient())) return { filed: 0, checked: 0 };
  const found = await searchEmail(scope, GMAIL_FILING_QUERY, MAX_PER_RUN, deps.fetch);
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
    const row = await processDocument(scope, tz, today, { channel: "email", from: mail.from, subject: mail.subject, text: mail.body, files: [] }, deps.extract);
    await scope.tx
      .update(inboxItems)
      .set({ externalId: `gmail:${m.id}` })
      .where(eq(inboxItems.id, row.id));
    if (row.status === "filed") filed++;
  }
  return { filed, checked };
}
