import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { bareCode } from "@/lib/course-label";
import type { Insight } from "@/lib/insights";
import { assignments, courses } from "../../db/schema";
import type { InsightProducer } from "../insights";

/**
 * A class known only by a number (owner, 2026-11-12: "it says 23543 exam is Sunday ... it has to know"). Canvas's calendar
 * feed sends a course's code and never its name, and some schools' codes are a bare number. Until the person names it, the
 * app words that class by the assignment's own title; this asks once, for a class with work coming up, and the answer goes
 * through the skyling's `update_course` (the number stays as the code, so the next sync still finds it).
 */
export const courseNames: InsightProducer = async (scope, _tz, _prefs, now) => {
  const rows = await scope.tx
    .select({ id: courses.id, name: courses.name, code: courses.code, source: courses.source })
    .from(courses)
    .where(and(eq(courses.userId, scope.userId), isNull(courses.archivedAt)));
  // only a class Canvas made that still carries the feed's number as its name: once the person names it (even "101"), the
  // number moves to its code and it is never asked about again (COO review L1)
  const nameless = rows.filter((c) => c.source === "canvas" && !c.code && bareCode(c.name) && c.name.trim());
  if (!nameless.length) return [];
  const busy = await scope.tx
    .selectDistinct({ courseId: assignments.courseId })
    .from(assignments)
    .where(
      and(
        eq(assignments.userId, scope.userId),
        inArray(
          assignments.courseId,
          nameless.map((c) => c.id),
        ),
        gt(assignments.dueAt, now),
      ),
    );
  const coming = new Set(busy.map((b) => b.courseId));
  return nameless
    .filter((c) => coming.has(c.id))
    .slice(0, 1)
    .map((c): Insight => ({
      key: `course-name:${c.id}`,
      kind: "course_name",
      tone: "tip",
      headline: `Which class is ${c.name.trim()}?`,
      why: "Canvas only sends its number. Tell me its name once and I'll use it everywhere.",
      action: { label: "Name it", ask: `My class ${c.name.trim()} is called ` },
      source: "courses",
      rank: 55,
      about: [`course:${c.id}`],
    }));
};
