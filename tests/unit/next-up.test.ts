import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { isDueEvent, laterText, nextUpText, pickNextUp, type NextUpItem } from "@/lib/next-up";

const TZ = "America/Chicago";
const at = (date: string, time: string) => localToInstant(date, time, TZ);
let n = 0;
const item = (p: Partial<NextUpItem> & Pick<NextUpItem, "title" | "startsAt">): NextUpItem => ({
  key: `k${n++}`,
  origin: "event",
  endsAt: null,
  allDay: false,
  kind: "class",
  href: "/calendar",
  blocksTime: true,
  ...p,
});
const cls = (title: string, date: string, from: string, to: string) => item({ title, startsAt: at(date, from), endsAt: at(date, to) });
const due = (title: string, date: string, time: string) => item({ title, origin: "assignment", kind: "deadline", startsAt: at(date, time), blocksTime: false });

// Monday 2026-11-16
describe("Today's note: the next real thing in the next 24 hours", () => {
  it("is the next class, and a deadline later tonight rides along so it is never hidden", () => {
    const now = at("2026-11-16", "07:40");
    const picked = pickNextUp([due("Lab report", "2026-11-16", "23:59"), cls("Calculus", "2026-11-16", "10:00", "10:50")], now, TZ)!;
    expect(picked.item.title).toBe("Calculus");
    expect(nextUpText(picked, TZ, now)).toBe("Next: Calculus at 10:00 AM · Lab report due tonight 11:59 PM");
  });

  it("a deadline sooner than the next class comes first", () => {
    const now = at("2026-11-16", "08:00");
    const picked = pickNextUp([cls("Calculus", "2026-11-16", "10:00", "10:50"), due("Quiz 4", "2026-11-16", "09:00")], now, TZ)!;
    expect(nextUpText(picked, TZ, now)).toBe("Quiz 4 due today 9:00 AM");
  });

  it("never points days ahead while something is in the next 24 hours, and says nothing when all is farther", () => {
    const now = at("2026-11-16", "20:00");
    expect(pickNextUp([due("Essay", "2026-11-19", "23:59")], now, TZ)).toBeNull();
    const picked = pickNextUp([due("Essay", "2026-11-19", "23:59"), cls("Biology", "2026-11-17", "09:00", "10:15")], now, TZ)!;
    expect(nextUpText(picked, TZ, now)).toBe("Next: Biology tomorrow at 9:00 AM");
  });

  it("a shift reads as the employer's shift; one on right now is said with when it ends", () => {
    const shift = item({ title: "Work · Target", origin: "shift", kind: "work", startsAt: at("2026-11-16", "16:00"), endsAt: at("2026-11-16", "21:00") });
    const before = pickNextUp([shift], at("2026-11-16", "12:00"), TZ)!;
    expect(nextUpText(before, TZ, at("2026-11-16", "12:00"))).toBe("Next: Target shift at 4:00 PM");
    const during = pickNextUp([shift], at("2026-11-16", "18:00"), TZ)!;
    expect(nextUpText(during, TZ, at("2026-11-16", "18:00"))).toBe("Now: Target shift until 9:00 PM");
  });

  it("an all-day client delivery counts as due; an all-day birthday does not", () => {
    const now = at("2026-11-16", "09:00");
    const delivery = item({ title: "Deliver Rivera wedding gallery", allDay: true, kind: "work", startsAt: at("2026-11-16", "00:00"), blocksTime: false });
    const bday = item({ title: "Mom's birthday", allDay: true, kind: "personal", startsAt: at("2026-11-16", "00:00"), blocksTime: false });
    expect(nextUpText(pickNextUp([bday, delivery], now, TZ)!, TZ, now)).toBe("Deliver Rivera wedding gallery due today");
    expect(pickNextUp([bday], now, TZ)).toBeNull();
    expect(isDueEvent("Logo files due")).toBe(true);
    expect(isDueEvent("Trip to Austin")).toBe(false);
  });

  it("several due in the same part of the day are all named, each with its class (test student p2047, 2026-11-16)", () => {
    const now = at("2026-11-16", "18:50");
    const quiz = (course: string, title: string) => ({ ...due(title, "2026-11-16", "23:59"), subtitle: course });
    const three = [quiz("ANTH 378", "Quiz 10"), quiz("ECON 257", "Quiz 10"), quiz("PHYS 406", "Quiz 5")];
    expect(nextUpText(pickNextUp(three, now, TZ)!, TZ, now)).toBe("Due tonight: ANTH 378 Quiz 10, ECON 257 Quiz 10, PHYS 406 Quiz 5");
    // one alone keeps its time, with its class
    expect(nextUpText(pickNextUp([three[0]], now, TZ)!, TZ, now)).toBe("ANTH 378 Quiz 10 due tonight 11:59 PM");
    // behind the next class, the same list rides along; a fourth and more are counted
    const more = [...three, quiz("HIST 374", "Reading response"), cls("Study group", "2026-11-16", "19:30", "20:30")];
    expect(nextUpText(pickNextUp(more, now, TZ)!, TZ, now)).toBe(
      "Next: Study group at 7:30 PM · Due tonight: ANTH 378 Quiz 10, ECON 257 Quiz 10, PHYS 406 Quiz 5 and 1 more",
    );
  });

  it("with nothing in the next 24 hours, it says so and names the soonest thing after (test student p1027)", () => {
    const now = at("2026-11-16", "21:00");
    const shift = item({
      title: "Work · Valley Fulfillment",
      origin: "shift",
      kind: "work",
      startsAt: at("2026-11-18", "22:00"),
      endsAt: at("2026-11-19", "06:30"),
    });
    const quiz = due("Quiz 4", "2026-11-20", "23:59");
    expect(pickNextUp([shift, quiz], now, TZ)).toBeNull();
    expect(laterText([quiz, shift], now, TZ)?.text).toBe("Nothing in the next 24 hours · Next: Valley Fulfillment shift Wed 10:00 PM");
    expect(laterText([], now, TZ)).toBeNull();
  });

  it("a class that is over is never Next (COO, 2026-11-16: a 6 to 8 PM class at 9:30 PM)", () => {
    const now = at("2026-11-16", "21:30");
    const over = cls("Class", "2026-11-16", "18:00", "20:00");
    expect(pickNextUp([over], now, TZ)).toBeNull();
    const picked = pickNextUp([over, cls("Study for exam", "2026-11-16", "20:30", "22:00"), due("Discussion post", "2026-11-16", "23:59")], now, TZ)!;
    expect(nextUpText(picked, TZ, now)).toBe("Discussion post due tonight 11:59 PM");
  });

  it("finished things are never on the agenda, so a passed deadline never shows", () => {
    const now = at("2026-11-16", "12:00");
    expect(pickNextUp([due("Reading quiz", "2026-11-16", "09:00")], now, TZ)).toBeNull();
  });
});
