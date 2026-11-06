import { aiAllowed } from "@/lib/ai-consent";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { addDaysStr, DATE_RE, formatDateStr, localDateOf, TIME_RE } from "@/lib/dates";

const fmtDay = (d: string) => formatDateStr(d, "EEE, MMM d");
import type { Database } from "../../db/client";
import { normalizeText } from "@/lib/utils";
import { assignments, attachments, inboxItems, inboxSenders, oauthIdentities, tasks, users, type Frequency, type InboxFiled } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { emailConfig, sendEmail } from "../../integrations/email";
import { ServiceError } from "../errors";
import { bankSeries, createRecurring, deleteRecurring, getRecurring } from "../finance/planning";
import { createTransaction, deleteTransaction, queryTransactions } from "../finance/transactions";
import { createAssignment, deleteAssignment, resolveCourse } from "../school";
import { createEvent, deleteEvent } from "../calendar";
import { createTask, deleteTask } from "../tasks";
import { addPaycheck, deletePaycheck, listEmployers } from "../work";
import { restoreMerged } from "./cleanup";
import { extractDocument, type ExtractInput, type Extraction } from "./extract";
import {
  attachReceipt,
  handAccount,
  receiptPolicy,
  contentSigFor,
  isStrongSig,
  weakSigPrefix,
  findMovedSchoolItem,
  findOpenByTitle,
  findPayReminder,
  findFiledTwin,
  findPurchaseTwin,
  findTrackedBill,
  moveSchoolItem,
  normalizeMessageId,
  saveBillAsSeries,
  undoUpdate,
  updateTrackedBill,
  WAITING_FOR_BANK,
} from "./dedupe";

/**
 * Smart inbox. Users forward bills, receipts, school emails, bookings and pay
 * stubs to their own address (or upload / share a file); Jarvis reads each one
 * and files it where it belongs, with Undo. Email is accepted only from the
 * user's verified addresses.
 */

// ------------------------------------------------------------------ address

export const inboxDomain = () => process.env.INBOX_DOMAIN?.trim() || null;

/** The user's forwarding address (made on first use). Null until INBOX_DOMAIN is set. */
export async function inboxAddress(db: Database, userId: string) {
  const domain = inboxDomain();
  const [u] = await db.select({ token: users.inboxToken }).from(users).where(eq(users.id, userId));
  let token = u?.token;
  if (!token) {
    token = randomBytes(9)
      .toString("base64url")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "x");
    await db.update(users).set({ inboxToken: token }).where(eq(users.id, userId));
  }
  return domain ? `u-${token}@${domain}` : null;
}

/** Which user an incoming address belongs to. */
export async function userForAddress(db: Database, address: string) {
  const m = /^u-([a-z0-9]{8,20})@/i.exec(address.trim());
  if (!m) return null;
  const [u] = await db.select({ id: users.id, timezone: users.timezone, email: users.email }).from(users).where(eq(users.inboxToken, m[1].toLowerCase()));
  return u ?? null;
}

// ------------------------------------------------------------------ verified senders

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const clean = (e: string) => e.trim().toLowerCase();

export async function listSenders(scope: UserScope) {
  return scope.tx.select().from(inboxSenders).where(eq(inboxSenders.userId, scope.userId)).orderBy(inboxSenders.createdAt);
}

/**
 * Adds an address that may forward to the inbox. An Apple-verified sign-in
 * email counts as verified; anything else gets a 6-digit code by email.
 */
export async function addSender(scope: UserScope, db: Database, rawEmail: string) {
  const email = clean(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ServiceError("Enter an email address.");
  const [apple] = await db
    .select({ id: oauthIdentities.id })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.userId, scope.userId), eq(oauthIdentities.email, email)));
  if (apple) {
    await scope.tx
      .insert(inboxSenders)
      .values({ userId: scope.userId, email, verifiedAt: new Date() })
      .onConflictDoUpdate({ target: [inboxSenders.userId, inboxSenders.email], set: { verifiedAt: new Date() } });
    return { verified: true };
  }
  const cfg = emailConfig();
  if (!cfg) throw new ServiceError("Verification emails aren't available yet, so new addresses can't be added.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await scope.tx
    .insert(inboxSenders)
    .values({ userId: scope.userId, email, codeHash: sha(code), codeExpiresAt: new Date(Date.now() + 15 * 60_000) })
    .onConflictDoUpdate({
      target: [inboxSenders.userId, inboxSenders.email],
      set: { codeHash: sha(code), codeExpiresAt: new Date(Date.now() + 15 * 60_000), attempts: 0 },
    });
  await sendEmail(cfg, {
    to: email,
    subject: `Your LifeFlow code: ${code}`,
    text: `Enter ${code} in LifeFlow to let this address forward emails to your Smart inbox. It works for 15 minutes. If you didn't ask for this, ignore this email.`,
    html: `<p>Enter <b>${code}</b> in LifeFlow to let this address forward emails to your Smart inbox. It works for 15 minutes.</p><p>If you didn't ask for this, ignore this email.</p>`,
  });
  return { verified: false };
}

export async function verifySender(scope: UserScope, email: string, code: string) {
  const [row] = await scope.tx
    .select()
    .from(inboxSenders)
    .where(and(eq(inboxSenders.userId, scope.userId), eq(inboxSenders.email, clean(email))));
  if (!row?.codeHash || !row.codeExpiresAt || row.codeExpiresAt < new Date() || row.attempts >= 5) throw new ServiceError("That code expired. Send a new one.");
  if (sha(code.trim()) !== row.codeHash) {
    await scope.tx
      .update(inboxSenders)
      .set({ attempts: row.attempts + 1 })
      .where(eq(inboxSenders.id, row.id));
    throw new ServiceError("That code doesn't match.");
  }
  await scope.tx.update(inboxSenders).set({ verifiedAt: new Date(), codeHash: null, codeExpiresAt: null }).where(eq(inboxSenders.id, row.id));
}

export async function removeSender(scope: UserScope, id: string) {
  await scope.tx.delete(inboxSenders).where(and(eq(inboxSenders.id, id), eq(inboxSenders.userId, scope.userId)));
}

export async function isVerifiedSender(scope: UserScope, email: string) {
  const [row] = await scope.tx
    .select({ v: inboxSenders.verifiedAt })
    .from(inboxSenders)
    .where(and(eq(inboxSenders.userId, scope.userId), eq(inboxSenders.email, clean(email))));
  return !!row?.v;
}

// ------------------------------------------------------------------ filing

const cents = (usd: number | null | undefined) => (usd == null || !Number.isFinite(usd) ? null : Math.round(Math.abs(usd) * 100));
const date = (d: string | null | undefined) => (d && DATE_RE.test(d) ? d : null);

/**
 * A question for the person ("Same bill?", "Did Exam 1 move?"), kept on the inbox item (in `extracted.ask`) with one tap
 * for yes and one for no. Nothing is added or changed until it is answered, so nothing is counted twice meanwhile.
 */
export type Ask = {
  kind: "bill" | "exam";
  text: string;
  /** Only an email that passed the sender check (SPF/DKIM) may ask: a tap on Yes changes what the person has. */
  verified: true;
  /** The tracked bills the email could be (ids), so a "no" is remembered for each pair. */
  candidates?: string[];
  /** Yes means: this is the bill / exam with this id (update it). */
  sameAs?: string;
  /** Bill questions: one tap per candidate, so the person says which bill it is (labels tell them apart). */
  options?: { id: string; label: string }[];
  /** Bill questions about a bank series the person doesn't track yet: its merchant key (Yes saves the bill as that series). */
  seriesKey?: string;
  /** The bill the person picked among the candidates. */
  picked?: string;
  /** Exam questions: the day the email gives. */
  newDate?: string;
  /** Exam questions: what the exam was when asked; a Yes is refused if any of it changed since. */
  exam?: { title: string; kind: string; oldDue: string | null };
  /** Yes means: this is a copy of the email filed in this inbox item. */
  twin?: string;
  answered?: "same" | "different";
};

/** Puts what was read where it belongs. Returns what was created (for Undo) and anything that needs the user. */
export async function fileExtraction(
  scope: UserScope,
  tz: string,
  ex: Extraction,
  today: string,
  ctx: { from?: string | null; authenticated?: boolean; decision?: { sameAs?: string; separate?: boolean; seriesKey?: string; exam?: Ask["exam"] } } = {},
): Promise<{ filed: InboxFiled[]; review?: string; ask?: Ask }> {
  const filed: InboxFiled[] = [];
  // Changing something the user already has (a bill, an exam, a bank charge's note) needs an email that passed the sender
  // check (SPF/DKIM). Otherwise the change is only suggested; nothing is touched.
  const auth = ctx.authenticated === true;
  const needsSenderCheck = "I only change what you already have from an email that passed the sender check, so I left it as it is.";
  switch (ex.type) {
    case "bill": {
      const b = ex.bill;
      const amount = cents(b?.amount_usd);
      if (!b || !amount) return { filed, review: "Couldn't read the amount due." };
      const due = date(b.due_date) ?? addDaysStr(today, 7);
      let note: string | undefined;
      let reminder = true;
      let ask: Ask | undefined;
      const decision = ctx.decision;
      if (b.repeats !== "none") {
        const facts = { payee: b.payee.slice(0, 120), amountCents: amount, frequency: b.repeats as Frequency, due, accountRef: b.account_ref };
        const createBill = async () => {
          const r = await createRecurring(
            scope,
            { name: b.payee.slice(0, 120), amountCents: -amount, frequency: b.repeats as Frequency, nextDueDate: due, kind: "bill" },
            "detected",
          );
          filed.push({
            kind: "recurring",
            id: r.id,
            label: `Bill: ${b.payee} $${(amount / 100).toFixed(2)} ${b.repeats}, next ${fmtDay(due)}`,
            href: "/finances/bills",
          });
        };
        const applyTo = async (item: Awaited<ReturnType<typeof getRecurring>>, sameCycleOk = false) => {
          const updated = await updateTrackedBill(scope, item, facts, { sameCycleOk });
          if (updated) {
            filed.push(updated);
            // A corrected statement for the same due date: the reminder that is already there gets the new amount (Undo puts it back).
            if (item.nextDueDate === facts.due) {
              const open = await findPayReminder(scope, tz, facts.payee, facts.due);
              if (open) {
                const title = `Pay ${b.payee} ($${(amount / 100).toFixed(2)})`;
                await scope.tx
                  .update(tasks)
                  .set({ title })
                  .where(and(eq(tasks.id, open.id), eq(tasks.userId, scope.userId)));
                updated.prev = { ...updated.prev, reminder: { id: open.id, title: open.title } };
                updated.next = { ...updated.next, reminderTitle: title };
                reminder = false;
              }
            }
          } else {
            note = `${item.name} is already tracked past ${fmtDay(facts.due)}, so this older statement changed nothing.`;
            reminder = false;
          }
        };
        // The person's answer comes first; otherwise a bill we already track (or the bank's series for it) is updated, never
        // added a second time. Not sure: ask, don't guess.
        if (decision?.separate) await createBill();
        else if (decision?.seriesKey) {
          const series = (await bankSeries(scope, today)).untracked.find((c) => c.merchantKey === decision.seriesKey);
          if (series) filed.push(await saveBillAsSeries(scope, series, facts));
          else await createBill();
        } else if (decision?.sameAs) await applyTo(await getRecurring(scope, decision.sameAs), true);
        else {
          const match = await findTrackedBill(scope, facts, today);
          if (match?.kind === "ask" && !auth) note = `Same bill as ${match.names.join(" or ")}? ${needsSenderCheck}`;
          else if (match?.kind === "ask") {
            const text = `Same bill? ${b.payee} $${(amount / 100).toFixed(2)} on ${fmtDay(due)} from your email, and ${match.names.join(" or ")}${match.seriesKey ? "" : " in your bills"}.`;
            ask = {
              kind: "bill",
              text,
              verified: true,
              candidates: match.ids,
              sameAs: match.ids.length === 1 ? match.ids[0] : undefined,
              seriesKey: match.seriesKey,
              options: match.ids.length > 1 ? match.ids.map((id, n) => ({ id, label: match.names[n] })) : undefined,
            };
            note = text;
            reminder = false;
          } else if (match?.kind === "item" && !auth) note = `Same bill as ${match.item.name}? ${needsSenderCheck}`;
          else if (match?.kind === "item") await applyTo(match.item);
          else if (match?.kind === "series") filed.push(await saveBillAsSeries(scope, match.series, facts));
          else await createBill();
        }
      }
      if (reminder) {
        const t = await createTask(
          scope,
          tz,
          { title: `Pay ${b.payee} ($${(amount / 100).toFixed(2)})`, dueDate: due, dueTime: "09:00", reminder: "1d" },
          "manual",
        );
        filed.push({ kind: "task", id: t.id, label: `Reminder: pay ${b.payee} by ${fmtDay(due)}`, href: `/tasks/${t.id}` });
      }
      return { filed, ask, review: note ?? (b.due_date ? undefined : "No due date was printed; I set it for a week out. Check it.") };
    }
    case "receipt": {
      const r = ex.receipt;
      const amount = cents(r?.total_usd);
      if (!r || !amount) return { filed, review: "Couldn't read the total." };
      const day = date(r.date) ?? today;
      const receipt = { merchant: r.merchant.slice(0, 200), amountCents: amount, day };
      // The bank's copy (or one already on file) is the purchase; the receipt only rides along on it.
      const twin = await findPurchaseTwin(scope, receipt);
      if (twin?.source === "plaid") {
        if (!auth) return { filed, review: `This matches ${twin.description} from your bank. ${needsSenderCheck}` };
        filed.push(await attachReceipt(scope, twin, receipt));
        return { filed };
      }
      const seen =
        twin ??
        (await queryTransactions(scope, { from: addDaysStr(day, -2), to: addDaysStr(day, 2), minAmountCents: amount, maxAmountCents: amount, limit: 5 }))[0];
      if (seen)
        return { filed, review: `This matches a transaction you already have (${seen.description} on ${fmtDay(seen.date)}), so I didn't add it again.` };
      // A linked bank brings its own purchases: a receipt for one waits for its charge instead of counting twice. Cash and
      // cards that aren't linked are spending, so those are added.
      const policy = await receiptPolicy(scope, { day, last4: r.payment_last4 }, today);
      if (policy === "hold")
        return {
          filed,
          review: `${WAITING_FOR_BANK}: ${r.merchant.slice(0, 80)} $${(amount / 100).toFixed(2)} isn't there yet. It's kept here and attached when the charge posts; it isn't counted in your spending yet.`,
        };
      const account = await handAccount(scope);
      if (!account)
        return {
          filed,
          review: "Add a cash or card account on Money first (your linked bank brings its own purchases), then I can record receipts paid another way.",
        };
      const t = await createTransaction(
        scope,
        { accountId: account.id, date: day, description: r.merchant.slice(0, 200), merchantName: r.merchant.slice(0, 120), amountCents: -amount },
        "manual",
      );
      filed.push({
        kind: "transaction",
        id: t.id,
        label: `Spending: ${r.merchant} $${(amount / 100).toFixed(2)} on ${fmtDay(day)} (${account.name})`,
        href: "/finances/transactions",
      });
      return {
        filed,
        review:
          policy === "spend_unmatched"
            ? "No matching charge from a linked bank, so I counted this as spending (cash or a card that isn't linked). Undo it if the bank has it."
            : undefined,
      };
    }
    case "assignment":
    case "exam": {
      const s = ex.school;
      if (!s) return { filed, review: "Couldn't find a title or due date." };
      const { course, candidates } = await resolveCourse(scope, { courseName: s.course });
      if (!course)
        return {
          filed,
          review: candidates.length
            ? `Which class is "${s.course}"? It could be ${candidates.map((c) => c.name).join(" or ")}.`
            : `I couldn't find the class "${s.course}". Add it on Classes, then forward again.`,
        };
      const kind = ex.type === "exam" ? "exam" : "assignment";
      // "Exam 2 moved to Nov 17": only an email that says it moved, names the old date, and finds exactly one exam due then
      // moves it (Undo moves it back). Anything unclear is asked, never guessed, and never added as a second exam.
      const dueDate = date(s.due_date);
      if (s.moved && !ctx.decision?.separate) {
        const time = s.due_time && TIME_RE.test(s.due_time) ? s.due_time : null;
        const move = async (row: Awaited<ReturnType<typeof findOpenByTitle>>[number]) => {
          const label = `${kind === "exam" ? "Exam" : "Assignment"}: ${row.title} in ${course.name}`;
          const moved = await moveSchoolItem(scope, tz, row, { date: dueDate!, time }, ctx.from ?? null, label);
          if ("filed" in moved) return { filed: [moved.filed] };
          return { filed, review: `${row.title} is already in ${course.name} on that day.` };
        };
        if (ctx.decision?.sameAs) {
          const [row] = await scope.tx
            .select()
            .from(assignments)
            .where(and(eq(assignments.id, ctx.decision.sameAs), eq(assignments.userId, scope.userId)));
          // Re-checked now: still this course's open exam, with the title, kind and date it had when asked, and not already on that day.
          const was = ctx.decision.exam;
          const unchanged =
            !was ||
            (!!row &&
              normalizeText(row.title) === normalizeText(was.title) &&
              row.kind === was.kind &&
              (row.dueAt ? localDateOf(row.dueAt, tz) : null) === was.oldDue);
          if (row && unchanged && dueDate && row.courseId === course.id && row.status !== "done" && !(row.dueAt && localDateOf(row.dueAt, tz) === dueDate))
            return move(row);
          return { filed, review: "That exam has changed since I asked, so I left it as it is." };
        } else {
          const found = dueDate
            ? await findMovedSchoolItem(scope, tz, { courseId: course.id, kind, title: s.title, oldDate: date(s.old_due_date) })
            : ({ match: null, why: "none" } as const);
          if (!found.match) {
            // The old date can't pin it down, but exactly one item has this name: ask "did it move?" with one tap each way.
            const named = dueDate ? await findOpenByTitle(scope, { courseId: course.id, kind, title: s.title }) : [];
            const one = named.length === 1 ? named[0] : null;
            const there = one?.dueAt && localDateOf(one.dueAt, tz) === dueDate; // already on that day: nothing to decide
            if (one && !there) {
              if (!auth) return { filed, review: `"${one.title}" looks moved in ${course.name}. ${needsSenderCheck}` };
              // "No" is remembered: the same question about the same exam and day is not asked again.
              if (await wasAnsweredNo(scope, one.id, dueDate!)) return { filed, review: `You kept ${one.title} on its old date, so I left it.` };
              const text = `Did ${one.title} move to ${fmtDay(dueDate!)}?`;
              return {
                filed,
                review: text,
                ask: {
                  kind: "exam",
                  text,
                  verified: true,
                  sameAs: one.id,
                  newDate: dueDate!,
                  exam: { title: one.title, kind: one.kind, oldDue: one.dueAt ? localDateOf(one.dueAt, tz) : null },
                },
              };
            }
            const why =
              found.why === "no_date" ? "the email doesn't say the old date" : found.why === "many" ? "more than one is due then" : "none is due then";
            return { filed, review: `Same ${kind}? "${s.title}" looks moved in ${course.name}, but ${why}. I didn't add or change anything.` };
          }
          if (!auth) return { filed, review: `"${s.title}" looks moved in ${course.name}. ${needsSenderCheck}` };
          return move(found.match);
        }
      }
      const r = await createAssignment(
        scope,
        tz,
        {
          courseId: course.id,
          title: s.title.slice(0, 300),
          kind,
          dueDate: date(s.due_date),
          dueTime: s.due_time && TIME_RE.test(s.due_time) ? s.due_time : null,
        },
        "manual",
      );
      if (r.status === "duplicate") return { filed, review: `${s.title} is already in ${course.name}.` };
      filed.push({
        kind: "assignment",
        id: r.assignment.id,
        label: `${ex.type === "exam" ? "Exam" : "Assignment"}: ${s.title} in ${course.name}${s.due_date ? `, due ${fmtDay(s.due_date)}` : ""}`,
        href: `/school/courses/${course.id}`,
      });
      return { filed };
    }
    case "flight":
    case "hotel":
    case "train": {
      const items = (ex.travel?.items ?? []).filter((i) => DATE_RE.test(i.start.slice(0, 10)));
      if (!items.length) return { filed, review: "Couldn't read the booking dates." };
      for (const i of items) {
        const [date, time] = [i.start.slice(0, 10), i.start.slice(11, 16) || null];
        const [endDate, endTime] = i.end ? [i.end.slice(0, 10), i.end.slice(11, 16) || null] : [null, null];
        const label = `${i.kind[0].toUpperCase()}${i.kind.slice(1)}: ${i.title}`.slice(0, 300);
        const ev = await createEvent(scope, tz, {
          title: label,
          date,
          startTime: time,
          endTime: endDate === date ? endTime : null,
          endDate: endDate && endDate !== date ? endDate : null,
          allDay: !time,
          location: i.location ?? null,
          description: i.confirmation ? `Confirmation ${i.confirmation}` : null,
        });
        filed.push({ kind: "event", id: ev.id, label: `${label}${i.confirmation ? ` (${i.confirmation})` : ""}, ${fmtDay(date)}`, href: `/plan?date=${date}` });
      }
      return { filed };
    }
    case "pay_stub": {
      const p = ex.pay;
      const net = cents(p?.net_usd);
      if (!p || !net || !date(p.pay_date)) return { filed, review: "Couldn't read the pay date and net pay." };
      const jobs = await listEmployers(scope);
      const job =
        jobs.find((j) => j.name.toLowerCase().includes(p.employer.toLowerCase()) || p.employer.toLowerCase().includes(j.name.toLowerCase())) ??
        (jobs.length === 1 ? jobs[0] : null);
      if (!job) return { filed, review: `Which job is "${p.employer}"? Add it on Work, then forward again.` };
      const pc = await addPaycheck(
        scope,
        { employerId: job.id, payDate: p.pay_date, netCents: net, grossCents: cents(p.gross_usd), hours: p.hours ?? null },
        "manual",
      );
      filed.push({ kind: "paycheck", id: pc.id, label: `Paycheck from ${job.name}: $${(net / 100).toFixed(2)} net on ${fmtDay(p.pay_date)}`, href: "/work" });
      return { filed };
    }
    case "class_schedule":
      return { filed, review: "This looks like your class schedule, not a bill. Send the same photo to your assistant in chat to add your classes." };
    case "work_schedule":
      // TODO(D12, when shift filing is built): key each shift by (employer, start time) with source "schedule". A newer
      // schedule email for the same employer and week REPLACES that week's schedule shifts (except ones the user edited),
      // and expected shifts from usual work days (`fillRegularShifts`) give way to the real ones. Record Undo with the
      // replaced shifts. Test: the Nov 9 to 15 email, then a corrected one, leaves the corrected shifts only.
      // See docs/audits/2026-11-06-gmail-audit.md, D12. Until then nothing is filed, so no shift can be duplicated.
      return { filed, review: "This looks like a work schedule, not a bill. Send the same photo to your assistant in chat to add your shifts." };
    default:
      return { filed, review: "Nothing to file. It's saved here so you can find it." };
  }
}

async function undoFiled(scope: UserScope, f: InboxFiled) {
  if (f.kind === "transaction") await deleteTransaction(scope, f.id).catch(() => undefined);
  if (f.kind === "recurring") await deleteRecurring(scope, f.id).catch(() => undefined);
  if (f.kind === "task") await deleteTask(scope, f.id).catch(() => undefined);
  if (f.kind === "assignment") await deleteAssignment(scope, f.id).catch(() => undefined);
  if (f.kind === "event") await deleteEvent(scope, f.id);
  if (f.kind === "paycheck") await deletePaycheck(scope, f.id).catch(() => undefined);
  // Updates put back what they changed; they never delete a row that was already there.
  if (f.kind === "recurring_update" || f.kind === "assignment_update" || f.kind === "transaction_note") await undoUpdate(scope, f);
}

// ------------------------------------------------------------------ pipeline

export type IncomingDocument = Omit<ExtractInput, "today"> & {
  channel: "email" | "upload" | "share";
  from?: string | null;
  attachmentIds?: string[];
  /** The provider's id for this message (Gmail: `gmail:<id>`), so one message is filed once. */
  externalId?: string | null;
  /** The email's Message-ID header: Gmail's copy and a forward that kept it are the same email. */
  messageId?: string | null;
  /**
   * The email passed the sender check (SPF/DKIM). Uploads and shares are the user's own act, so they count. Without it,
   * an email never changes a bill, an exam or a bank charge's note, it only suggests the change.
   */
  authenticated?: boolean;
};

/** Marks an inbox row as a copy of one already filed: nothing is created, and it says which one. */
async function markDuplicate(scope: UserScope, id: string, of: string, extra: Partial<typeof inboxItems.$inferInsert> = {}) {
  const [row] = await scope.tx
    .update(inboxItems)
    .set({ ...extra, status: "duplicate", duplicateOf: of, filed: [], reason: "Already filed from another copy of this email, so I didn't add it again." })
    .where(eq(inboxItems.id, id))
    .returning();
  return row;
}

/** Reads and files one document. Always leaves an inbox row saying what happened. */
export async function processDocument(
  scope: UserScope,
  tz: string,
  today: string,
  doc: IncomingDocument,
  extract = extractDocument,
  opts: { suggestOnly?: boolean } = {},
) {
  const messageId = normalizeMessageId(doc.messageId);
  const [row] = await scope.tx
    .insert(inboxItems)
    .values({
      userId: scope.userId,
      channel: doc.channel,
      fromAddress: doc.from ?? null,
      subject: doc.subject?.slice(0, 300) ?? doc.files[0]?.filename ?? null,
      attachmentIds: doc.attachmentIds ?? [],
      externalId: doc.externalId ?? null,
      messageId,
    })
    .returning();
  // The same email seen twice (Gmail and a forward that kept its Message-ID) is filed once, before it's even read.
  const sameMail = await findFiledTwin(scope, { messageId }, row.id);
  if (sameMail) return markDuplicate(scope, row.id, sameMail.id);
  let ex: Extraction;
  try {
    const [owner] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
    if (!aiAllowed(owner?.preferences)) throw new Error("Saved. Allow your assistant to use AI (in Settings) to have it read and filed automatically.");
    ex = await extract({ ...doc, today });
  } catch (e) {
    const [failed] = await scope.tx
      .update(inboxItems)
      .set({ status: "failed", reason: e instanceof Error ? e.message.slice(0, 300) : "Couldn't read it." })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return failed;
  }
  // A re-typed or forwarded copy of a bill already filed (same payee, amount and due date) is the same bill.
  const contentSig = contentSigFor(ex);
  // With an account or line on it, the same signature is the same bill. Without one, two lines of a plan look alike:
  // it is only a suggestion, and nothing is filed until the user answers.
  const sameBill = isStrongSig(contentSig) ? await findFiledTwin(scope, { contentSig }, row.id) : null;
  if (sameBill) return markDuplicate(scope, row.id, sameBill.id, { type: ex.type, summary: ex.summary.slice(0, 500), contentSig });
  const similar = contentSig && !isStrongSig(contentSig) ? await findFiledTwin(scope, { similarTo: weakSigPrefix(contentSig) }, row.id) : null;
  const checked = doc.authenticated ?? doc.channel !== "email";
  if (similar && ex.bill && !checked && opts.suggestOnly) {
    // A forward: its sender can't be relied on, so it is one tap to file (as with every forward), with the doubt said plainly.
    const [sug] = await scope.tx
      .update(inboxItems)
      .set({
        contentSig,
        status: "suggested",
        type: ex.type,
        summary: ex.summary.slice(0, 500),
        extracted: ex as unknown as Record<string, unknown>,
        reason: "File this bill? It looks like one you already have.",
      })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return sug;
  }
  if (similar && ex.bill && !checked) {
    // A look-alike from an unchecked sender gets no card (a tap would trust it). Nothing is added.
    const [held] = await scope.tx
      .update(inboxItems)
      .set({
        contentSig,
        status: "needs_review",
        type: ex.type,
        summary: ex.summary.slice(0, 500),
        extracted: ex as unknown as Record<string, unknown>,
        reason: "This looks like a bill already filed, and it didn't come from an address I could check. Nothing was added.",
      })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return held;
  }
  if (similar && ex.bill) {
    const text = `Same bill? ${ex.bill.payee} $${Math.abs(ex.bill.amount_usd).toFixed(2)} on ${fmtDay(ex.bill.due_date ?? today)} came in two emails${similar.subject ? `: "${similar.subject.slice(0, 60)}" and "${(doc.subject ?? "this one").slice(0, 60)}"` : ""}, and neither has an account or line number to tell them apart. Nothing was added.`;
    const ask: Ask = { kind: "bill", text, verified: true, twin: similar.id };
    const [asked] = await scope.tx
      .update(inboxItems)
      .set({
        contentSig,
        status: "needs_review",
        type: ex.type,
        summary: ex.summary.slice(0, 500),
        extracted: { ...ex, ask } as unknown as Record<string, unknown>,
        duplicateOf: similar.id,
        reason: text,
      })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return asked;
  }
  if (opts.suggestOnly && SUGGESTIBLE[ex.type]) {
    // Nothing is filed yet: the person's own tap is the approval (see fileSuggestion).
    const [sug] = await scope.tx
      .update(inboxItems)
      .set({
        contentSig,
        status: "suggested",
        type: ex.type,
        summary: ex.summary.slice(0, 500),
        extracted: ex as unknown as Record<string, unknown>,
        reason: `File this ${SUGGESTIBLE[ex.type]}?`,
      })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return sug;
  }
  const { filed, review, ask } = await fileExtraction(scope, tz, ex, today, { from: doc.from, authenticated: doc.authenticated ?? doc.channel !== "email" });
  const [done] = await scope.tx
    .update(inboxItems)
    .set({
      contentSig,
      status: filed.length ? "filed" : "needs_review",
      type: ex.type,
      summary: ex.summary.slice(0, 500),
      extracted: (ask ? { ...ex, ask } : ex) as unknown as Record<string, unknown>,
      filed,
      reason: review ?? null,
    })
    .where(eq(inboxItems.id, row.id))
    .returning();
  return done;
}

/** What a forwarded email can be offered as; anything else needs nothing from the person. */
const SUGGESTIBLE: Partial<Record<Extraction["type"], string>> = {
  bill: "bill",
  receipt: "receipt",
  assignment: "assignment",
  exam: "exam",
  flight: "booking",
  hotel: "booking",
  train: "booking",
  pay_stub: "pay stub",
};

/**
 * Forwarded email is read but only SUGGESTED: its sender check can't yet be fully trusted (see email-auth.ts),
 * so the person files it with one tap (fileSuggestion).
 */
export const processForwardedEmail = (scope: UserScope, tz: string, today: string, doc: IncomingDocument, extract = extractDocument) =>
  processDocument(scope, tz, today, doc, extract, { suggestOnly: true });

/** The person's tap on "File this?": files what was extracted, with Undo as for any filed item. */
export async function fileSuggestion(scope: UserScope, tz: string, today: string, id: string) {
  const [row] = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, scope.userId)))
    .for("update");
  if (!row) throw new ServiceError("Not found", "not_found");
  if (row.status !== "suggested" || !row.extracted) throw new ServiceError("There's nothing waiting to be filed here.");
  // The person's tap is the approval, so this is the authenticated path (it may update what they already have).
  const { filed, review, ask } = await fileExtraction(scope, tz, row.extracted as unknown as Extraction, today, { from: row.fromAddress, authenticated: true });
  const [done] = await scope.tx
    .update(inboxItems)
    .set({ status: filed.length ? "filed" : "needs_review", filed, reason: review ?? null, ...(ask && { extracted: { ...row.extracted, ask } }) })
    .where(eq(inboxItems.id, id))
    .returning();
  return done;
}

/** Logs an email that was turned away (only who/what, never the content). */
export async function recordIgnored(scope: UserScope, from: string, subject: string, reason: string) {
  return scope.tx
    .insert(inboxItems)
    .values({ userId: scope.userId, channel: "email", fromAddress: from.slice(0, 200), subject: subject.slice(0, 300), status: "ignored", reason })
    .returning({ id: inboxItems.id });
}

export async function undoInboxItem(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, scope.userId)));
  if (!row) throw new ServiceError("Not found", "not_found");
  // Something the cleanup merged away: Undo brings back what it removed (whatever the item's status), before anything else.
  const restored = await restoreMerged(scope, id);
  if (restored) return restored;
  // An answered question: Undo puts back whatever the answer changed and asks it again.
  if (row.status !== "filed" && askOf(row.extracted)?.answered) {
    await reopenQuestion(scope, row);
    return 1;
  }
  if (row.status !== "filed") throw new ServiceError("There's nothing to undo here.");
  for (const f of [...row.filed].reverse()) await undoFiled(scope, f);
  if (askOf(row.extracted)?.answered) await reopenQuestion(scope, row);
  else await scope.tx.update(inboxItems).set({ status: "undone" }).where(eq(inboxItems.id, id));
  return row.filed.length;
}

export async function listInbox(scope: UserScope, limit = 100) {
  return scope.tx.select().from(inboxItems).where(eq(inboxItems.userId, scope.userId)).orderBy(desc(inboxItems.receivedAt)).limit(limit);
}

/** Saves an incoming file so it stays with the inbox item. */
export async function saveInboxFile(scope: UserScope, f: { filename: string; mimeType: string; data: Buffer }) {
  const [a] = await scope.tx
    .insert(attachments)
    .values({
      userId: scope.userId,
      filename: f.filename.slice(0, 200),
      mimeType: f.mimeType,
      sizeBytes: f.data.length,
      sha256: createHash("sha256").update(f.data).digest("hex"),
      dataBase64: f.data.toString("base64"),
    })
    .returning({ id: attachments.id });
  return a.id;
}

/** The question kept on an inbox item, if any. */
const askOf = (extracted: Record<string, unknown> | null) => (extracted?.ask as Ask | undefined) ?? null;

/**
 * The person's answer to a question ("Same bill?", "Did Exam 1 move?"). Yes: a copy is marked as one, or the bill / exam it
 * names is updated. No: it is filed as its own bill / exam. Either way the answer is kept so Undo can ask again.
 */
export async function answerQuestion(scope: UserScope, tz: string, today: string, id: string, same: boolean, pick?: string) {
  // Locked, so two quick taps (or two devices) can't both apply an answer.
  const [row] = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, scope.userId)))
    .for("update");
  const ask = row ? askOf(row.extracted) : null;
  // Only a question that was raised for a checked sender can be answered: the tap is trusted as much as the email was.
  if (!row || row.status !== "needs_review" || !ask || ask.answered || ask.verified !== true) throw new ServiceError("There's nothing to answer here.");
  // Several bills it could be: the person taps the one it is, and it has to be one of those that were offered.
  if (pick && (!same || !ask.candidates?.includes(pick))) throw new ServiceError("That isn't one of the bills I asked about.");
  const sameAs = pick ?? ask.sameAs;
  const answered: Ask = { ...ask, answered: same ? "same" : "different", ...(pick && { picked: pick, sameAs: pick }) };
  const extracted = { ...row.extracted, ask: answered };
  if (same && ask.twin) return markDuplicate(scope, id, ask.twin, { extracted });
  if (same && !sameAs && !ask.seriesKey) throw new ServiceError("Tap the bill it is, or say it is a new bill.");
  if (ask.kind === "exam") {
    // Yes moves the exam; No keeps its date (and is remembered). Nothing else is ever added from this question.
    if (!same) {
      const [kept] = await scope.tx
        .update(inboxItems)
        .set({ status: "ignored", filed: [], reason: "You kept it on its old date. Nothing changed.", extracted })
        .where(eq(inboxItems.id, id))
        .returning();
      return kept;
    }
  }
  const { ask: _drop, ...ex } = row.extracted as Record<string, unknown>;
  const { filed, review } = await fileExtraction(scope, tz, ex as unknown as Extraction, today, {
    from: row.fromAddress,
    authenticated: true, // the person's tap is the approval
    decision: same ? (sameAs ? { sameAs, exam: ask.exam } : { seriesKey: ask.seriesKey }) : { separate: true },
  });
  const [done] = await scope.tx
    .update(inboxItems)
    .set({ status: filed.length ? "filed" : "ignored", duplicateOf: null, filed, reason: review ?? null, extracted })
    .where(eq(inboxItems.id, id))
    .returning();
  return done;
}

/** Whether the person already said "no, it didn't move" to this exam on this day. */
async function wasAnsweredNo(scope: UserScope, examId: string, newDate: string) {
  const rows = await scope.tx
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        sql`${inboxItems.extracted} #>> '{ask,kind}' = 'exam'`,
        sql`${inboxItems.extracted} #>> '{ask,answered}' = 'different'`,
        sql`${inboxItems.extracted} #>> '{ask,sameAs}' = ${examId}`,
        sql`${inboxItems.extracted} #>> '{ask,newDate}' = ${newDate}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Undo of an answered question: back to the question, nothing added or changed. */
async function reopenQuestion(scope: UserScope, row: typeof inboxItems.$inferSelect) {
  const ask = askOf(row.extracted)!;
  const { answered: _a, ...open } = ask;
  await scope.tx
    .update(inboxItems)
    .set({ status: "needs_review", filed: [], reason: ask.text, duplicateOf: ask.twin ?? null, extracted: { ...row.extracted, ask: open } })
    .where(eq(inboxItems.id, row.id));
}
