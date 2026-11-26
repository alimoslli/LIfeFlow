import { and, desc, eq } from "drizzle-orm";
import { practiceQuestions } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { getAssignment } from "./school";

/**
 * Exam practice (owner, 2026-11-26, gamechanger 2): the skyling quizzes from the course's own topics in the chat and records
 * each question and whether they got it; the night before the exam it brings back only what they missed. Questions are
 * practice it wrote, never a graded question or its answer (ADR 0016).
 */
export async function recordPractice(scope: UserScope, assignmentId: string, items: { question: string; gotIt: boolean }[], now = new Date()) {
  const work = await getAssignment(scope, assignmentId); // theirs, or not found (FK checks bypass RLS)
  const rows = items
    .map((i) => ({ question: i.question.trim().slice(0, 300), gotIt: i.gotIt }))
    .filter((i) => i.question.length >= 3)
    .slice(0, 20);
  if (rows.length) await scope.tx.insert(practiceQuestions).values(rows.map((r) => ({ ...r, userId: scope.userId, assignmentId, askedAt: now })));
  return { assignment: work.title, saved: rows.length, missed: rows.filter((r) => !r.gotIt).map((r) => r.question) };
}

/** Questions whose latest try was wrong (a later right answer clears it), newest first, at most `limit`. */
export async function missedPractice(scope: UserScope, assignmentId: string, limit = 10) {
  const rows = await scope.tx
    .select({ question: practiceQuestions.question, gotIt: practiceQuestions.gotIt })
    .from(practiceQuestions)
    .where(and(eq(practiceQuestions.userId, scope.userId), eq(practiceQuestions.assignmentId, assignmentId)))
    .orderBy(desc(practiceQuestions.askedAt))
    .limit(400);
  const latest = new Map<string, boolean>();
  for (const r of rows) {
    const k = r.question.toLowerCase().replace(/\s+/g, " ");
    if (!latest.has(k)) latest.set(k, r.gotIt);
  }
  const out: string[] = [];
  for (const r of rows) {
    const k = r.question.toLowerCase().replace(/\s+/g, " ");
    if (latest.get(k) === false && !out.some((q) => q.toLowerCase().replace(/\s+/g, " ") === k)) out.push(r.question);
  }
  return { asked: latest.size, missed: out.slice(0, limit) };
}
