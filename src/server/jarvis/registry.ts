import { z } from "zod";
import { calendarTools } from "./tools/calendar";
import { financeTools } from "./tools/finance";
import { googleTools } from "./tools/google";
import { healthTools } from "./tools/health";
import { memoryTools, noteTools, systemTools } from "./tools/knowledge";
import { overviewTools } from "./tools/overview";
import { schoolTools } from "./tools/school";
import { taskTools } from "./tools/tasks";
import { workTools } from "./tools/work";
import type { ToolDefinition } from "./tool";

export const ALL_TOOLS: ToolDefinition[] = [
  ...overviewTools,
  ...taskTools,
  ...schoolTools,
  ...calendarTools,
  ...financeTools,
  ...workTools,
  ...noteTools,
  ...memoryTools,
  ...googleTools,
  ...healthTools,
  ...systemTools,
] as ToolDefinition[];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
if (byName.size !== ALL_TOOLS.length) throw new Error("Duplicate Jarvis tool names");

export const getTool = (name: string) => byName.get(name);

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

/** Provider-neutral JSON-schema specs for every tool. */
export function toolSpecs(): ToolSpec[] {
  return ALL_TOOLS.map((t) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, parameters };
  });
}
