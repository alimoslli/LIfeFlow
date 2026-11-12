/**
 * What a class is called on screen (owner, 2026-11-12: "it says 23543 exam is Sunday ... I should be able to read that").
 * Canvas's calendar feed sends only a course's code, and some schools' codes are a bare number (a section or CRN), which
 * means nothing to a person. A label needs a letter in it: the code when it has one ("BIO 110"), else the name, else
 * nothing, and the caller words it without a class (the assignment's own title) until the person names it once.
 */
export const bareCode = (s: string | null | undefined): boolean => !s || !/\p{L}/u.test(s);

export function courseLabel(c: { code?: string | null; name?: string | null }): string | null {
  if (!bareCode(c.code)) return c.code!.trim();
  if (!bareCode(c.name)) return c.name!.trim();
  return null;
}

/** "BIO 110 exam", or the assignment's own title ("Exam 2") when the class has no readable name yet. */
export const examLabel = (course: string | null, kind: string, title: string): string => (course ? `${course} ${kind}` : title);
