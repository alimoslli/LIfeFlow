import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { addDaysStr, DATE_RE, formatDateStr, TIME_RE } from "@/lib/dates";

const fmtDay = (d: string) => formatDateStr(d, "EEE, MMM d");
import type { Database } from "../../db/client";
import { attachments, inboxItems, inboxSenders, oauthIdentities, users, type InboxFiled } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { emailConfig, sendEmail } from "../../integrations/email";
import { ServiceError } from "../errors";
import { listAccounts } from "../finance/accounts";
import { createRecurring, deleteRecurring } from "../finance/planning";
import { createTransaction, deleteTransaction, queryTransactions } from "../finance/transactions";
import { createAssignment, deleteAssignment, resolveCourse } from "../school";
import { createEvent, deleteEvent } from "../calendar";
import { createTask, deleteTask } from "../tasks";
import { addPaycheck, deletePaycheck, listEmployers } from "../work";
import { extractDocument, type ExtractInput, type Extraction } from "./extract";

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

/** Puts what was read where it belongs. Returns what was created (for Undo) and anything that needs the user. */
export async function fileExtraction(scope: UserScope, tz: string, ex: Extraction, today: string): Promise<{ filed: InboxFiled[]; review?: string }> {
  const filed: InboxFiled[] = [];
  switch (ex.type) {
    case "bill": {
      const b = ex.bill;
      const amount = cents(b?.amount_usd);
      if (!b || !amount) return { filed, review: "Couldn't read the amount due." };
      const due = date(b.due_date) ?? addDaysStr(today, 7);
      if (b.repeats !== "none") {
        const r = await createRecurring(
          scope,
          { name: b.payee.slice(0, 120), amountCents: -amount, frequency: b.repeats, nextDueDate: due, kind: "bill" },
          "detected",
        );
        filed.push({
          kind: "recurring",
          id: r.id,
          label: `Bill: ${b.payee} $${(amount / 100).toFixed(2)} ${b.repeats}, next ${fmtDay(due)}`,
          href: "/finances/bills",
        });
      }
      const t = await createTask(
        scope,
        tz,
        { title: `Pay ${b.payee} ($${(amount / 100).toFixed(2)})`, dueDate: due, dueTime: "09:00", reminder: "1d" },
        "manual",
      );
      filed.push({ kind: "task", id: t.id, label: `Reminder: pay ${b.payee} by ${fmtDay(due)}`, href: `/tasks/${t.id}` });
      return { filed, review: b.due_date ? undefined : "No due date was printed; I set it for a week out. Check it." };
    }
    case "receipt": {
      const r = ex.receipt;
      const amount = cents(r?.total_usd);
      if (!r || !amount) return { filed, review: "Couldn't read the total." };
      const day = date(r.date) ?? today;
      // Already imported from the bank? Don't add it twice.
      const dupes = await queryTransactions(scope, {
        from: addDaysStr(day, -2),
        to: addDaysStr(day, 2),
        minAmountCents: amount,
        maxAmountCents: amount,
        limit: 5,
      });
      if (dupes.length)
        return {
          filed,
          review: `This matches a transaction you already have (${dupes[0].description} on ${fmtDay(dupes[0].date)}), so I didn't add it again.`,
        };
      const account = (await listAccounts(scope)).find((a) => a.type === "credit") ?? (await listAccounts(scope)).find((a) => a.type === "depository");
      if (!account) return { filed, review: "Add an account on Money first, then I can record receipts." };
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
      return { filed };
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
      const r = await createAssignment(
        scope,
        tz,
        {
          courseId: course.id,
          title: s.title.slice(0, 300),
          kind: ex.type === "exam" ? "exam" : "assignment",
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
}

// ------------------------------------------------------------------ pipeline

export type IncomingDocument = Omit<ExtractInput, "today"> & { channel: "email" | "upload" | "share"; from?: string | null; attachmentIds?: string[] };

/** Reads and files one document. Always leaves an inbox row saying what happened. */
export async function processDocument(scope: UserScope, tz: string, today: string, doc: IncomingDocument, extract = extractDocument) {
  const [row] = await scope.tx
    .insert(inboxItems)
    .values({
      userId: scope.userId,
      channel: doc.channel,
      fromAddress: doc.from ?? null,
      subject: doc.subject?.slice(0, 300) ?? doc.files[0]?.filename ?? null,
      attachmentIds: doc.attachmentIds ?? [],
    })
    .returning();
  let ex: Extraction;
  try {
    ex = await extract({ ...doc, today });
  } catch (e) {
    const [failed] = await scope.tx
      .update(inboxItems)
      .set({ status: "failed", reason: e instanceof Error ? e.message.slice(0, 300) : "Couldn't read it." })
      .where(eq(inboxItems.id, row.id))
      .returning();
    return failed;
  }
  const { filed, review } = await fileExtraction(scope, tz, ex, today);
  const [done] = await scope.tx
    .update(inboxItems)
    .set({
      status: filed.length ? "filed" : "needs_review",
      type: ex.type,
      summary: ex.summary.slice(0, 500),
      extracted: ex as unknown as Record<string, unknown>,
      filed,
      reason: review ?? null,
    })
    .where(eq(inboxItems.id, row.id))
    .returning();
  return done;
}

/** Logs an email that was turned away (only who/what, never the content). */
export async function recordIgnored(scope: UserScope, from: string, subject: string, reason: string) {
  await scope.tx
    .insert(inboxItems)
    .values({ userId: scope.userId, channel: "email", fromAddress: from.slice(0, 200), subject: subject.slice(0, 300), status: "ignored", reason });
}

export async function undoInboxItem(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, scope.userId)));
  if (!row) throw new ServiceError("Not found", "not_found");
  if (row.status !== "filed") throw new ServiceError("There's nothing to undo here.");
  for (const f of [...row.filed].reverse()) await undoFiled(scope, f);
  await scope.tx.update(inboxItems).set({ status: "undone" }).where(eq(inboxItems.id, id));
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
