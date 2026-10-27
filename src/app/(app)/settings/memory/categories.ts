import type { MemoryCategory } from "@/server/db/schema";

/** Display order and labels for memory kinds. */
export const CATEGORY_OPTIONS: [MemoryCategory, string][] = [
  ["instruction", "How Jarvis should work"],
  ["preference", "Preference"],
  ["routine", "Routine"],
  ["goal", "Goal"],
  ["project", "Project"],
  ["fact", "Fact"],
  ["temporary", "For now (expires)"],
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS) as Record<MemoryCategory, string>;
