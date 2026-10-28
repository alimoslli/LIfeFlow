import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { buildBriefing, deriveInsights, summarizeDay } from "@/server/briefing/rules";
import { portfolioReturn } from "@/server/services/finance/wealth";
import type { LifeSnapshot } from "@/server/briefing/types";
import type { AgendaItem } from "@/server/services/calendar";

const TZ = "America/New_York";
const TODAY = "2026-10-27"; // Tuesday

const item = (title: string, date: string, start: string, end: string | null, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  key: `${title}-${date}`,
  origin: "event",
  id: title,
  title,
  startsAt: localToInstant(date, start, TZ),
  endsAt: end ? localToInstant(date, end, TZ) : null,
  allDay: false,
  kind: "class",
  color: null,
  subtitle: null,
  href: "/calendar",
  blocksTime: !!end,
  ...extra,
});

function snapshot(over: Partial<LifeSnapshot> = {}): LifeSnapshot {
  return {
    now: localToInstant(TODAY, "09:00", TZ),
    tz: TZ,
    today: TODAY,
    firstName: "Sam",
    week: [],
    overdue: [],
    exams: [],
    freeMinutesByDay: [],
    money: null,
    ...over,
  };
}

const money = (over: Partial<NonNullable<LifeSnapshot["money"]>> = {}): NonNullable<LifeSnapshot["money"]> => ({
  liquidCents: 60_000,
  savingsCents: 400_000,
  creditOwedCents: 20_000,
  netWorthCents: 440_000,
  asOf: null,
  periodLabel: "Oct 1 to 14, 2026",
  spentThisMonthCents: 60_000,
  incomeThisMonthCents: 124_000,
  lastMonthSameSpanSpendCents: 60_000,
  billsNext30: [
    { name: "Phone", date: "2026-10-28", amountCents: -3_000 },
    { name: "Rent", date: "2026-11-01", amountCents: -95_000 },
  ],
  overBudget: [],
  goals: [],
  investments: null,
  hasDemoData: false,
  ...over,
});

describe("briefing", () => {
  it("shows only real money: cash & checking, spent and came in (no projected income)", () => {
    const b = buildBriefing(snapshot({ money: money() }));
    expect(b.money).toEqual({
      liquidCents: 60_000,
      spentCents: 60_000,
      incomeCents: 124_000,
      periodLabel: "Oct 1 to 14, 2026",
      asOf: null,
      safeTodayCents: null,
    });
    expect(buildBriefing(snapshot()).money).toBeNull();
    expect(deriveInsights(snapshot({ money: money() })).some((i) => /payday|expected/i.test(i.text))).toBe(false);
  });

  it("computes portfolio return from holdings with a known cost basis", () => {
    expect(
      portfolioReturn([
        { valueCents: 110_000, costBasisCents: 100_000 },
        { valueCents: 5_000, costBasisCents: null },
      ]),
    ).toBe(10);
    expect(portfolioReturn([{ valueCents: 90_000, costBasisCents: 100_000 }])).toBe(-10);
    expect(portfolioReturn([{ valueCents: 5_000, costBasisCents: null }])).toBeNull();
  });

  it("ranks overdue work and conflicts above everything else", () => {
    const s = snapshot({
      overdue: [{ id: "a", title: "Lab report", context: "BIO 210", dueAt: localToInstant("2026-10-26", "17:00", TZ), kind: "assignment", href: "/" }],
      week: [item("MATH 152", "2026-10-29", "13:00", "14:15"), item("Library shift", "2026-10-29", "12:30", "15:00", { origin: "shift", kind: "work" })],
      money: money({
        overBudget: [{ category: "Food & Dining", spentCents: 82_853, limitCents: 45_000, topMerchant: "DoorDash", topMerchantChangeCents: 12_000 }],
      }),
    });
    const ins = deriveInsights(s);
    expect(ins.slice(0, 3).map((i) => i.id)).toEqual(["overdue", expect.stringMatching(/^conflict/), "budget-Food & Dining"]);
    expect(ins[0].text).toBe("Lab report was due yesterday.");
    expect(ins[1].text).toMatch(/overlaps .* Thursday at 1:00 PM\./);
    expect(ins[2].text).toBe("Food & Dining is $379 over budget this month.");
    expect(ins[2].detail).toBe("DoorDash is up $120 from last month.");
    expect(ins[0].action?.prompt).toContain("Lab report");
  });

  it("suggests study time before an exam, using the user's preference", () => {
    const s = snapshot({
      studyTime: "morning",
      exams: [{ id: "e", title: "Midterm exam", course: "PSY 101", dueAt: localToInstant("2026-11-04", "10:00", TZ), kind: "exam", href: "/" }],
      freeMinutesByDay: [
        { date: "2026-10-27", minutes: 240, longest: 120, morningMinutes: 60 },
        { date: "2026-10-28", minutes: 300, longest: 180, morningMinutes: 180 },
        { date: "2026-10-30", minutes: 200, longest: 120, morningMinutes: 120 },
        { date: "2026-10-31", minutes: 200, longest: 120, morningMinutes: 100 },
      ],
    });
    const [ins] = deriveInsights(s);
    expect(ins.text).toBe("PSY 101 exam is Nov 4.");
    expect(ins.detail).toBe("Wednesday and Friday mornings are open for studying.");
    expect(ins.action?.prompt).toContain("in the morning");
  });

  it("notices spending pace changes but ignores small ones", () => {
    expect(deriveInsights(snapshot({ money: money({ spentThisMonthCents: 66_000 }) })).find((i) => i.id.startsWith("pace"))).toBeUndefined();
    expect(deriveInsights(snapshot({ money: money({ spentThisMonthCents: 90_000 }) })).find((i) => i.id === "pace-up")?.text).toBe(
      "You're spending 50% more than this time last month.",
    );
  });

  it("summarizes the rest of today in plain words", () => {
    const s = snapshot();
    const items = [
      item("PSY 101", TODAY, "10:00", "11:15"),
      item("BIO 210", TODAY, "14:00", "14:50"),
      item("Reading response", TODAY, "23:59", null, { origin: "assignment", kind: "deadline" }),
    ];
    expect(summarizeDay(s, items)).toBe("2 things left on your calendar, free after 2:50 PM. Reading response is due tonight.");
    expect(summarizeDay(s, [])).toBe("Nothing on your calendar today.");
  });

  it("builds a full briefing with the next event and a 7-day glance", () => {
    const s = snapshot({ week: [item("PSY 101", TODAY, "10:00", "11:15"), item("Exam", "2026-10-30", "09:00", "11:00", { kind: "exam" })] });
    const b = buildBriefing(s);
    expect(b.headline).toBe("Good morning, Sam.");
    expect(b.next?.title).toBe("PSY 101");
    expect(b.week).toHaveLength(7);
    expect(b.week[0].label).toBe("Today");
    expect(b.week[3]).toMatchObject({ exam: true, busyMinutes: 120 });
  });
});
