import type { ClockData, ClockItem } from "@/lib/day-clock";
import { addDaysStr, formatDateStr, startOfLocalDay } from "@/lib/dates";

/**
 * The made-up day behind the waitlist's "how your sky works" (owner, 2026-11-12). It is built here and nowhere else, in the
 * browser only: never read from or saved to the database. Every item is a kind the real clock already draws, in the shape
 * `dayClockData` (server/services/day-clock.ts) gives it, and every one says "Example" where the real one says where it came from.
 * Times are minutes from the start of today (tomorrow 9:00 AM = 1440 + 540); "now" is the real time, so the sky is day or night
 * like Today's.
 */

const H = 60;
const SOURCE = "Example";

type Made = Partial<ClockItem> & Pick<ClockItem, "title" | "icon" | "cat" | "kind" | "start">;

/** "Slept 7h 10m", as the real recap words it. */
const hm = (hours: number) => {
  const m = Math.round(hours * 60);
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
};

/** Where the clash is: the lecture and the shift overlap from 2:00 to 2:15 PM. Words in the labels use it. */
export const EXAMPLE_CLASH_AT = "2 PM";

export function exampleDay(tz: string, now = new Date()): ClockData {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const dayAt = (offset: number) => offset * 1440;
  const it = (id: string, o: Made): ClockItem => ({ id, end: null, allDay: false, href: "/waitlist", source: SOURCE, subtitle: null, ...o });
  // a real clock never puts "done" later than now
  const base = startOfLocalDay(today, tz).getTime();
  const nowMin = Math.round((now.getTime() - base) / 60_000);

  const items: ClockItem[] = [
    // the morning
    it("ex-run", { title: "Morning run", icon: "🏃", cat: "other", kind: "block", start: 8 * H, end: 8 * H + 40, origin: "event" }),
    it("ex-todo-done", {
      title: "Buy lab goggles",
      icon: "☑️",
      cat: "other",
      kind: "due",
      start: Math.min(8 * H + 50, nowMin),
      subtitle: "Done",
      origin: "task",
      ref: "ex-done",
      done: true,
    }),
    // two classes (one with a place) and a shift that overlaps the second: the clash
    it("ex-bio", {
      title: "Biology lecture",
      icon: "🎓",
      cat: "class",
      kind: "block",
      start: 9 * H + 30,
      end: 10 * H + 45,
      subtitle: "BIO 101 · Science Hall 204",
      origin: "event",
    }),
    it("ex-stats", { title: "Statistics", icon: "🎓", cat: "class", kind: "block", start: 13 * H, end: 14 * H + 15, subtitle: "STAT 210", origin: "event" }),
    it("ex-shift", { title: "Work", icon: "💼", cat: "work", kind: "block", start: 14 * H, end: 18 * H, subtitle: "Campus cafe", origin: "shift" }),
    // due today: a to-do not done yet, an assignment, and a bill
    it("ex-todo", { title: "Return library book", icon: "☑️", cat: "due", kind: "due", start: 16 * H, origin: "task", ref: "ex-todo" }),
    it("ex-due", { title: "Lab report", icon: "📄", cat: "due", kind: "due", start: 17 * H, subtitle: "BIO 101", origin: "assignment", ref: "ex-assignment" }),
    it("ex-bill", {
      title: "Phone bill",
      icon: "💳",
      cat: "due",
      kind: "due",
      start: dayAt(0),
      allDay: true,
      amountCents: 4500,
      origin: "bill",
      href: "/finances/bills",
    }),
    // the night
    it("ex-night", { title: "Lights out", icon: "🔔", cat: "other", kind: "due", start: 22 * H + 30, origin: "reminder" }),
    // tomorrow: the exam is its first thing
    it("ex-exam", {
      title: "Bio midterm",
      icon: "📝",
      cat: "due",
      kind: "block",
      start: dayAt(1) + 9 * H,
      end: dayAt(1) + 10 * H + 30,
      exam: true,
      origin: "event",
    }),
    it("ex-shift-2", {
      title: "Work",
      icon: "💼",
      cat: "work",
      kind: "block",
      start: dayAt(1) + 16 * H,
      end: dayAt(1) + 20 * H,
      subtitle: "Campus cafe",
      origin: "shift",
    }),
    // later in the week, and the days behind
    it("ex-stats-2", {
      title: "Statistics",
      icon: "🎓",
      cat: "class",
      kind: "block",
      start: dayAt(2) + 13 * H,
      end: dayAt(2) + 14 * H + 15,
      subtitle: "STAT 210",
      origin: "event",
    }),
    it("ex-paper", {
      title: "Stats problem set",
      icon: "📄",
      cat: "due",
      kind: "due",
      start: dayAt(3) + 23 * H + 59,
      origin: "assignment",
      ref: "ex-assignment-2",
    }),
    it("ex-bio-1", {
      title: "Biology lecture",
      icon: "🎓",
      cat: "class",
      kind: "block",
      start: dayAt(-1) + 9 * H + 30,
      end: dayAt(-1) + 10 * H + 45,
      subtitle: "BIO 101 · Science Hall 204",
      origin: "event",
    }),
    it("ex-shift-1", {
      title: "Work",
      icon: "💼",
      cat: "work",
      kind: "block",
      start: dayAt(-1) + 15 * H,
      end: dayAt(-1) + 19 * H,
      subtitle: "Campus cafe",
      origin: "shift",
    }),
    it("ex-stats-3", {
      title: "Statistics",
      icon: "🎓",
      cat: "class",
      kind: "block",
      start: dayAt(-2) + 13 * H,
      end: dayAt(-2) + 14 * H + 15,
      subtitle: "STAT 210",
      origin: "event",
    }),
  ];

  // what happened on the days behind, as the real line recaps them: sleep, steps, and what went out and came in
  const recap = (offset: number, facts: [string, string][]) =>
    it(`ex-day-${offset}`, {
      title: facts
        .slice(0, 2)
        .map((f) => f[1])
        .join(" · "),
      icon: facts[0][0],
      cat: "other",
      kind: "due",
      start: dayAt(offset) + 1438,
      subtitle: facts.map((f) => f[1]).join(" · "),
      origin: "day",
      when: formatDateStr(addDaysStr(today, offset), "EEEE"),
      done: true,
      href: "/habits",
    });
  items.push(
    recap(-1, [
      ["😴", `Slept ${hm(7.1)}`],
      ["👟", "6,420 steps"],
      ["💸", "Spent $38"],
      ["💵", "$120 came in"],
    ]),
    recap(-2, [
      ["😴", `Slept ${hm(6.5)}`],
      ["💸", "Spent $52"],
    ]),
  );
  items.sort((a, b) => a.start - b.start);

  const days = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const date = addDaysStr(today, offset);
    return { offset, date, short: offset === 0 ? "Today" : formatDateStr(date, "EEE"), long: formatDateStr(date, "EEE, MMM d") };
  });
  return { tz, today, base, days, items, steps: 2840, sleepHours: 7.2, spentTodayCents: 1350, empty: false };
}
