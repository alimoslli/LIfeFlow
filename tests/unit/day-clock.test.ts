import { describe, expect, it } from "vitest";
import { categoryFor, iconFor, isExam, pileDue, sourceFor, splitEmoji, titleFor } from "@/lib/day-clock";
import { toClockItem, wallMinutes } from "@/server/services/day-clock";
import type { AgendaItem } from "@/server/services/calendar";

const TZ = "America/New_York";

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  key: "event:1:x",
  origin: "event",
  id: "1",
  title: "Thing",
  startsAt: new Date("2026-11-07T14:00:00Z"),
  endsAt: new Date("2026-11-07T15:00:00Z"),
  allDay: false,
  kind: "personal",
  color: null,
  subtitle: null,
  href: "/calendar?date=2026-11-07",
  blocksTime: true,
  ...over,
});

describe("day clock: what each thing is", () => {
  it("picks the icon from the title first, then the kind; a shift is always a briefcase", () => {
    expect(iconFor("Gym with Sam", "personal", "event")).toBe("🏋️");
    expect(iconFor("CHEM 101 Midterm", "class", "event")).toBe("📝");
    expect(iconFor("BIO 110", "class", "event")).toBe("🎓");
    expect(iconFor("Lunch with Ana", "personal", "event")).toBe("🍽️");
    expect(iconFor("Study for exam", "study", "event")).toBe("📚");
    expect(iconFor("Something", "appointment", "event")).toBe("📍");
    expect(iconFor("Work · Campus Coffee", "work", "shift")).toBe("💼");
    expect(iconFor("Essay draft", "deadline", "assignment")).toBe("📄");
    expect(iconFor("Pay phone bill", "task", "task")).toBe("💳");
  });

  it("sorts things into the tiles: shifts, classes and deadlines; everything else is other", () => {
    expect(categoryFor("work", "shift")).toBe("work");
    expect(categoryFor("work", "event")).toBe("work");
    expect(categoryFor("class", "event")).toBe("class");
    expect(categoryFor("exam", "event")).toBe("due");
    expect(categoryFor("deadline", "assignment")).toBe("due");
    expect(categoryFor("task", "task")).toBe("due");
    expect(categoryFor("appointment", "event")).toBe("other");
    expect(categoryFor("study", "event")).toBe("other");
  });

  it("says where it came from in plain words", () => {
    expect(sourceFor("event", ["google"])).toBe("From Google Calendar");
    expect(sourceFor("event", ["google", "outlook"])).toBe("From Google Calendar and Outlook");
    expect(sourceFor("event", ["manual"])).toBe("Added in LifeFlow");
    expect(sourceFor("event", undefined)).toBe("Added in LifeFlow");
    expect(sourceFor("shift", undefined)).toBe("From your work schedule");
    expect(sourceFor("assignment", undefined)).toBe("From your classes");
    expect(sourceFor("task", undefined)).toBe("From your to-dos");
  });

  it("shows a shift as Work, keeping the employer for the card", () => {
    expect(titleFor("Work · Campus Coffee", "shift")).toEqual({ title: "Work", subtitle: "Campus Coffee" });
    expect(titleFor("BIO 110", "event")).toEqual({ title: "BIO 110", subtitle: null });
  });
});

describe("day clock: a pin's emoji", () => {
  it("takes an emoji at the start of the title as the icon, and keeps the rest as the name", () => {
    expect(splitEmoji("✈️ Flight to NYC")).toEqual({ emoji: "✈️", rest: "Flight to NYC" });
    expect(splitEmoji("🏋️‍♀️Gym")).toEqual({ emoji: "🏋️‍♀️", rest: "Gym" });
    expect(splitEmoji("👍🏽 Done")).toEqual({ emoji: "👍🏽", rest: "Done" });
    expect(splitEmoji("Flight ✈️")).toEqual({ emoji: null, rest: "Flight ✈️" });
    expect(splitEmoji("Plain title")).toEqual({ emoji: null, rest: "Plain title" });
    // An emoji alone stays as the name (nothing else to call it).
    expect(splitEmoji("🎂")).toEqual({ emoji: null, rest: "🎂" });
  });

  it("shows a pinned event with its emoji as the icon", () => {
    const pinned = toClockItem(item({ title: "✈️ Flight to NYC" }), TZ, "2026-11-07");
    expect(pinned).toMatchObject({ icon: "✈️", title: "Flight to NYC" });
  });
});

describe("day clock: where things sit in time", () => {
  it("counts wall-clock minutes from the start of today, across days", () => {
    expect(wallMinutes(new Date("2026-11-07T14:00:00Z"), TZ, "2026-11-07")).toBe(9 * 60); // 9:00 AM (EST)
    expect(wallMinutes(new Date("2026-11-08T13:00:00Z"), TZ, "2026-11-07")).toBe(1440 + 8 * 60); // tomorrow 8:00 AM
    expect(wallMinutes(new Date("2026-11-06T22:30:00Z"), TZ, "2026-11-07")).toBe(-1440 + 17 * 60 + 30); // yesterday 5:30 PM
  });

  it("stays on the wall clock across a daylight-saving change", () => {
    // Clocks went back at 2 AM on Nov 1, 2026 in New York: 9 AM is still 540 minutes into that day.
    expect(wallMinutes(new Date("2026-11-01T14:00:00Z"), TZ, "2026-11-01")).toBe(540);
    expect(wallMinutes(new Date("2026-10-31T13:00:00Z"), TZ, "2026-10-31")).toBe(540);
  });

  it("maps a block, a deadline and an all-day event", () => {
    const block = toClockItem(item({}), TZ, "2026-11-07");
    expect(block).toMatchObject({ kind: "block", start: 540, end: 600, allDay: false, cat: "other", source: "Added in LifeFlow" });
    const due = toClockItem(
      item({ origin: "assignment", kind: "exam", title: "Exam 2", endsAt: null, startsAt: new Date("2026-11-09T15:00:00Z"), subtitle: "BIO 110" }),
      TZ,
      "2026-11-07",
    );
    expect(due).toMatchObject({ kind: "due", start: 2 * 1440 + 600, end: null, cat: "due", icon: "📝", subtitle: "BIO 110" });
    const allDay = toClockItem(item({ allDay: true, startsAt: new Date("2026-11-08T05:00:00Z"), endsAt: new Date("2026-11-09T05:00:00Z") }), TZ, "2026-11-07");
    expect(allDay).toMatchObject({ allDay: true, start: 1440, end: null, kind: "due" });
  });
});

// Owner, 2026-11-11: "why does it say 'Exam 253 ... is due on ... day'? That's not how it's supposed to be." An exam
// happens on its day; it's never "due".
describe("exams are never due", () => {
  it("knows an exam by its class or Canvas, or by its title", () => {
    expect(isExam({ title: "MATH 253 Exam 2" })).toBe(true);
    expect(isExam({ title: "Unit 3", exam: true })).toBe(true);
    expect(isExam({ title: "Lab report" })).toBe(false);
  });
  it("a pile of exams or of done things isn't due; deadlines and bills are", () => {
    expect(pileDue("2 exams")).toBe("2 exams");
    expect(pileDue("3 done")).toBe("3 done");
    expect(pileDue("9 assignments")).toBe("9 assignments due");
    expect(pileDue("2 bills")).toBe("2 bills due");
  });
});
