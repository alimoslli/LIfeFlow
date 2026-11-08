/**
 * The v3 concept as a claude.ai artifact (owner, 2026-11-08: "go into the concept using the artifacts until we build it
 * into the main page"). It runs the app's own engine (`components/day-clock/engine.ts`) on a made-up student's week,
 * placed around the viewer's real clock, so the artifact is exactly what the branch builds. Pins, Done and Open work
 * in the page only; nothing is saved anywhere. Built by `scripts/dev/build-clock-artifact.ts`.
 */
import { createDayClock, type DayClockHandle } from "@/components/day-clock/engine";
import type { ClockData, ClockDay, ClockItem } from "@/lib/day-clock";

// "See it at 9 AM": the page's clock runs shifted, so the engine (untouched) draws any time of today.
const RealDate = Date;
let shift = 0;
class ShiftedDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length) super(...(a as []));
    else super(RealDate.now() + shift);
  }
  static now() {
    return RealDate.now() + shift;
  }
}
(globalThis as { Date: DateConstructor }).Date = ShiftedDate as DateConstructor;

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/* ---------- dates: calendar days as YYYY-MM-DD, math in UTC so no time zone sneaks in ---------- */
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const parts = (s: string) => s.split("-").map(Number);
const utc = (s: string) => {
  const [y, m, d] = parts(s);
  return Date.UTC(y, m - 1, d);
};
const addDays = (s: string, n: number) => new Date(utc(s) + n * 86_400_000).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
const fmtDay = (s: string, o: Intl.DateTimeFormatOptions) => new Date(utc(s)).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
const mins = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/* ---------- a made-up life: Maya, second-year nursing student, works at a bike shop ---------- */
function exampleLife(today: string): ClockData {
  const items: ClockItem[] = [];
  let n = 0;
  const at = (d: number, hm: string) => d * 1440 + mins(hm);
  const add = (it: Partial<ClockItem> & Pick<ClockItem, "title" | "icon" | "start">) =>
    items.push({
      id: `ex${n++}`,
      kind: "due",
      cat: "other",
      end: null,
      allDay: false,
      href: "/calendar",
      source: "From Google Calendar",
      subtitle: null,
      ...it,
    });
  const block = (d: number, from: string, to: string, title: string, icon: string, more: Partial<ClockItem> = {}) =>
    add({ kind: "block", title, icon, start: at(d, from), end: at(d, to), origin: "event", ...more });
  const cls = (d: number, from: string, to: string, title: string, code: string) =>
    block(d, from, to, title, "🎓", { cat: "class", subtitle: code, href: "/school/courses/x" });
  const shift = (d: number, from: string, to: string) =>
    block(d, from, to, "Work", "💼", { cat: "work", subtitle: "Spoke & Wheel Bikes", href: "/work", source: "From your work schedule", origin: "shift" });
  const deadline = (d: number, hm: string, title: string, code: string, exam = false) =>
    add({
      title,
      icon: exam ? "📝" : "📄",
      cat: "due",
      start: at(d, hm),
      href: "/school/courses/x",
      source: "From your classes",
      subtitle: code,
      origin: "assignment",
      ref: `a${n}`,
    });
  const allDay = (d: number, title: string, icon: string, more: Partial<ClockItem>) => add({ title, icon, start: d * 1440, allDay: true, ...more });
  const todo = (title: string, icon: string, more: Partial<ClockItem> = {}) =>
    add({ title, icon, start: 0, allDay: true, href: "/tasks/x", source: "From your to-dos", origin: "task", ref: `t${n}`, someday: true, ...more });

  // the week, day by day: classes, shifts and the gym by weekday
  for (let d = -3; d <= 3; d++) {
    const wd = new Date(utc(addDays(today, d))).getUTCDay();
    if (wd === 1 || wd === 3 || wd === 5) cls(d, "09:30", "10:45", "Anatomy", "BIO 201 · Hall B");
    if (wd === 2 || wd === 4) {
      cls(d, "11:00", "12:15", "Statistics", "STAT 110");
      cls(d, "14:00", "14:50", "Spanish", "SPAN 102");
      shift(d, "16:00", "21:00");
    }
    if (wd === 1 || wd === 3) block(d, "07:00", "08:00", "Gym", "🏋️");
    if (wd === 6) shift(d, "10:00", "16:00");
    if (wd === 0 && d !== 0) block(d, "11:30", "13:00", "Brunch with Priya", "🍽️");
    if (wd === 5) block(d, "15:00", "16:30", "Study group", "📚");
  }
  // today: studying late, and three deadlines at 11:59 PM (one stop with "+2")
  block(0, "21:30", "23:00", "Study for Anatomy exam", "📚", { source: "Added in LifeFlow" });
  deadline(0, "23:59", "Lab report", "BIO 201");
  deadline(0, "23:59", "Discussion post", "SPAN 102");
  deadline(0, "23:59", "Problem set 6", "STAT 110");
  // tomorrow and the days after
  block(1, "07:30", "08:15", "Run with Priya", "🏃");
  deadline(1, "12:30", "Stats quiz 3", "STAT 110", true);
  add({
    title: "Lab write-up",
    icon: "🧪",
    cat: "due",
    start: at(1, "17:00"),
    href: "/tasks/x",
    source: "From your to-dos",
    subtitle: "high priority",
    origin: "task",
    ref: "lab",
  });
  add({
    title: "Lab write-up",
    icon: "🔔",
    start: at(1, "09:00"),
    href: "/tasks/x",
    source: "Your reminder",
    subtitle: "Due tomorrow at 5:00 PM",
    origin: "reminder",
    ref: "lab",
  });
  deadline(2, "09:30", "Anatomy exam", "BIO 201", true);
  // money (shown with the Money lock open)
  allDay(1, "Phone", "💳", { cat: "due", href: "/finances/bills", source: "From your bills", amountCents: 4500, origin: "bill" });
  allDay(3, "Rent", "💳", { cat: "due", href: "/finances/bills", source: "From your bills", amountCents: 78000, origin: "bill" });
  // behind: the dentist, coffee, a to-do that slipped
  block(-1, "09:00", "09:45", "Dentist", "🦷");
  block(-2, "15:00", "16:00", "Coffee with Sam", "☕");
  add({
    title: "Return library book",
    icon: "📚",
    cat: "due",
    start: -5 * 1440,
    allDay: true,
    href: "/tasks/x",
    source: "From your to-dos",
    origin: "task",
    ref: "lib",
  });
  // further out: plans, a trial, a crowded day weeks away, goals
  allDay(9, "Streamly trial ends", "⏳", {
    href: "/finances/subscriptions",
    source: "From your subscriptions",
    subtitle: "The first charge comes after this day",
    amountCents: 1199,
    origin: "trial",
  });
  block(16, "20:00", "23:00", "Concert with Ana", "🎉");
  block(24, "06:40", "09:15", "Flight home", "✈️");
  allDay(24, "Mom's birthday", "🎂", { kind: "due" });
  deadline(38, "09:00", "Anatomy final", "BIO 201", true);
  allDay(75, "Run a 10k", "🏃", { href: "/goals", source: "From your goals", origin: "goal", ref: "g1" });
  allDay(120, "Summer in Lisbon", "💰", {
    href: "/money",
    source: "Your money goal",
    subtitle: "$640 saved so far",
    amountCents: 180000,
    origin: "money_goal",
  });
  // a life behind: milestones, one known only by its month
  const [y] = parts(today);
  const story = (date: string, title: string, icon: string, when?: string) =>
    allDay(between(today, date), title, icon, { href: "/milestones", source: "From your milestones", origin: "milestone", when });
  story(`${y - 20}-04-09`, "Born", "🎂");
  story(`${y - 3}-07-01`, "First trip abroad", "✈️", `Jul ${y - 3}`);
  story(`${y - 2}-08-26`, "Started college", "🎓");
  story(`${y - 1}-03-04`, "First day at Spoke & Wheel", "🚲");
  allDay(-40, "Read 10 books · reached", "🎯", { href: "/goals", source: "A goal you reached", origin: "milestone" });
  // no day yet: Someday
  for (const [t, i] of [
    ["Call grandma", "📞"],
    ["Fix bike light", "🚲"],
    ["Book a haircut", "💈"],
    ["Email advisor about summer classes", "✉️"],
    ["Sell old textbooks", "📦"],
    ["Back up phone photos", "📱"],
    ["Ask about the RA job", "☑️"],
    ["Cancel old gym", "☑️"],
  ])
    todo(t, i);
  allDay(0, "Cook 10 new dinners", "🍳", { href: "/goals", source: "From your goals", origin: "goal", ref: "g2", someday: true });

  const days: ClockDay[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const date = addDays(today, offset);
    days.push({
      offset,
      date,
      short: offset === 0 ? "Today" : fmtDay(date, { weekday: "short" }),
      long: fmtDay(date, { weekday: "short", month: "short", day: "numeric" }),
    });
  }
  const [yy, mm, dd] = parts(today);
  return {
    tz,
    today,
    base: new Date(yy, mm - 1, dd).getTime(),
    days,
    items: items.sort((a, b) => a.start - b.start),
    steps: 6812,
    sleepHours: 7.2,
    spentTodayCents: 2340,
    empty: false,
  };
}

/* ---------- the page around it: a toast, the pin sheet, and what "Open" would do in the app ---------- */
let toastTimer = 0;
function toast(text: string) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2600);
}
const WHERE: [string, string][] = [
  ["/calendar", "your calendar"],
  ["/work", "your work schedule"],
  ["/school", "the class"],
  ["/tasks", "the to-do"],
  ["/finances/bills", "your bills"],
  ["/finances/subscriptions", "your subscriptions"],
  ["/goals", "your goals"],
  ["/milestones", "your milestones"],
  ["/money", "Money"],
];
const whereOf = (href: string) => WHERE.find(([p]) => href.startsWith(p))?.[1] ?? "that page";

let data = exampleLife(todayStr());
let clock: DayClockHandle | null = null;
const refresh = (items: ClockItem[]) => {
  data = { ...data, items: items.sort((a, b) => a.start - b.start) };
  clock?.update(data);
};

// Pin something: the sheet takes the day and time from where you are on the line.
let kind = "todo";
let emoji = "";
const hhmm = (m: number) =>
  `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
function setKind(k: string) {
  kind = k;
  for (const b of document.querySelectorAll<HTMLElement>("[data-kind]")) b.setAttribute("aria-checked", String(b.dataset.kind === k));
  $("#pin-time-wrap").hidden = !(k === "todo" || k === "plan");
}
function openPin(at: number) {
  const date = addDays(data.today, Math.floor(at / 1440));
  ($("#pin-date") as HTMLInputElement).value = date;
  ($("#pin-time") as HTMLInputElement).value = hhmm(at);
  ($("#pin-name") as HTMLInputElement).value = "";
  emoji = "";
  for (const b of document.querySelectorAll<HTMLElement>("[data-emoji]")) b.setAttribute("aria-checked", "false");
  $("#pin-icon").textContent = "📌";
  setKind(date < data.today ? "milestone" : "todo");
  $("#pin").hidden = false;
  requestAnimationFrame(() => ($("#pin-name") as HTMLInputElement).focus());
}
const closePin = () => ($("#pin").hidden = true);

function savePin(e: Event) {
  e.preventDefault();
  const title = ($("#pin-name") as HTMLInputElement).value.trim();
  const date = ($("#pin-date") as HTMLInputElement).value;
  if (!title || !date) return;
  if (kind === "milestone" && date > data.today) return toast("A milestone is something that happened. Pick a past day.");
  const d = between(data.today, date);
  const start = d * 1440 + (kind === "todo" || kind === "plan" ? mins(($("#pin-time") as HTMLInputElement).value || "09:00") : 0);
  const id = `pin${Date.now()}`;
  const base = { id, title, icon: emoji || "📌", subtitle: null, someday: false } as const;
  const it: ClockItem =
    kind === "plan"
      ? { ...base, kind: "block", cat: "other", start, end: start + 60, allDay: false, href: "/calendar", source: "Added in LifeFlow", origin: "event" }
      : kind === "goal"
        ? { ...base, kind: "due", cat: "other", start, end: null, allDay: true, href: "/goals", source: "From your goals", origin: "goal", ref: id }
        : kind === "milestone"
          ? { ...base, kind: "due", cat: "other", start, end: null, allDay: true, href: "/milestones", source: "From your milestones", origin: "milestone" }
          : { ...base, kind: "due", cat: "due", start, end: null, allDay: false, href: "/tasks/x", source: "From your to-dos", origin: "task", ref: id };
  refresh([...data.items, it]);
  closePin();
  toast(`Pinned to ${fmtDay(date, { weekday: "short", month: "short", day: "numeric" })}.`);
}

function start() {
  const root = $(".dc");
  root.querySelector("[data-dc=hap] input")?.setAttribute("switch", "");
  clock = createDayClock(root, data, {
    onOpen: (href) => toast(`In the app, this opens ${whereOf(href)}.`),
    onNewDay: () => {
      data = exampleLife(todayStr());
      clock?.update(data);
    },
    onPin: ({ start: at }) => openPin(at),
    onDone: (it) => {
      refresh(data.items.filter((x) => x.id !== it.id && !(it.ref && x.ref === it.ref && (x.origin === "task" || x.origin === "reminder"))));
      toast(`Done: ${it.title}.`);
    },
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  $("#pinbtn").addEventListener("click", () => openPin(clock?.pinTime() ?? 0));
  $("#pin-form").addEventListener("submit", savePin);
  $("#pin-cancel").addEventListener("click", closePin);
  $("#pin-back").addEventListener("click", closePin);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#pin").hidden) closePin();
  });
  for (const b of document.querySelectorAll<HTMLElement>("[data-kind]")) b.addEventListener("click", () => setKind(b.dataset.kind ?? "todo"));
  for (const b of document.querySelectorAll<HTMLElement>("[data-emoji]"))
    b.addEventListener("click", () => {
      emoji = emoji === b.dataset.emoji ? "" : (b.dataset.emoji ?? "");
      for (const o of document.querySelectorAll<HTMLElement>("[data-emoji]")) o.setAttribute("aria-checked", String(o.dataset.emoji === emoji));
      $("#pin-icon").textContent = emoji || "📌";
    });
  for (const b of document.querySelectorAll<HTMLElement>("[data-says]")) b.addEventListener("click", () => toast(b.dataset.says ?? ""));
  // See it at a time of today: the same example week, the clock and the line drawn as they'd be then.
  for (const b of document.querySelectorAll<HTMLElement>("[data-at]"))
    b.addEventListener("click", () => {
      const hm = b.dataset.at ?? "";
      if (hm) {
        const t = new RealDate();
        t.setHours(...(hm.split(":").map(Number) as [number, number]), 0, 0);
        shift = t.getTime() - RealDate.now();
      } else shift = 0;
      for (const o of document.querySelectorAll<HTMLElement>("[data-at]")) o.setAttribute("aria-pressed", String(o === b));
      clock?.update(data);
    });
}
start();
