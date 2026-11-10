/**
 * Replays the last 21 days of one made-up life through the app's own noticing code and records what the app said.
 * Data is loaded the way a sync would bring it: a shift when it was posted, an event when it was created, a charge
 * when it was authorized, an assignment when it was added. Nothing from the future is visible on a replayed day.
 *
 * No AI: the person has not allowed AI (so the web-search and model paths stay off) and tidy runs with llm: null.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { addDaysStr, localToInstant } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { assignments, calendarEvents, categories, courses, employers, financialAccounts, integrations, jarvisMessages, paychecks, transactions, users, workShifts } from "@/server/db/schema";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { cleanVendorName } from "@/lib/vendor";
import { registerUser } from "@/server/services/accounts";
import { keywordCategory } from "@/server/services/finance/categorize";
import { tidyTransactions } from "@/server/services/finance/tidy";
import { subscriptionReport } from "@/server/services/finance/coach";
import { runProactive, type Slot } from "@/server/services/proactive/engine";
import { getBriefing } from "@/server/briefing";
import { randomUUID } from "node:crypto";

export const REPLAY_DAYS = 21;

/** No network at all: any outside call (a model, a web search) is refused and counted. The report prints the count, which must be 0. */
export const blocked = { calls: 0, urls: [] as string[] };
globalThis.fetch = (async (input: any) => {
  blocked.calls++;
  blocked.urls.push(String(input?.url ?? input).replace(/[?#].*$/, "").slice(0, 80));
  throw new Error("grader: outside network calls are blocked");
}) as typeof fetch;

export type Said = {
  /** Local date and time the app looked (as-of). */
  date: string;
  time: string;
  /** "message" = a saved assistant message; "today" = a line on the Today screen; "money-page" = the subscriptions report. */
  surface: "message" | "today" | "money-page";
  kind: string;
  urgent: boolean;
  facts: Record<string, unknown>;
  text?: string;
  /** For Today lines: ids of the records named (mapped back to the simulator's ids). */
  refs?: string[];
};

export type World = {
  name: string;
  dir: string;
  meta: { person: number; kind: string; world: number; quiet: boolean; time_zone: string; summary: string; now: string; replay_start: string };
  said: Said[];
  ms: number;
};

const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const T = (s: string | null | undefined) => (s ? new Date(s) : null);

type Row = Record<string, any>;

export async function replayWorld(dir: string): Promise<World> {
  const t0 = performance.now();
  const meta = J(path.join(dir, "meta.json"));
  const plants: Row[] = J(path.join(dir, "plants.json"));
  const c = (n: string) => J(path.join(dir, "connections", `${n}.json`));
  const bank = c("bank"), work = c("work"), school = c("school"), cal = c("calendar");
  const tz: string = meta.time_zone;
  const db = getDb();
  const user = await registerUser(db, { name: "Grader Person", email: `${randomUUID()}@grader.local`, password: "correct horse battery", timezone: tz });
  const said: Said[] = [];
  const idMap = new Map<string, string>(); // database id -> simulator id
  const simToDb = new Map<string, string>();

  const addedAt = new Map<string, Date>(); // assignment id -> when it was added (planted assignments only)
  const moved = new Map<string, Row>(); // exam id -> planted move
  for (const p of plants) {
    if (p.type === "deadline_after_shift") addedAt.set(p.id, new Date(localToInstant(p.added_at.slice(0, 10), p.added_at.slice(11, 16), tz)));
    if (p.type === "exam_move") moved.set(p.exam_id, p);
  }
  const startOf = (s: string) => new Date(s);

  // ---------------------------------------------------------------- the pieces of a life, each with the moment the app learns of it
  const shifts = (work.shifts as Row[]).filter((s) => s.status !== "cancelled").map((s) => ({ s, known: T(s.posted_at) ?? new Date(startOf(s.starts_at).getTime() - 7 * 86400000) }));
  const events = (cal.events as Row[]).map((e) => ({ e, known: T(e.created_at) ?? new Date(0) }));
  const asg = (school.assignments as Row[]).map((a) => ({ a, known: addedAt.get(a.id) ?? new Date(0) }));
  const pays = (work.paychecks as Row[]).map((p) => ({ p, known: new Date(localToInstant(p.pay_date, "08:00", tz)) }));
  const txs = (bank.transactions as Row[]).map((t) => ({ t, known: new Date(localToInstant(t.authorized_date ?? t.date, "00:00", tz)) }));

  const inserted = new Set<string>();
  const pendingNow = new Set<string>();
  let catByName = new Map<string, string>();
  let acctId = new Map<string, string>();
  let empId = new Map<string, string>();
  let courseId = new Map<string, string>();
  let integrationId = "";

  await withUser(user.id, async (scope) => {
    await scope.tx.update(users).set({ timezone: tz }).where(eq(users.id, user.id));
    const cats = await scope.tx.select({ id: categories.id, name: categories.name }).from(categories);
    catByName = new Map(cats.map((x) => [x.name, x.id]));
    // a connected bank that syncs (the app treats a feed as current to its last sync, not only to its newest charge)
    const [itm] = await scope.tx.insert(integrations).values({ userId: user.id, provider: "plaid", status: "active", externalId: "grader-item", displayName: bank.accounts[0]?.institution_name }).returning({ id: integrations.id });
    integrationId = itm.id;
    for (const a of bank.accounts as Row[]) {
      const [r] = await scope.tx
        .insert(financialAccounts)
        .values({
          userId: user.id, integrationId, name: a.name, officialName: a.official_name, type: a.type, subtype: a.subtype, institutionName: a.institution_name, mask: a.mask,
          currentBalanceCents: 0, availableBalanceCents: 0, creditLimitCents: a.credit_limit_cents, aprBps: a.apr_bps, minPaymentCents: a.min_payment_cents,
          nextPaymentDueDate: a.next_payment_due_date, source: "plaid", providerAccountId: a.provider_account_id,
        })
        .returning({ id: financialAccounts.id });
      acctId.set(a.id, r.id);
    }
    for (const e of work.employers as Row[]) {
      const [r] = await scope.tx
        .insert(employers)
        .values({
          userId: user.id, name: e.name, position: e.position, payType: e.pay_type, hourlyRateCents: e.hourly_rate_cents, annualSalaryCents: e.annual_salary_cents,
          overtimeThresholdHours: String(e.overtime_threshold_hours ?? 40), overtimeMultiplier: String(e.overtime_multiplier ?? 1.5), source: "schedule",
        })
        .returning({ id: employers.id });
      empId.set(e.id, r.id);
    }
    for (const k of school.courses as Row[]) {
      const [r] = await scope.tx
        .insert(courses)
        .values({
          userId: user.id, name: k.name, code: k.code, term: k.term, instructorName: k.instructor_name, instructorEmail: k.instructor_email, location: k.location,
          meetingInfo: k.meeting_info, url: k.url, source: "canvas", providerCourseId: k.provider_course_id,
        })
        .returning({ id: courses.id });
      courseId.set(k.id, r.id);
    }
  });

  /** Brings the database up to what the app would know at `asOf`. Returns what changed (for tidy). */
  const load = (asOf: Date, localDay: string) =>
    withUser(user.id, async (scope) => {
      const sh = shifts.filter((x) => x.known <= asOf && !inserted.has(x.s.id));
      if (sh.length) {
        const rows = await scope.tx
          .insert(workShifts)
          .values(
            sh.map(({ s }) => ({
              userId: user.id, employerId: empId.get(s.employer_id)!, startsAt: startOf(s.starts_at), endsAt: startOf(s.ends_at), breakMinutes: s.break_minutes ?? 0,
              status: (startOf(s.ends_at) <= asOf ? "worked" : "scheduled") as "worked" | "scheduled", source: "schedule" as const,
            })),
          )
          .returning({ id: workShifts.id });
        sh.forEach(({ s }, i) => {
          inserted.add(s.id);
          idMap.set(rows[i].id, s.id);
          simToDb.set(s.id, rows[i].id);
        });
      }
      const ev = events.filter((x) => x.known <= asOf && !inserted.has(x.e.id));
      for (const { e } of ev) {
        const mv = e.kind === "exam" ? [...moved.values()].find((m) => m.exam_id.replace(/^exam-/, "ev-exam-") === e.id) : null;
        // before the exam's move is announced, the old time is the one on the calendar
        const pre = mv && new Date(localToInstant(mv.announced_at.slice(0, 10), mv.announced_at.slice(11, 16), tz)) > asOf;
        const [r] = await scope.tx
          .insert(calendarEvents)
          .values({
            userId: user.id, title: e.title, description: e.description, location: e.location, startsAt: startOf(pre ? mv!.orig_start : e.starts_at), endsAt: startOf(pre ? mv!.orig_end : e.ends_at),
            allDay: e.all_day, kind: e.kind, courseId: e.course_id ? courseId.get(e.course_id) : null, source: e.source, providerEventId: e.provider_event_id,
          })
          .returning({ id: calendarEvents.id });
        inserted.add(e.id);
        idMap.set(r.id, e.id);
        simToDb.set(e.id, r.id);
      }
      const ag = asg.filter((x) => x.known <= asOf && !inserted.has(x.a.id));
      for (const { a } of ag) {
        const mv = moved.get(a.id);
        const pre = mv && new Date(localToInstant(mv.announced_at.slice(0, 10), mv.announced_at.slice(11, 16), tz)) > asOf;
        const [r] = await scope.tx
          .insert(assignments)
          .values({
            userId: user.id, courseId: courseId.get(a.course_id)!, title: a.title, kind: a.kind, dueAt: startOf(pre ? mv!.orig_due : a.due_at), status: "todo",
            pointsPossible: a.points_possible != null ? String(a.points_possible) : null, source: "canvas", providerAssignmentId: a.dedupe_key, dedupeKey: `${a.course_id}:${a.title}:${a.id}`,
          })
          .returning({ id: assignments.id });
        inserted.add(a.id);
        idMap.set(r.id, a.id);
        simToDb.set(a.id, r.id);
      }
      // work the person handed in by now is done (the simulator records when)
      for (const { a } of asg) {
        const key = `done:${a.id}`;
        if (a.completed_at && !inserted.has(key) && T(a.completed_at)! <= asOf && simToDb.get(a.id)) {
          await scope.tx.update(assignments).set({ status: "done", completedAt: T(a.completed_at) }).where(eq(assignments.id, simToDb.get(a.id)!));
          inserted.add(key);
        }
      }
      // an announced move: the exam takes its new time
      for (const [exam, mv] of moved) {
        const key = `moved:${exam}`;
        if (inserted.has(key) || new Date(localToInstant(mv.announced_at.slice(0, 10), mv.announced_at.slice(11, 16), tz)) > asOf) continue;
        const a = asg.find((x) => x.a.id === exam)?.a;
        const e = events.find((x) => x.e.id === exam.replace(/^exam-/, "ev-exam-"))?.e;
        if (a && simToDb.get(a.id)) await scope.tx.update(assignments).set({ dueAt: startOf(a.due_at) }).where(eq(assignments.id, simToDb.get(a.id)!));
        if (e && simToDb.get(e.id)) await scope.tx.update(calendarEvents).set({ startsAt: startOf(e.starts_at), endsAt: startOf(e.ends_at) }).where(eq(calendarEvents.id, simToDb.get(e.id)!));
        inserted.add(key);
      }
      const pk = pays.filter((x) => x.known <= asOf && !inserted.has(x.p.id));
      for (const { p } of pk) {
        await scope.tx.insert(paychecks).values({
          userId: user.id, employerId: empId.get(p.employer_id)!, payDate: p.pay_date, periodStart: p.period_start, periodEnd: p.period_end, grossCents: p.gross_cents, netCents: p.net_cents,
          hours: p.hours != null ? String(p.hours) : null, source: "import",
        });
        inserted.add(p.id);
      }
      // bank: a charge when it was authorized, pending until its posting date
      const tx = txs.filter((x) => x.known <= asOf && !inserted.has(x.t.id));
      if (tx.length) {
        await scope.tx.insert(transactions).values(
          tx.map(({ t }) => {
            const raw = t.merchant_name ?? null;
            const tidy = cleanVendorName(raw || t.description);
            const merchantName = tidy && tidy !== t.description.trim() ? tidy : raw;
            const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${merchantName ?? ""} ${t.description}`);
            const cat = pickCategory(pfc, keywordCategory({ merchantName, description: t.description }, t.amount_cents));
            const pending = t.date > localDay;
            if (pending) pendingNow.add(t.id);
            return {
              userId: user.id, accountId: acctId.get(t.account_id)!, date: t.date, authorizedDate: t.authorized_date, description: String(t.description).slice(0, 300), merchantName,
              amountCents: t.amount_cents, kind: pfc.kind, categoryId: cat ? (catByName.get(cat) ?? null) : null, pending, source: "plaid" as const, providerTransactionId: t.provider_transaction_id,
            };
          }),
        );
        tx.forEach(({ t }) => inserted.add(t.id));
      }
      const posted = [...pendingNow].filter((id) => (txs.find((x) => x.t.id === id)?.t.date ?? "9") <= localDay);
      for (const id of posted) {
        const pid = txs.find((x) => x.t.id === id)!.t.provider_transaction_id;
        await scope.tx.update(transactions).set({ pending: false }).where(eq(transactions.providerTransactionId, pid));
        pendingNow.delete(id);
      }
      // balances: opening plus everything the bank has told us (available includes pending, current only posted)
      for (const a of bank.accounts as Row[]) {
        const mine = txs.filter((x) => x.t.account_id === a.id && inserted.has(x.t.id));
        const all = a.opening_balance_cents + mine.reduce((s, x) => s + x.t.amount_cents, 0);
        const post = a.opening_balance_cents + mine.filter((x) => !pendingNow.has(x.t.id)).reduce((s, x) => s + x.t.amount_cents, 0);
        const owed = a.type === "credit" || a.type === "loan";
        await scope.tx
          .update(financialAccounts)
          .set({ currentBalanceCents: owed ? -post : post, availableBalanceCents: owed ? (a.credit_limit_cents ?? 0) + all : all, balanceUpdatedAt: asOf })
          .where(eq(financialAccounts.id, acctId.get(a.id)!));
      }
      await scope.tx.update(integrations).set({ lastSyncedAt: asOf, status: "active" }).where(eq(integrations.id, integrationId));
      if (tx.length) await tidyTransactions(scope, { llm: null });
    });

  const userRow = { id: user.id, email: "x@grader.local", name: "Grader", timezone: tz, accountKind: "standard" as const, preferences: undefined as any };
  const first = meta.replay_start as string;
  const last = meta.now.slice(0, 10) as string;
  for (let day = first, n = 0; day <= last && n < REPLAY_DAYS; day = addDaysStr(day, 1), n++) {
    // when the scheduler starts each slot, and when a person might open Today
    const looks: { time: string; slot?: Slot; today?: boolean }[] = [
      { time: "07:00", slot: "morning" },
      { time: "08:00", today: true },
      { time: "12:00", slot: "midday" },
      { time: "20:00", slot: "evening" },
      { time: "20:30", today: true },
    ];
    for (const L of looks) {
      if (day === last && L.time > meta.now.slice(11, 16)) continue; // the future of the last day hasn't happened
      const asOf = localToInstant(day, L.time, tz);
      await load(asOf, day);
      await withUser(user.id, async (scope) => {
        if (L.slot) {
          const made = await runProactive({ scope, tz, prefs: undefined, trigger: L.slot, now: asOf });
          if (made.length) await scope.tx.update(jarvisMessages).set({ createdAt: asOf }).where(inArray(jarvisMessages.id, made.map((m) => m.id)));
          for (const m of made) said.push({ date: day, time: L.time, surface: "message", kind: m.kind, urgent: m.urgent, facts: m.facts as Row, text: `${m.title} ${m.body}` });
          if (L.slot === "evening") {
            const rep = await subscriptionReport(scope, day);
            for (const o of rep.overlaps) said.push({ date: day, time: L.time, surface: "money-page", kind: "duplicate_subscription", urgent: false, facts: { group: o.group, names: o.names } });
          }
        }
        if (L.today) {
          const { briefing } = await getBriefing(scope, userRow, asOf);
          for (const i of briefing.insights) {
            const refs = [...i.id.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => idMap.get(m[0]) ?? m[0]);
            said.push({ date: day, time: L.time, surface: "today", kind: i.id.split("-")[0], urgent: i.tone === "attention", facts: {}, text: i.text, refs });
          }
        }
      });
    }
  }
  await db.delete(users).where(eq(users.id, user.id)).catch(() => undefined);
  return { name: path.basename(dir), dir, meta, said, ms: performance.now() - t0 };
}
