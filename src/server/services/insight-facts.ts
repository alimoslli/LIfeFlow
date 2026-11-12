import { addDaysStr, formatDateStr, localDateOf, localTimeOf, startOfLocalDay, todayIn } from "@/lib/dates";
import type { CloudFacts } from "@/lib/idea-clouds";
import type { RawInsight, InsightFact } from "@/lib/insight-clouds";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { listAccounts } from "./finance/accounts";
import { balancesOf } from "./finance/overview";
import { healthSummary } from "./health";
import { listHabits } from "./habits";
import { DETECTORS, type Candidate, type DetectContext } from "./proactive/detectors";
import { listAssignments } from "./school";
import { listTasks } from "./tasks";
import { tonight } from "./tonight";
import { listShifts } from "./work";

/** Under this many hours of sleep is worth saying; a normal night is not news. */
export const SHORT_SLEEP_HOURS = 6;

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};
const meridiem = (hhmm: string) => (Number(hhmm.slice(0, 2)) < 12 ? "AM" : "PM");
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => String(v ?? "");

/** One piece failing (or a slow one) must not blank Today: it runs in its own savepoint and just adds nothing. */
async function safely<T>(scope: UserScope, fn: (s: UserScope) => Promise<T[]>): Promise<T[]> {
  try {
    return await scope.tx.transaction(async (tx) => fn({ ...scope, tx }));
  } catch (e) {
    console.error("insight piece failed", e instanceof Error ? e.name : e);
    return [];
  }
}

/** Which kinds carry their fix with them (the rest only ask, or open a page). */
const WITH_FIX = new Set([
  "bill_short",
  "deadline_conflict",
  "overdue_tasks",
  "spending_pace",
  "subscription_overlap",
  "trial_ending",
  "subscription_price_up",
]);

function fromCandidate(c: Candidate): RawInsight | null {
  const base = baseFact(c);
  if (!base) return null;
  const fix = WITH_FIX.has(c.kind) && c.action && !(c.kind === "deadline_conflict" && c.action.type !== "block_time") ? c.action : undefined;
  return {
    ...base,
    ref: c.dedupeKey,
    action: fix,
    source: { kind: c.kind, topic: c.topic, dedupeKey: c.dedupeKey, facts: c.facts, priority: c.priority, urgent: c.urgent },
  };
}

function baseFact(c: Candidate): InsightFact | null {
  const f = c.facts;
  switch (c.kind) {
    case "bill_short":
      return {
        kind: "bill_short",
        bill: str(f.bill),
        billCents: num(f.billCents),
        dueIn: str(f.dueIn),
        dueDate: str(f.dueDate),
        cashCents: num(f.cashCents),
        shortCents: num(f.shortCents),
        canMoveFromSavings: str(f.options).includes("from savings"),
      };
    case "bill_due":
      return { kind: "bill_due", bill: str(f.bill), billCents: num(f.billCents), dueIn: str(f.dueIn), dueDate: str(f.dueDate), cashCents: num(f.cashCents) };
    case "deadline_conflict": {
      const block = f.blockWhen ? str(f.blockWhen) : undefined;
      return {
        kind: "conflict",
        assignment: str(f.assignment),
        dueDay: str(f.dueDay),
        shiftWhen: str(f.shiftWhen),
        blockWhen: block,
        blockDay: block?.match(/on (\w+) at/)?.[1],
      };
    }
    case "overdue_tasks":
      return { kind: "overdue_todos", total: num(f.total ?? f.count), moved: num(f.count), firstTitle: str(f.firstTitle) };
    case "spending_pace":
      // Only with a concrete fix (a budget with room to cover it): never a bare "you're over" line.
      return f.fromCategory
        ? { kind: "spending_pace", category: str(f.category), overCents: num(f.overCents), fromCategory: str(f.fromCategory), moveCents: num(f.moveCents) }
        : null;
    case "subscription_overlap":
      return { kind: "sub_overlap", names: str(f.names), yearlyCents: num(f.yearlyCents) };
    case "trial_ending":
      return { kind: "trial_ending", name: str(f.name), daysLeft: num(f.daysLeft), thenCents: num(f.thenCents) };
    case "subscription_price_up":
      return { kind: "sub_price_up", name: str(f.name), fromCents: num(f.fromCents), toCents: num(f.toCents) };
    default:
      return null;
  }
}

/**
 * The facts the Today clouds may say, from the person's own records only. Reuses the proactive detectors (read with `fresh`, so
 * nothing is recorded and what was already sent isn't hidden), tonight, and the school, work, task, habit and health services.
 * With the Money lock on, no money piece is read at all. `have` says what the account has, so nothing is queried for no reason.
 */
export async function insightFacts(scope: UserScope, tz: string, have: CloudFacts, now = new Date()): Promise<RawInsight[]> {
  const today = todayIn(tz, now);
  const ctx: DetectContext = { scope, tz, today, now, fresh: true };
  const money = have.bank && !have.moneyLocked;
  const detect = (names: (keyof typeof DETECTORS)[]) =>
    safely(scope, async (s) => {
      const out: RawInsight[] = [];
      for (const n of names)
        for (const c of await DETECTORS[n]({ ...ctx, scope: s })) {
          const f = fromCandidate(c);
          if (f) out.push(f);
        }
      return out;
    });

  const [study, moneyFacts, todo, life, late] = await series(
    // clash between a due date and a long or late shift
    () => (have.dueSoon && have.shifts ? detect(["deadlineConflicts"]) : Promise.resolve([] as RawInsight[])),
    () => (money ? detect(["billsDue", "spendingPace", "subscriptionWatch"]) : Promise.resolve([] as RawInsight[])),
    () => (have.dueSoon || have.classToday ? safely(scope, (s) => daySheet(s, tz, now, today)) : Promise.resolve([] as RawInsight[])),
    () => safely(scope, (s) => lifeBits(s, tz, now, today, money, have.moneyLocked)),
    // to-dos past due, with the move-to-tomorrow fix
    () => detect(["overdueTasks"]),
  );
  return [...study, ...moneyFacts, ...todo, ...life, ...late];
}

/** Tonight's due items and free time, and the busiest of the coming days (what's due plus a shift). */
async function daySheet(scope: UserScope, tz: string, now: Date, today: string): Promise<RawInsight[]> {
  const out: RawInsight[] = [];
  const t = await tonight(scope, tz, now, { includeMoney: false });
  const soon = t.due.filter((d) => !d.late && d.kind !== "to-do");
  if (soon.length) out.push({ kind: "due_soon", titles: soon.map((d) => d.what), due: soon[0].due, today: soon[0].due.startsWith("today") });
  // free hours right before a class: only when nothing is running and nothing else is in between
  const blocks = t.blocks.filter((b) => b.startsAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const next = blocks[0];
  if (next && next.kind === "class" && next.startsAt > now) {
    const hours = Math.floor((next.startsAt.getTime() - now.getTime()) / 3_600_000);
    if (hours >= 1) out.push({ kind: "free_before_class", hours, classTime: next.from.replace(":00", "") });
  }
  const [assignments, shifts] = await series(
    () => listAssignments(scope, tz, { view: "upcoming", now, limit: 50 }),
    () => listShifts(scope, tz, addDaysStr(today, 1), addDaysStr(today, 6)),
  );
  let best: Extract<InsightFact, { kind: "busy_day" }> | null = null;
  for (let k = 1; k <= 6; k++) {
    const date = addDaysStr(today, k);
    const due = assignments.filter((a) => a.dueAt && localDateOf(a.dueAt, tz) === date);
    const shift = shifts.find((s) => localDateOf(s.startsAt, tz) === date);
    if (!(due.length >= 2 || (due.length >= 1 && shift))) continue;
    const size = due.length + (shift ? 1 : 0);
    if (best && size <= best.dueCount + (best.shift ? 1 : 0)) continue;
    const a = shift ? localTimeOf(shift.startsAt, tz) : null;
    const b = shift ? localTimeOf(shift.endsAt, tz) : null;
    best = {
      kind: "busy_day",
      weekday: formatDateStr(date, "EEE"),
      weekdayLong: formatDateStr(date, "EEEE"),
      date,
      dueCount: due.length,
      titles: due.map((x) => x.title),
      shift: a && b ? { from: meridiem(a) === meridiem(b) ? clock(a) : `${clock(a)} ${meridiem(a)}`, to: `${clock(b)} ${meridiem(b)}` } : undefined,
    };
  }
  if (best) out.push(best);
  return out;
}

/** To-dos left today, habits left today, last night's sleep, and Available now when there's no bill to say. */
async function lifeBits(scope: UserScope, tz: string, now: Date, today: string, money: boolean, locked: boolean): Promise<RawInsight[]> {
  const out: RawInsight[] = [];
  const end = startOfLocalDay(addDaysStr(today, 1), tz);
  const [open, done, habits, health, accounts] = await series(
    () => listTasks(scope, { status: "open", dueBefore: end, limit: 100 }),
    () => listTasks(scope, { status: "done", limit: 100 }),
    () => listHabits(scope, today),
    () => healthSummary(scope, tz, 2, now),
    () => (money && !locked ? listAccounts(scope) : Promise.resolve([])),
  );
  const openToday = open.filter((t) => t.dueAt && localDateOf(t.dueAt, tz) === today).length;
  const doneToday = done.filter((t) => t.dueAt && localDateOf(t.dueAt, tz) === today).length;
  if (openToday > 0 && openToday + doneToday >= 2) out.push({ kind: "todos_left", done: doneToday, total: openToday + doneToday });
  const left = habits.filter((h) => h.active && h.cadence === "daily" && h.checkable && !h.doneThisPeriod).length;
  if (left > 0) out.push({ kind: "habits_left", left });
  const sleep = health.metrics.find((m) => m.metric === "sleep_hours");
  if (sleep && sleep.latest.day === today && sleep.latest.value < SHORT_SLEEP_HOURS) out.push({ kind: "sleep", minutes: Math.round(sleep.latest.value * 60) });
  if (accounts.length) out.push({ kind: "available", cashCents: balancesOf(accounts).cashCents });
  return out;
}
