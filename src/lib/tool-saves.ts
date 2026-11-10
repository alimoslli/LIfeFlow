/**
 * Whether a skyling tool saves or changes something (a to-do, an event, a bill, a sync), as opposed to only looking
 * something up (the agenda, free time, the money overview). Only saving tools get a "✓ Saved" line in an answer and make
 * Today redraw (COO, 2026-11-10: lookups showed "✓ Done" twice, and refreshing after them made Today jump mid-answer).
 * A new tool that saves follows the same verb prefixes; tests/unit/tool-saves.test.ts checks every registered tool.
 */
const SAVES =
  /^(add|create|update|delete|edit|save|set|make|log|record|remove|cancel|resolve|contribute|apply|import|recategorize|categorize|forget|send|sync)_/;

export const savesSomething = (name: string) => SAVES.test(name) || name === "check_habit";
