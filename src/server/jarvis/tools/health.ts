import { z } from "zod";
import { healthSummary } from "../../services/health";
import { defineTool } from "../tool";

/** Apple Health data the user's iOS Shortcut sent. Read-only; never medical advice. */
export const healthTools = [
  defineTool({
    name: "get_health_summary",
    description:
      "The user's Apple Health daily totals sent by their iOS Shortcut (steps, active energy, exercise, sleep, resting heart rate, weight, distance, mindful minutes): latest value, average and daily series. " +
      "If nothing is returned, Health isn't set up: point them to Settings, Integrations. Describe trends plainly; never diagnose or give medical advice.",
    schema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
    mutates: false,
    async execute({ days }, ctx) {
      const s = await ctx.run((scope) => healthSummary(scope, ctx.tz, days, ctx.now));
      if (!s.metrics.length) return { connected: false, note: "No Apple Health data received in this period. Set it up in Settings, Integrations." };
      return { connected: true, ...s, lastReceivedAt: s.lastReceivedAt?.toISOString() ?? null };
    },
  }),
];
