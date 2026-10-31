import { z } from "zod";
import { healthSummary, logHealth, MANUAL_METRICS } from "../../services/health";
import { dateArg, defineTool } from "../tool";

/** Apple Health data the user's iOS Shortcut sent. Read-only; never medical advice. */
export const healthTools = [
  defineTool({
    name: "get_health_summary",
    description:
      "The user's Apple Health daily totals sent by their iOS Shortcut (steps, active energy, exercise, sleep, resting heart rate, weight, distance, mindful minutes): latest value, average and daily series. " +
      "Includes anything the user logged by hand. If nothing is returned, nothing is recorded yet: offer to log it or point them to Connected accounts for Apple Health. Describe trends plainly; never diagnose or give medical advice.",
    schema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
    mutates: false,
    async execute({ days }, ctx) {
      const s = await ctx.run((scope) => healthSummary(scope, ctx.tz, days, ctx.now));
      if (!s.metrics.length)
        return { connected: false, note: "Nothing recorded in this period. The user can log it by hand or connect Apple Health in Connected accounts." };
      return { connected: true, ...s, lastReceivedAt: s.lastReceivedAt?.toISOString() ?? null };
    },
  }),
  defineTool({
    name: "log_health",
    description:
      "Record a day's health number the user told you: sleep_hours, steps, exercise_minutes, mindful_minutes or weight_kg (convert pounds to kg). Replaces that day's value. Never diagnose.",
    schema: z.object({ metric: z.enum(MANUAL_METRICS), value: z.number().min(0), date: dateArg().optional() }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run((s) => logHealth(s, ctx.tz, a, ctx.now));
      return { saved: r, viewAt: "/habits" };
    },
  }),
];
