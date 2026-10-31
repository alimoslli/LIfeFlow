import { describe, expect, it } from "vitest";
import { buildDayPlan } from "@/server/briefing/day-plan";
import type { LifeSnapshot } from "@/server/briefing/types";
import type { AgendaItem } from "@/server/services/calendar";

const TZ = "America/New_York";
const now = new Date("2026-10-29T14:00:00Z"); // 10:00 AM local
const item = (p: Partial<AgendaItem>): AgendaItem => ({
  key: p.id ?? "k",
  origin: "event",
  id: "e",
  title: "",
  startsAt: now,
  endsAt: null,
  allDay: false,
  kind: "personal",
  color: null,
  subtitle: null,
  href: "/calendar",
  blocksTime: true,
  ...p,
});
const money = {
  liquidCents: 61_000,
  savingsCents: 0,
  creditOwedCents: 0,
  netWorthCents: 61_000,
  asOf: now,
  periodLabel: "Oct 1 to 29, 2026",
  spentThisMonthCents: 290_480,
  incomeThisMonthCents: 0,
  lastMonthSameSpanSpendCents: 200_000,
  billsNext30: [],
  overBudget: [{ category: "Food", spentCents: 95_500, limitCents: 30_000, topMerchant: null, topMerchantChangeCents: null }],
  goals: [],
  investments: null,
  hasDemoData: false,
};
const snap: LifeSnapshot = {
  now,
  tz: TZ,
  today: "2026-10-29",
  firstName: "Ali",
  week: [],
  overdue: [
    { id: "a2", title: "Attendance and Engagement", context: "Business Law", dueAt: new Date("2026-10-28T03:59:00Z"), kind: "assignment", href: "/school/a2" },
    { id: "a1", title: "Components of GDP", context: "Economics", dueAt: new Date("2026-10-25T03:59:00Z"), kind: "assignment", href: "/school/a1" },
  ],
  exams: [],
  freeMinutesByDay: [],
  money,
};

describe("Jarvis day plan", () => {
  it("lists late work oldest first, then today's, and states money exactly", () => {
    const today = [
      item({
        id: "j",
        origin: "task",
        title: "Jeans replies",
        subtitle: "Accounting",
        blocksTime: false,
        startsAt: new Date("2026-10-29T21:00:00Z"),
        href: "/tasks/j",
      }),
    ];
    const p = buildDayPlan(snap, { today, next: null, insights: [] });
    expect(p.priorities.map((x) => [x.title, x.tag])).toEqual([
      ["Components of GDP", "5 days late"],
      ["Attendance and Engagement", "2 days late"],
      ["Jeans replies", "due 5:00 PM"],
    ]);
    expect(p.summary).toEqual([
      "No timed plans today, so it's a good day to get ahead on 3 open things.",
      "2 items are overdue and 1 more is due today.",
      "You're $655 over budget in Food this month; $610 is available now.",
    ]);
    expect(p.next).toMatchObject({ text: "Start with Components of GDP, the oldest late item.", href: "/school/a1" });
  });

  it("hides money when Money is locked and falls back to a friendly next step", () => {
    const p = buildDayPlan({ ...snap, overdue: [] }, { today: [], next: null, insights: [] }, { moneyHidden: true });
    expect(p.summary.join(" ")).not.toMatch(/\$/);
    expect(p.priorities).toEqual([]);
    expect(p.next).toMatchObject({ label: "Plan with Jarvis" });
  });

  it("uses undated to-dos when nothing is late or due, and Jarvis's message as the next step", () => {
    const p = buildDayPlan(
      { ...snap, overdue: [], money: null },
      { today: [], next: null, insights: [] },
      { open: [{ id: "t1", title: "Renew parking permit", priority: "medium", dueAt: null }], jarvisNext: { title: "Rent may not be covered" } },
    );
    expect(p.priorities).toMatchObject([{ title: "Renew parking permit", tag: "no due date" }]);
    expect(p.next).toMatchObject({ text: "Rent may not be covered", href: "/jarvis/says" });
  });
});
