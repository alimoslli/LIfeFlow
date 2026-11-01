import { z } from "zod";
import { calendarTools } from "./tools/calendar";
import { financeTools } from "./tools/finance";
import { googleTools } from "./tools/google";
import { healthTools } from "./tools/health";
import { memoryTools, noteTools, systemTools } from "./tools/knowledge";
import { manageTools } from "./tools/manage";
import { moneyCoachTools } from "./tools/money-coach";
import { overviewTools } from "./tools/overview";
import { personalGoalTools } from "./tools/personal-goals";
import { schoolTools } from "./tools/school";
import { taskTools } from "./tools/tasks";
import { webTools } from "./tools/web";
import { workTools } from "./tools/work";
import type { ToolDefinition } from "./tool";
import { GROUP_TOOLS, loadToolsTool, TOOL_GROUPS, type ToolGroup } from "./tool-groups";

export const ALL_TOOLS: ToolDefinition[] = [
  ...overviewTools,
  ...taskTools,
  ...schoolTools,
  ...calendarTools,
  ...financeTools,
  ...moneyCoachTools,
  ...workTools,
  ...noteTools,
  ...memoryTools,
  ...googleTools,
  ...healthTools,
  ...systemTools,
  ...webTools,
  ...manageTools,
  ...personalGoalTools,
  loadToolsTool,
] as ToolDefinition[];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
if (byName.size !== ALL_TOOLS.length) throw new Error("Duplicate Jarvis tool names");

export const getTool = (name: string) => byName.get(name);

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

let specs: ToolSpec[] | null = null;

/** Provider-neutral JSON-schema specs for every tool. Built once: the tools never change at runtime. */
export function toolSpecs(): ToolSpec[] {
  return (specs ??= ALL_TOOLS.map((t) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, parameters };
  }));
}

const bySet = new Map<string, ToolSpec[]>();

/** The specs for these groups (core always included), in a fixed order so the same groups give the same prompt start. */
export function toolSpecsFor(groups: Iterable<ToolGroup>): ToolSpec[] {
  const want = new Set<ToolGroup>(["core", ...groups]);
  const ordered = TOOL_GROUPS.filter((g) => want.has(g));
  const key = ordered.join(",");
  let out = bySet.get(key);
  if (!out) {
    const spec = new Map(toolSpecs().map((t) => [t.name, t]));
    out = ordered.flatMap((g) => GROUP_TOOLS[g].map((n) => spec.get(n)!));
    bySet.set(key, out);
  }
  return out;
}
