/**
 * "Your day, connected": the sign-up moment that shows a new user a day with everything
 * connected (the numbers their assistant would see, and what it would do with them) before
 * they connect anything. Pure and seedable, so it's tested and different on every run.
 *
 * Honesty rule: anything invented is marked `example`. Only the user's own answers (name,
 * class, job, assistant name) and the real day and time are shown without the tag.
 */

export type PreviewStage = "student" | "working" | "both" | "life";
export type PreviewChip = { label: string; example: boolean };
export type PreviewStory = {
  id: string;
  kind: "school" | "money" | "work" | "life";
  /** The numbers this suggestion came from. */
  chips: PreviewChip[];
  title: string;
  why: string;
  /** The button, and what it does in the real app (shown when tapped). */
  action: string;
  note: string;
};
export type PreviewInput = { stage: PreviewStage; course?: string; job?: string; now: Date };
export type DayPreview = { sources: string[]; today: string; stories: PreviewStory[] };

type Rand = () => number;
type Ctx = { course: string; job: string; stage: PreviewStage; now: Date; t: Clock; ri: (a: number, b: number) => number; pick: <T>(a: readonly T[]) => T };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const dayName = (d: Date) => DAYS[d.getDay()];
const short = (d: Date) => DAYS[d.getDay()].slice(0, 3);
const ex = (label: string): PreviewChip => ({ label, example: true });

/** 15 → "3 PM", 16.5 → "4:30 PM". */
export function hourLabel(h: number) {
  const hh = Math.floor(h);
  const m = Math.round((h - hh) * 60);
  const ap = hh >= 12 && hh < 24 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`;
}
/** "3 to 5 PM", "10 AM to 12 PM". */
const span = (a: number, b: number) => {
  const s = hourLabel(a);
  const e = hourLabel(b);
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)} to ${e}` : `${s} to ${e}`;
};
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export type Clock = { today: boolean; freeLabel: string; slot: string; slotDay: "today" | "tomorrow"; startH: number };

/** Free time and the next good two-hour slot, from the real clock (late in the day, it plans tomorrow). */
export function previewClock(now: Date, stage: PreviewStage): Clock {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // A class still to go (students) and a 5 PM shift (workers) aren't free time.
  const busy =
    ((stage === "student" || stage === "both") && nowMin < 14 * 60 ? 75 : 0) + ((stage === "working" || stage === "both") && nowMin < 17 * 60 ? 300 : 0);
  const free = 23 * 60 - nowMin - busy;
  const startH = Math.ceil((nowMin + 45) / 60);
  if (free < 150 || startH + 2 > 22) return { today: false, freeLabel: "6h 30m free tomorrow", slot: span(10, 12), slotDay: "tomorrow", startH: 10 };
  const h = Math.floor(free / 60);
  const m = Math.floor((free % 60) / 10) * 10;
  return { today: true, freeLabel: `${h}h${m ? ` ${m}m` : ""} free today`, slot: span(startH, startH + 2), slotDay: "today", startH };
}

/** 14 short stories. Each turns two or three numbers into one thing the assistant would do. */
const STORIES: Record<PreviewStory["kind"], ((c: Ctx) => PreviewStory)[]> = {
  school: [
    (c) => {
      const exam = addDays(c.now, c.ri(2, 4));
      return {
        id: "exam",
        kind: "school",
        chips: [ex(`${c.course} exam · ${short(exam)}`), ex(c.t.freeLabel)],
        title: `Study for ${c.course} ${c.t.slotDay}, ${c.t.slot}.`,
        why: `It's your longest free block before ${dayName(exam)}'s exam.`,
        action: "Block it",
        note: "In the app, this puts the study block on your calendar.",
      };
    },
    (c) => {
      const heavy = addDays(c.now, c.ri(2, 3));
      const before = addDays(heavy, -1);
      return {
        id: "heavy-week",
        kind: "school",
        chips: [ex("3 deadlines · next 4 days"), ex(`${dayName(heavy)} · 7h booked`)],
        title: `${dayName(heavy)} is your heaviest day.`,
        why: `Start the ${c.course} write-up ${dayName(before)} night, so ${dayName(heavy)} is only classes${c.stage === "both" ? " and work" : ""}.`,
        action: "Move it",
        note: `In the app, this adds the write-up to ${dayName(before)} evening.`,
      };
    },
    (c) => {
      const at = c.t.today ? Math.min(c.t.startH + 3, 21) : 20;
      return {
        id: "quiz",
        kind: "school",
        chips: [ex(`${c.course} quiz · tomorrow 9 AM`), ex(`Free at ${hourLabel(at)} ${c.t.today ? "tonight" : "tomorrow"}`)],
        title: `A 20-minute review at ${hourLabel(at)}.`,
        why: `Your ${c.course} quiz is tomorrow morning. I ask the questions, you answer.`,
        action: "Quiz me",
        note: "In the app, this starts a practice quiz. It never does graded work.",
      };
    },
    (c) => ({
      id: "syllabus",
      kind: "school",
      chips: [ex(`${c.course} syllabus · 14 due dates`), ex("Midterm · week 8")],
      title: `Your whole semester of ${c.course}, planned.`,
      why: "All 14 due dates are on your calendar, with study time before the midterm.",
      action: "See them",
      note: "In the app, this opens Due under School.",
    }),
  ],
  money: [
    (c) => {
      const avail = c.ri(18, 46) * 10 + c.ri(1, 9);
      const rent = c.pick([850, 950, 1100]);
      const due = addDays(c.now, c.ri(2, 4));
      return {
        id: "rent",
        kind: "money",
        chips: [ex(`${money(avail)} available`), ex(`Rent ${money(rent)} · due ${short(due)}`)],
        title: `Checking could go below $0 on ${dayName(due)}.`,
        why: `Rent (${money(rent)}) comes out before your next paycheck. Moving $200 from savings would cover it.`,
        action: "Remind me",
        note: "In the app, this sets a reminder. LifeFlow never moves money for you.",
      };
    },
    (c) => {
      const [name, price] = c.pick([
        ["Spotify", 11.99],
        ["Netflix", 15.49],
        ["Uber One", 9.99],
      ] as const);
      return {
        id: "double",
        kind: "money",
        chips: [ex(`${name} ${money(price)} × 2 · Mon`)],
        title: `You were charged twice for ${name}.`,
        why: `Same amount, same day. I wrote the message to get ${money(price)} back.`,
        action: "Show me",
        note: "In the app, this shows the draft. You send it.",
      };
    },
    (c) => {
      const [name, price] = c.pick([
        ["Hulu", 7.99],
        ["Peacock", 7.99],
        ["YouTube Premium", 13.99],
      ] as const);
      return {
        id: "trial",
        kind: "money",
        chips: [ex(`${name} trial · ends tomorrow`), ex(`${money(price)} a month after`)],
        title: `Your ${name} trial turns paid tomorrow.`,
        why: `Cancel today if you don't need it, and keep ${money(price)} a month.`,
        action: "How to cancel",
        note: "In the app, this shows the cancel steps. You decide.",
      };
    },
    (c) => {
      const have = c.ri(22, 46) * 10;
      const goal = c.pick([800, 1000, 1200]);
      const weekly = Math.ceil((goal - have) / 16 / 5) * 5;
      return {
        id: "goal",
        kind: "money",
        chips: [ex(`Trip fund ${money(have)} of ${money(goal)}`)],
        title: `Add ${money(weekly)} a week and your trip is paid in 16 weeks.`,
        why: "That's on time for spring break if you start this week.",
        action: "Set it",
        note: "In the app, this adds a weekly reminder to your goal.",
      };
    },
  ],
  work: [
    (c) => {
      const d = addDays(c.now, c.ri(1, 3));
      const other =
        c.stage === "working"
          ? { chip: `Dentist · ${short(d)} 6:30 PM`, what: "your dentist appointment" }
          : { chip: `${c.course} review · ${short(d)} 6 PM`, what: `the ${c.course} review session` };
      return {
        id: "clash",
        kind: "work",
        chips: [ex(`Shift · ${short(d)} 5 to 10 PM · ${c.job}`), ex(other.chip)],
        title: `Your ${dayName(d)} shift overlaps ${other.what}.`,
        why: "Ask to swap, or start an hour later. I can write the message to your manager.",
        action: "Draft it",
        note: "In the app, this drafts the message. You send it.",
      };
    },
    (c) => {
      const hours = c.pick([12.5, 14.5, 16, 18.5]);
      return {
        id: "hours",
        kind: "work",
        chips: [ex(`${hours} paid hours this week · ${c.job}`)],
        title: `${hours} paid hours at ${c.job} this week.`,
        why: "Unpaid breaks are already taken out. Pay counts only when it lands in your account.",
        action: "See shifts",
        note: "In the app, this opens Work.",
      };
    },
    (c) => {
      const today = c.t.today && c.now.getHours() < 15;
      const when = today ? "today" : "tomorrow";
      return {
        id: "leave",
        kind: "work",
        chips: [ex(`Shift · ${when} 5 PM · ${c.job}`), ex("18 min away")],
        title: `Leave by 4:40 PM for your shift ${when}.`,
        why: `It's 18 minutes to ${c.job}, plus a few to spare.`,
        action: "Remind me",
        note: "In the app, this sends a nudge at 4:30.",
      };
    },
    (c) => {
      const pay = c.ri(38, 62) * 10 + c.ri(1, 9);
      const set = Math.round((pay * 0.25) / 10) * 10;
      return {
        id: "payday",
        kind: "work",
        chips: [ex(`Paycheck ${money(pay)} · ${c.job}`), ex(`Rent fund ${money(950 - set)} of $950`)],
        title: `Payday. Set aside ${money(set)} for rent?`,
        why: `That finishes the rent fund, and you'd still have ${money(pay - set)} for the week. You move it in your bank.`,
        action: "Note it",
        note: "In the app, this marks the rent fund. LifeFlow never moves money.",
      };
    },
  ],
  life: [
    () => ({
      id: "evening",
      kind: "life",
      chips: [ex("Nothing due tonight"), ex("Free after 7 PM")],
      title: "Your evening is free. I kept it that way.",
      why: "Nothing's due until tomorrow afternoon, so I didn't plan anything after 7.",
      action: "Nice",
      note: "In the app, this keeps tonight clear of suggestions.",
    }),
    (c) => ({
      id: "gym",
      kind: "life",
      chips: [ex("Gym streak · 4 days"), ex(c.t.today ? `Free now to ${hourLabel(Math.min(c.t.startH + 1, 22))}` : "Free tomorrow 8 AM")],
      title: "Keep your gym streak going.",
      why: `${c.t.today ? "You're free for the next hour" : "You're free tomorrow at 8"}, and it's day 5 if you go.`,
      action: "Add it",
      note: "In the app, this adds the workout to your plan.",
    }),
  ],
};

export const PREVIEW_STORY_COUNT = Object.values(STORIES).reduce((n, s) => n + s.length, 0);

const ORDER: Record<PreviewStage, PreviewStory["kind"][][]> = {
  // One list of allowed kinds per card, in order.
  student: [["school"], ["money"], ["school", "life"]],
  working: [["work"], ["money"], ["work", "life"]],
  both: [["school"], ["money"], ["work"]],
  life: [["money"], ["life"], ["money", "life"]],
};

const SOURCES: Record<PreviewStage, string[]> = {
  student: ["Bank", "Canvas", "Calendar", "Gmail"],
  working: ["Bank", "Calendar", "Work schedule", "Gmail"],
  both: ["Bank", "Canvas", "Calendar", "Work schedule"],
  life: ["Bank", "Calendar", "Gmail", "Apple Health"],
};

/** Three stories that fit what fills their week, never the same one twice. */
export function previewDay(input: PreviewInput, rand: Rand = Math.random): DayPreview {
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const shuffle = <T>(arr: readonly T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const c: Ctx = {
    course: input.course?.trim() || "BIO 110",
    job: input.job?.trim() || "work",
    stage: input.stage,
    now: input.now,
    t: previewClock(input.now, input.stage),
    ri,
    pick,
  };
  const used = new Set<string>();
  const stories: PreviewStory[] = [];
  for (const kinds of ORDER[input.stage]) {
    const pool = shuffle(kinds.flatMap((k) => STORIES[k]));
    for (const make of pool) {
      const s = make(c);
      if (used.has(s.id)) continue;
      used.add(s.id);
      stories.push(s);
      break;
    }
  }
  const time = input.now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { sources: SOURCES[input.stage], today: `${dayName(input.now)} · ${time}`, stories };
}

/** A small seeded random (mulberry32), for tests and "show me another day". */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
