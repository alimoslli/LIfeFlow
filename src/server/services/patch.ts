import type { z } from "zod";

/**
 * Parses an edit. Only the fields the caller sent are kept: Zod would otherwise
 * fill in schema defaults (e.g. kind = "assignment") and an edit of one field
 * would silently reset others.
 */
export function parsePatch<S extends z.ZodType<Record<string, unknown>>>(schema: S, patch: object): Partial<z.output<S>> {
  const d = schema.parse(patch) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(d).filter(([k]) => k in patch)) as Partial<z.output<S>>;
}
