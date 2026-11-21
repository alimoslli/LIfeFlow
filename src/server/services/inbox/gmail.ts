import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { inboxItems, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { getGoogleConnection, GoogleError, readEmail, searchEmail } from "../../integrations/google";
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

/** Why a waiting email is no longer read again: it isn't in Gmail anymore. */
export const GONE = "It isn't in Gmail anymore, so it wasn't read.";

/** Why a waiting email is no longer read again: Google refused it on every try. */
export const GAVE_UP = "Gmail wouldn't hand it over after several tries, so it wasn't read.";
/** A waiting email Google keeps refusing (a 400 or 403 that never clears) stops being asked for after this many tries. */
export const WAIT_TRIES = 5;

/** Gmail itself refused this email: a bad request, or a 401/403 for it that isn't the whole connection needing a reconnect. */
const refusedByGmail = (status: number | undefined) => status === 400 || status === 401 || status === 403;

/** An email not read this time (Google didn't hand it over, or the look was full): kept as waiting, so a later look reads it. */
async function keepForLater(scope: UserScope, m: { id: string; from: string; subject: string }, tries: number, full = false) {
  await scope.tx
    .insert(inboxItems)
    .values({
      userId: scope.userId,
      channel: "email",
      externalId: `gmail:${m.id}`,
      fromAddress: (parseFromAddress(m.from) || m.from).slice(0, 200) || null,
      subject: m.subject.slice(0, 300) || null,
      status: "failed",
      reason: `${NOT_READ_YET}: ${full ? "there were more new emails than one look reads" : "Gmail didn't hand it over this time"}. It's read on the next look.`,
      extracted: { waitTries: tries },
    })
    .onConflictDoNothing({ target: [inboxItems.userId, inboxItems.externalId], where: sql`external_id is not null` });
}

/**
 * Files new school, bill, work, receipt, delivery and booking emails from the user's Gmail (on with the connection, off
 * in Settings). Each Gmail message is filed once (inbox_items.external_id); content is untrusted and goes through the
 * same strict extraction, sender check and Undo as forwarded mail. The first look reaches back 30 days.
 */
export async function fileFromGmail(scope: UserScope, tz: string, today: string, deps: { fetch?: typeof fetch; extract?: typeof extractDocument } = {}) {
  if (!(await getGoogleConnection(scope)) || !(deps.extract ?? extractionClient())) return { filed: 0, checked: 0 };
  const [before] = await scope.tx
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, scope.userId), like(inboxItems.externalId, "gmail:%")))
    .limit(1);
  const look = before ? DAILY_LOOK : FIRST_LOOK;
  // what the limits refused earlier is read again first (owner via the COO: never dropped silently). Its row stays until
  // that email's own read works (COO review, 2026-11-12), so a Google error halfway through loses nothing.
  // oldest first, so a later one can't keep an older one waiting
  const waiting = await scope.tx
    .select({ id: inboxItems.id, externalId: inboxItems.externalId, extracted: inboxItems.extracted })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        like(inboxItems.externalId, "gmail:%"),
        eq(inboxItems.status, "failed"),
        like(inboxItems.reason, `${NOT_READ_YET}%`),
      ),
    )
    // rows made in one look share a time: the id keeps the order fixed
    .orderBy(asc(inboxItems.createdAt), asc(inboxItems.id))
    .limit(look.max);
  const kept = new Map(waiting.map((w) => [w.externalId!.slice("gmail:".length), { id: w.id, tries: Number(w.extracted?.waitTries ?? 0) }]));
  const again = [...kept.keys()].map((id) => ({ id, from: "", subject: "" }));
  const fresh = await searchEmail(scope, gmailFilingQuery(look.days), look.max, deps.fetch, FIRST_LOOK.max);
  const all = [...again, ...fresh.filter((m) => !kept.has(m.id))];
  if (!all.length) return { filed: 0, checked: 0 };
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
              all.map((m) => `gmail:${m.id}`),
            ),
          ),
        )
    ).map((r) => r.id),
  );
  // one look reads at most `look.max` ("up to 50" stays true): new ones past that wait for the next look, never dropped
  const found = all.slice(0, look.max);
  for (const m of all.slice(look.max)) if (!kept.has(m.id) && !seen.has(`gmail:${m.id}`)) await keepForLater(scope, m, 0, true);
  let filed = 0;
  let checked = 0;
  // once Google stops letting us in (access removed), the rest wait for the next look without another call
  let shut = false;
  for (const m of found) {
    const old = kept.get(m.id);
    if (!old && seen.has(`gmail:${m.id}`)) continue;
    let mail: Awaited<ReturnType<typeof readEmail>>;
    try {
      if (shut) throw new GoogleError("Google access was removed.", true);
      mail = await readEmail(scope, m.id, deps.fetch);
    } catch (e) {
      const g = e instanceof GoogleError ? e : null;
      if (g?.reauth) shut = true;
      // only Gmail refusing this one email counts as a try; access removed, no answer, a timeout or Google busy (429, 5xx)
      // only waits for the next look, however long (COO review, 2026-11-12: a revoked week must not give up on the backlog)
      const refused = !shut && !g?.reauth && refusedByGmail(g?.status);
      if (!old) {
        if (g?.status !== 404) await keepForLater(scope, m, refused ? 1 : 0);
      } else if (g?.status === 404) {
        // gone from Gmail (deleted): a wait ends, and the row says why
        await scope.tx.update(inboxItems).set({ reason: GONE }).where(eq(inboxItems.id, old.id));
      } else if (refused) {
        // refused again: counted, and after WAIT_TRIES it stops waiting with a fixed reason
        const tries = old.tries + 1;
        await scope.tx
          .update(inboxItems)
          .set(tries >= WAIT_TRIES ? { reason: GAVE_UP, extracted: null } : { extracted: { waitTries: tries } })
          .where(eq(inboxItems.id, old.id));
      }
      continue;
    }
    checked++;
    const address = parseFromAddress(mail.from);
    if (!address || !senderAuthenticated(mail.authHeaders, address, { via: "gmail" })) {
      if (old) await scope.tx.delete(inboxItems).where(eq(inboxItems.id, old.id));
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
    // read now: the waiting row makes way for the real one (one row per Gmail message)
    if (old) await scope.tx.delete(inboxItems).where(eq(inboxItems.id, old.id));
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
