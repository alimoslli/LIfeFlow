import { z } from "zod";

/** Their full name is optional, private, and at most this long. */
export const FULL_NAME_MAX = 120;

/** Trimmed, inner runs of whitespace collapsed to one space, at most 120 characters. */
export const fullNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().max(FULL_NAME_MAX, `Use ${FULL_NAME_MAX} characters or fewer for your full name.`));

/** The cleaned name, or null for empty (which clears it). Throws a ZodError past the limit. */
export function cleanFullName(raw: string): string | null {
  return fullNameSchema.parse(raw) || null;
}
