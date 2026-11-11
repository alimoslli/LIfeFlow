import { z } from "zod";
import type { UserScope } from "../../db/with-user";
import { ServiceError } from "../../services/errors";
import { listCourses, resolveCourse } from "../../services/school";

/**
 * A course by its name or code as the user's courses list it (COO, 2026-11-11: the model made up a courseId, got "Course
 * not found" and saved the class without its course); an id from a tool result still works.
 */
export const courseArg = z.string().trim().min(1).max(200).optional().describe("The class it belongs to: its name or code (e.g. 'BIO 201'), or its id");

/**
 * Turns each item's `course` into the user's real course id: the id itself, or a confident match on name or code. An
 * unknown or unclear one is an error that lists their real courses, so the model asks or retries with a real name and
 * nothing is saved half-way.
 */
export async function withCourseIds<T extends { course?: string }>(s: UserScope, list: T[]) {
  const out: (Omit<T, "course"> & { courseId?: string })[] = [];
  for (const { course, ...e } of list) {
    if (!course) {
      out.push(e);
      continue;
    }
    const c = (await resolveCourse(s, { courseId: course })).course ?? (await resolveCourse(s, { courseName: course })).course;
    if (!c) {
      const all = await listCourses(s);
      const names = all.map((x) => (x.code ? `${x.name} (${x.code})` : x.name));
      throw new ServiceError(
        names.length
          ? `"${course}" isn't clearly one of their courses. Their courses: ${names.join(", ")}. Use one of these names, ask which one, or leave course out.`
          : `They have no courses yet, so leave course out (or add the course first if they asked).`,
      );
    }
    out.push({ ...e, courseId: c.id });
  }
  return out;
}
