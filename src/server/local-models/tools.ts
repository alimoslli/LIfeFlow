import { ALL_TOOLS } from "../jarvis/registry";
import { GROUP_TOOLS, TOOL_GROUPS, type ToolGroup } from "../jarvis/tool-groups";
import { cosine, embed, embedFixed, localModelOn } from "./embedder";

/** How close a message must be to one of a group's tools (cosine) for that group to come along. */
export const TOOL_MEANING_MIN = 0.35;

/** Each tool's own description (our fixed text), with its group. */
function toolTexts() {
  const groupOf = new Map(Object.entries(GROUP_TOOLS).flatMap(([g, ts]) => ts.map((t) => [t, g as ToolGroup] as const)));
  return ALL_TOOLS.filter((t) => groupOf.get(t.name) && groupOf.get(t.name) !== "core").map((t) => ({
    group: groupOf.get(t.name)!,
    text: `${t.name.replace(/_/g, " ")}: ${t.description.split(/(?<=\.)\s/)[0]}`,
  }));
}

/**
 * The tool groups a message is about by meaning, added to the ones the word lists pick (tool-select.ts). Null when the
 * switch is off or the model isn't there.
 */
export async function meaningGroups(text: string, min = TOOL_MEANING_MIN, on = localModelOn("tools")): Promise<ToolGroup[] | null> {
  if (!on || !text.trim()) return null;
  const tools = toolTexts();
  const [fixed, msg] = await Promise.all([embedFixed("tools", tools.map((t) => t.text)), embed([text])]);
  if (!fixed || !msg) return null;
  const best = new Map<ToolGroup, number>();
  tools.forEach((t, i) => best.set(t.group, Math.max(best.get(t.group) ?? -1, cosine(msg[0], fixed[i]))));
  return TOOL_GROUPS.filter((g) => (best.get(g) ?? -1) >= min);
}
