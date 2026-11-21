/**
 * Loads one simulated life (docs/situations: a case or example folder made by simulate.py) into the current database,
 * through the app's own services, so the skyling sees it exactly as it would see a real connected account: bank
 * accounts and transactions, calendar, courses and assignments, jobs and shifts, memories. Made-up data only
 * (ADR 0023). Health data, email and paychecks are left out: the training examples don't need them yet.
 *
 * Used by scripts/gpu/chat-data/generate.ts. Never point it at a real database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createEvent, EVENT_KINDS } from "@/server/services/calendar";
import { ACCOUNT_TYPES, createManualAccount } from "@/server/services/finance/accounts";
import { listCategories } from "@/server/services/finance/categories";
import { createTransaction, TRANSACTION_KINDS } from "@/server/services/finance/transactions";
import { createMemory, MEMORY_CATEGORIES } from "@/server/services/memory";
import { ASSIGNMENT_KINDS, createAssignment, createCourse, updateAssignment } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser } from "../../../tests/helpers";

type J = Record<string, unknown>;
const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as J;
const oneOf = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (v as T[number]) : fallback;
/** "2026-08-24T10:00:00-05:00" is already local time: its date and HH:MM. */
const localParts = (iso: string) => ({ date: iso.slice(0, 10), time: iso.slice(11, 16) });

export type LoadedLife = { session: SessionUser; tz: string; now: Date; nowLocal: string; persona: J; counts: Record<string, number> };

export async function loadLife(caseDir: string): Promise<LoadedLife> {
  const persona = read(caseDir, "persona.json");
  const scenario = read(caseDir, "scenario.json");
  const tz = String(persona.time_zone);
  const c = (f: string) => read(join(caseDir, "connections"), f);
  const bank = c("bank.json"),
    calendar = c("calendar.json"),
    school = c("school.json"),
    work = c("work.json"),
    memories = c("memories.json");

  const u = await makeUser(String(persona.name ?? persona.id));
  await getDb().update(users).set({ timezone: tz }).where(eq(users.id, u.user.id));
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: tz, accountKind: "standard" };
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  await u.run(async (s) => {
    const cats = await listCategories(s);
    const catId = (name: unknown, parent: unknown) =>
      cats.find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase())?.id ??
      cats.find((x) => x.name.toLowerCase() === String(parent ?? "").toLowerCase())?.id ??
      null;

    const accountIds = new Map<string, string>();
    for (const a of bank.accounts as J[]) {
      const row = await createManualAccount(s, {
        name: String(a.name),
        type: oneOf(ACCOUNT_TYPES, a.type, "other"),
        subtype: (a.subtype as string) ?? null,
        institutionName: (a.institution_name as string) ?? null,
        mask: /^\d{2,4}$/.test(String(a.mask ?? "")) ? String(a.mask) : null,
        currentBalanceCents: Number(a.current_balance_cents ?? 0),
      });
      accountIds.set(String(a.id), row.id);
      bump("accounts");
    }
    for (const t of bank.transactions as J[]) {
      const accountId = accountIds.get(String(t.account_id));
      if (!accountId || !t.amount_cents) continue;
      await createTransaction(s, {
        accountId,
        date: String(t.date),
        description: String(t.description),
        merchantName: (t.merchant_name as string) ?? null,
        amountCents: Number(t.amount_cents),
        kind: oneOf(TRANSACTION_KINDS, t.kind, Number(t.amount_cents) < 0 ? "expense" : "income"),
        categoryId: catId(t.category, t.category_parent),
        pending: Boolean(t.pending),
      });
      bump("transactions");
    }

    const courseIds = new Map<string, string>();
    for (const co of (school.courses as J[]) ?? []) {
      const row = await createCourse(s, {
        name: String(co.name),
        code: (co.code as string) ?? null,
        term: (co.term as string) ?? null,
        instructorName: (co.instructor_name as string) ?? null,
        location: (co.location as string) ?? null,
        meetingInfo: (co.meeting_info as string) ?? null,
      });
      courseIds.set(String(co.id), row.id);
      bump("courses");
    }
    for (const a of (school.assignments as J[]) ?? []) {
      const courseId = courseIds.get(String(a.course_id));
      if (!courseId) continue;
      const due = typeof a.due_at === "string" ? localParts(a.due_at) : null;
      const r = await createAssignment(s, tz, {
        courseId,
        title: String(a.title),
        kind: oneOf(ASSIGNMENT_KINDS, a.kind, "other"),
        dueDate: due?.date ?? null,
        dueTime: due?.time ?? null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
      });
      if (a.status === "done") await updateAssignment(s, tz, r.assignment.id, { status: "done", grade: (a.grade as string) ?? null });
      bump("assignments");
    }

    for (const e of calendar.events as J[]) {
      const start = localParts(String(e.starts_at));
      const end = e.ends_at ? localParts(String(e.ends_at)) : null;
      await createEvent(s, tz, {
        title: String(e.title),
        date: start.date,
        allDay: Boolean(e.all_day),
        startTime: e.all_day ? null : start.time,
        endTime: e.all_day || !end ? null : end.time,
        endDate: end && end.date !== start.date ? end.date : null,
        kind: oneOf(EVENT_KINDS, e.kind, "other"),
        location: (e.location as string) ?? null,
        description: (e.description as string) ?? null,
        courseId: courseIds.get(String(e.course_id)) ?? null,
      });
      bump("events");
    }

    const jobIds = new Map<string, string>();
    for (const j of (work.employers as J[]) ?? []) {
      const row = await createEmployer(s, {
        name: String(j.name),
        position: (j.position as string) ?? null,
        payType: j.pay_type === "salary" ? "salary" : "hourly",
        hourlyRateCents: (j.hourly_rate_cents as number) ?? null,
        annualSalaryCents: (j.annual_salary_cents as number) ?? null,
      });
      jobIds.set(String(j.id), row.id);
      bump("jobs");
    }
    for (const sh of (work.shifts as J[]) ?? []) {
      const employerId = jobIds.get(String(sh.employer_id));
      if (!employerId || sh.status === "cancelled") continue;
      const st = localParts(String(sh.starts_at));
      const en = localParts(String(sh.ends_at));
      await createShift(s, tz, {
        employerId,
        date: st.date,
        startTime: st.time,
        endTime: en.time,
        breakMinutes: Number(sh.break_minutes ?? 0),
        breakPaid: Boolean(sh.break_paid),
        notes: (sh.notes as string) ?? null,
      });
      bump("shifts");
    }

    for (const m of (memories.memories as J[]) ?? []) {
      if (m.status !== "active") continue;
      await createMemory(s, { content: String(m.content).slice(0, 500), category: oneOf(MEMORY_CATEGORIES, m.category, "fact") }, "user");
      bump("memories");
    }
  });

  // The scenario's "now" is local time in the person's zone; the loop takes an instant.
  const nowLocal = String(scenario.now);
  const now = localToInstantGuess(nowLocal, String(calendar.synced_at ?? ""));
  return { session, tz, now, nowLocal, persona, counts };
}

/** Turns the scenario's local "now" into an instant, using the UTC offset the simulator wrote on the same sync. */
function localToInstantGuess(local: string, syncedAt: string) {
  const offset = /([+-]\d{2}:\d{2})$/.exec(syncedAt)?.[1] ?? "+00:00";
  return new Date(`${local}:00${offset}`);
}
