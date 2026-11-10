import { z } from "zod";
import { tonight } from "../../services/tonight";
import { defineTool } from "../tool";

export const tonightTools = [
  defineTool({
    name: "tonight",
    description:
      "The next 24 hours on one page, from the user's own records: what is due, the shifts, classes and events, the free hours left before bed, and what money is left after this week's bills (left out when Money is locked). Call it BEFORE the user decides something small (going out, buying food, taking a shift, skipping a study block) and whenever they ask 'can I', 'should I', or 'what does tonight look like'. A plain 'can I afford $X' is check_affordability's job, not this one. To show what a plan costs, pass `plan` with only numbers the user gave you or that are plainly in the request (never invent a price or a length of time; ask).",
    schema: z.object({
      plan: z
        .object({
          label: z.string().max(60).optional().describe("Short name, like 'dinner out'"),
          spendDollars: z.number().min(0).max(100_000).optional(),
          hours: z.number().min(0).max(24).optional(),
        })
        .optional(),
    }),
    mutates: false,
    async execute({ plan }, ctx) {
      const r = await ctx.run((s) =>
        tonight(s, ctx.tz, ctx.now, {
          includeMoney: !ctx.moneyLocked,
          plan: plan && { label: plan.label, hours: plan.hours, spendCents: plan.spendDollars != null ? Math.round(plan.spendDollars * 100) : undefined },
        }),
      );
      // Dollars for the model; cents stay in the service.
      const d = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);
      return {
        ...r,
        cash: r.cash && {
          cash: d(r.cash.cashCents),
          billsThisWeek: d(r.cash.billsThisWeekCents),
          leftAfterBills: d(r.cash.leftAfterBillsCents),
          bills: r.cash.bills.map((b) => ({ name: b.name, date: b.date, amount: d(b.amountCents) })),
        },
        tradeoff: r.tradeoff && {
          label: r.tradeoff.label,
          freeMinutesAfter: r.tradeoff.freeMinutesAfter,
          overFreeTime: r.tradeoff.overFreeTime,
          leftAfterBillsAfter: d(r.tradeoff.leftAfterBillsAfterCents),
          wouldDipBelowZero: r.tradeoff.wouldDipBelowZero,
          itemsStillDue: r.tradeoff.itemsStillDue,
        },
        moneyLocked: ctx.moneyLocked ? "Money is locked with Face ID on this device, so money was left out." : undefined,
        viewAt: "/",
      };
    },
  }),
];
