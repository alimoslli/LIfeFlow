import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { rankInsights, type SkyInsight } from "@/lib/sky-insights";
import { dueMathRule, freeGapRule, freeMinutesBetween, freeWords, tonightRule } from "@/server/briefing/sky-rules";
import type { LifeSnapshot } from "@/server/briefing/types";
import type { AgendaItem } from "@/server/services/calendar";

// Owner, 2026-11-12 (docs/backlog/2026-11-12-useful-sky.md): Tonight from 4 PM, free gaps of 45 minutes or more on class or
// work days (at most two, only with something that fits), and the maths of the next due date. Facts only.

const TZ = "America/New_York";
const TODAY = "2026-11-10"; // Tuesday
const at = (time: string, date = TODAY) => localToInstant(date, time, TZ);

const block = (title: string, start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  key: title,
  origin: "event",
  id: title,
  title,
  startsAt: at(start),
  endsAt: at(end),
  allDay: false,
  kind: "class",
  color: null,
  subtitle: null,
  href: "/calendar",
  blocksTime: true,
  ...extra,
});

const snap = (time: string, over: Partial<LifeSnapshot> = {}): LifeSnapshot => ({
  now: at(time),
  tz: TZ,
  today: TODAY,
  firstName: "Sam",
  week: [],
  overdue: [],
  exams: [],
  freeMinutesByDay: [],
  money: null,
  due: [],
  todos: [],
  ...over,
});

const essay = (due: Date) => ({ id: "a1", title: "Essay draft", course: "ENG 101", dueAt: due, kind: "assignment", href: "/school" });

describe("free time", () => {
  it("counts free minutes once, even when booked things overlap, and only until 11 PM", () => {
    const s = snap("16:00", { week: [block("Work", "17:00", "20:00", { origin: "shift", kind: "work" }), block("Call", "19:00", "21:00")] });
    // 4 to 11 PM is 7 hours; 5 to 9 PM is booked (4 hours, the overlap counted once)
    expect(freeMinutesBetween(s, s.now, at("23:59")).minutes).toBe(180);
  });

  it("says amounts the way people do", () => {
    expect(freeWords(45)).toBe("45 minutes");
    expect(freeWords(60)).toBe("1 hour");
    expect(freeWords(150)).toBe("2.5 hours");
    // never rounded up
    expect(freeWords(175)).toBe("2.5 hours");
    expect(freeWords(59)).toBe("55 minutes");
  });
});

describe("Tonight", () => {
  it("is quiet before 4 PM and after 11 PM", () => {
    expect(tonightRule(snap("15:59"))).toEqual([]);
    expect(tonightRule(snap("23:00"))).toEqual([]);
  });

  it("names the free hours and what's due by tomorrow noon", () => {
    const s = snap("17:00", { week: [block("Work", "18:00", "21:00", { origin: "shift", kind: "work" })], due: [essay(at("09:00", "2026-11-11"))] });
    const [t] = tonightRule(s);
    expect(t.text).toBe("Tonight: 3 hours free");
    expect(t.detail).toBe("Essay draft is due tomorrow 9 AM.");
    // three free hours is room enough: an idea, not a heads-up
    expect(t.weather).toBe("clear");
    expect(t.action).toEqual({ label: "Plan tonight", prompt: "What should I do with tonight?" });
  });

  it("is a heads-up when what's due meets two free hours or less", () => {
    const s = snap("19:00", { week: [block("Work", "19:00", "21:00", { origin: "shift", kind: "work" })], due: [essay(at("23:59"))] });
    const [t] = tonightRule(s);
    expect(t.text).toBe("Tonight: 2 hours free");
    expect(t.weather).toBe("grey");
  });

  it("adds what's left after this week's bills only when money is open", () => {
    const money = {
      liquidCents: 50_000,
      billsNext30: [
        { name: "Phone", date: "2026-11-12", amountCents: -4_000 },
        { name: "Rent", date: "2026-12-01", amountCents: -90_000 },
      ],
    } as unknown as LifeSnapshot["money"];
    expect(tonightRule(snap("17:00", { money }))[0].detail).toBe("Nothing is due before tomorrow noon. $460 left after this week's bills.");
    expect(tonightRule(snap("17:00"))[0].detail).toBe("Nothing is due before tomorrow noon.");
  });
});

describe("free gaps", () => {
  const day = [block("BIO 101", "09:00", "10:15"), block("Work", "13:00", "17:00", { origin: "shift", kind: "work" }), block("CHEM lab", "18:00", "19:00")];

  it("offers the gaps of 45 minutes or more between booked things, each with what fits, at most two", () => {
    const out = freeGapRule(snap("08:00", { week: day, due: [essay(at("09:00", "2026-11-12"))] }));
    expect(out.map((g) => g.text)).toEqual(["2.5 hours free at 10:15 AM, after BIO 101", "1 hour free at 5 PM, after Work"]);
    expect(out[0].detail).toBe("Enough to start Essay draft, due Thursday 9 AM.");
    expect(out[0].action?.block).toEqual({ date: TODAY, start: "10:15", end: "11:45", title: "Work on Essay draft" });
  });

  it("says 'now' for the gap you're in, and skips gaps that have passed", () => {
    const out = freeGapRule(snap("10:30", { week: day, todos: [{ id: "t", title: "Call the bank", dueAt: at("16:00", "2026-11-11"), href: "/tasks" }] }));
    expect(out[0].text).toBe("2.5 hours free now, until Work");
    expect(out[0].detail).toBe("Enough to start Call the bank, due tomorrow 4 PM.");
  });

  it("stays quiet with nothing that fits, on a day without classes or shifts, and for gaps under 45 minutes", () => {
    expect(freeGapRule(snap("08:00", { week: day }))).toEqual([]);
    expect(
      freeGapRule(
        snap("08:00", {
          week: [block("Lunch", "12:00", "13:00", { kind: "personal" }), block("Gym", "15:00", "16:00", { kind: "personal" })],
          due: [essay(at("09:00", "2026-11-12"))],
        }),
      ),
    ).toEqual([]);
    expect(freeGapRule(snap("08:00", { week: [block("A", "09:00", "10:00"), block("B", "10:30", "11:00")], due: [essay(at("09:00", "2026-11-12"))] }))).toEqual(
      [],
    );
  });

  it("never offers a gap after the thing is already due", () => {
    expect(freeGapRule(snap("08:00", { week: day, due: [essay(at("10:00"))] }))).toEqual([]);
  });
});

describe("due-date maths", () => {
  it("is a storm when there's no free time before it's due", () => {
    const s = snap("18:00", { week: [block("Work", "18:00", "23:00", { origin: "shift", kind: "work" })], due: [essay(at("23:30"))] });
    const [d] = dueMathRule(s);
    expect(d.weather).toBe("storm");
    expect(d.text).toBe("No free time before Essay draft is due");
    expect(d.action?.prompt).toContain("Help me find time");
  });

  it("counts the free hours to the due time, with the first free hour to block", () => {
    const s = snap("19:00", { week: [block("Work", "20:00", "23:00", { origin: "shift", kind: "work" })], due: [essay(at("10:00", "2026-11-11"))] });
    const [d] = dueMathRule(s);
    // 7 to 8 PM tonight, then 8 to 10 AM tomorrow: 3 hours
    expect(d.detail).toBe("3 hours free before then.");
    expect(d.weather).toBe("clear");
    expect(d.action?.block).toEqual({ date: TODAY, start: "19:00", end: "20:00", title: "Work on Essay draft" });
  });

  it("only looks three days ahead", () => {
    expect(dueMathRule(snap("09:00", { due: [essay(at("09:00", "2026-11-14"))] }))).toEqual([]);
  });

  it("is a heads-up under three free hours", () => {
    // 9:30 to 11 PM, then 8 to 9 AM
    const [d] = dueMathRule(snap("21:30", { due: [essay(at("09:00", "2026-11-11"))] }));
    expect(d.detail).toBe("Only 2.5 hours free before then.");
    expect(d.weather).toBe("grey");
  });
});

describe("ranking", () => {
  const i = (id: string, weather: SkyInsight["weather"], score: number): SkyInsight => ({
    id,
    kind: id,
    weather,
    headline: id,
    why: null,
    action: null,
    money: false,
    score,
  });

  it("puts storms first, then heads-ups, then ideas, most important first, one per id", () => {
    expect(
      rankInsights([i("idea", "clear", 90), i("storm", "storm", 10), i("grey", "grey", 50), i("grey2", "grey", 70), i("idea", "clear", 1)]).map((x) => x.id),
    ).toEqual(["storm", "grey2", "grey", "idea"]);
  });
});
