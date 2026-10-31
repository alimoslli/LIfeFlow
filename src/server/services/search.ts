import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { assignments, calendarEvents, courses, financialGoals, notes, tasks, transactions } from "../db/schema";
import type { UserScope } from "../db/with-user";

export type SearchHit = {
  kind: "task" | "note" | "event" | "assignment" | "course" | "transaction" | "goal";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/** One search box for the whole app (⌘K). Plain substring match, newest first, a few per kind. */
export async function searchEverything(scope: UserScope, q: string, perKind = 5): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_\\]/g, "")}%`;
  const u = scope.userId;
  const t = scope.tx;
  const out: SearchHit[] = [];
  const taskRows = await t
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.userId, u), isNull(tasks.parentId), ilike(tasks.title, like)))
    .orderBy(desc(tasks.updatedAt))
    .limit(perKind);
  out.push(
    ...taskRows.map((r) => ({ kind: "task" as const, id: r.id, title: r.title, subtitle: r.status === "done" ? "Done" : "To-do", href: `/tasks/${r.id}` })),
  );
  const noteRows = await t
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(and(eq(notes.userId, u), or(ilike(notes.title, like), ilike(notes.body, like))))
    .orderBy(desc(notes.updatedAt))
    .limit(perKind);
  out.push(...noteRows.map((r) => ({ kind: "note" as const, id: r.id, title: r.title || "Untitled note", subtitle: "Note", href: `/notes/${r.id}` })));
  const asg = await t
    .select({ id: assignments.id, title: assignments.title, courseId: assignments.courseId })
    .from(assignments)
    .where(and(eq(assignments.userId, u), ilike(assignments.title, like)))
    .orderBy(desc(assignments.updatedAt))
    .limit(perKind);
  out.push(...asg.map((r) => ({ kind: "assignment" as const, id: r.id, title: r.title, subtitle: "Assignment", href: `/school/courses/${r.courseId}` })));
  const crs = await t
    .select({ id: courses.id, name: courses.name, code: courses.code })
    .from(courses)
    .where(and(eq(courses.userId, u), or(ilike(courses.name, like), ilike(courses.code, like))))
    .limit(perKind);
  out.push(
    ...crs.map((r) => ({
      kind: "course" as const,
      id: r.id,
      title: r.code ? `${r.code} ${r.name}` : r.name,
      subtitle: "Class",
      href: `/school/courses/${r.id}`,
    })),
  );
  const ev = await t
    .select({ id: calendarEvents.id, title: calendarEvents.title })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, u), ilike(calendarEvents.title, like)))
    .orderBy(desc(calendarEvents.startsAt))
    .limit(perKind);
  out.push(...ev.map((r) => ({ kind: "event" as const, id: r.id, title: r.title, subtitle: "Event", href: `/calendar?event=${r.id}` })));
  const tx = await t
    .select({
      id: transactions.id,
      description: transactions.description,
      merchant: transactions.merchantName,
      date: transactions.date,
      amount: transactions.amountCents,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, u), or(ilike(transactions.description, like), ilike(transactions.merchantName, like))))
    .orderBy(desc(transactions.date))
    .limit(perKind);
  out.push(
    ...tx.map((r) => ({
      kind: "transaction" as const,
      id: r.id,
      title: r.merchant || r.description,
      subtitle: `${r.date} · ${(r.amount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
      href: `/finances/transactions?q=${encodeURIComponent(term)}&period=all`,
    })),
  );
  const goals = await t
    .select({ id: financialGoals.id, name: financialGoals.name })
    .from(financialGoals)
    .where(and(eq(financialGoals.userId, u), ilike(financialGoals.name, like)))
    .limit(perKind);
  out.push(...goals.map((r) => ({ kind: "goal" as const, id: r.id, title: r.name, subtitle: "Goal", href: "/goals" })));
  return out;
}
