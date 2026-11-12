import type { ProactiveAction } from "@/server/db/schema";
import type { IdeaCloud, Weather } from "./idea-clouds";
import { cloudsFrom, type Insight } from "./insights";
import { usd } from "./jarvis-voice";

/**
 * Insight clouds (owner, 2026-11-12): the clouds on Today say something true and useful about the person's own week, not
 * what to say to the skyling. The services find the facts (services/insight-facts.ts, from the detectors, tonight and the
 * other services); this file words them (about 8 words, real names, days, times and amounts), ranks them (a clash or a
 * shortfall before a curiosity), and keeps at most three with never two about the same thing, nor one the skyling's note
 * already says. Tapping fills the chat bar with `ask`: a precise question or the one fix, never sent for them.
 *
 * Pure and tested in tests/unit/insight-clouds.test.ts. Rules: no guilt words, no scolding (owner, 2026-11-11: "we
 * shouldn't think our users are dumb"), every number comes from a record, nothing money while the Money lock is on
 * (the service never gathers it), no em dashes.
 */
export type InsightFact =
  | { kind: "bill_short"; bill: string; billCents: number; dueIn: string; dueDate: string; cashCents: number; shortCents: number; canMoveFromSavings: boolean }
  | { kind: "bill_due"; bill: string; billCents: number; dueIn: string; dueDate: string; cashCents: number }
  | { kind: "conflict"; assignment: string; dueDay: string; shiftWhen: string; blockWhen?: string; blockDay?: string; blockStart?: string }
  | { kind: "due_soon"; titles: string[]; due: string; today: boolean }
  | { kind: "busy_day"; weekday: string; weekdayLong: string; date: string; dueCount: number; titles: string[]; shift?: { from: string; to: string } }
  | { kind: "overdue_todos"; total: number; moved: number; firstTitle: string }
  | { kind: "spending_pace"; category: string; overCents: number; fromCategory: string; moveCents: number }
  | { kind: "sub_overlap"; names: string; yearlyCents: number }
  | { kind: "trial_ending"; name: string; daysLeft: number; thenCents: number }
  | { kind: "sub_price_up"; name: string; fromCents: number; toCents: number }
  | { kind: "free_before_class"; hours: number; classTime: string }
  | { kind: "sleep"; minutes: number }
  | { kind: "todos_left"; done: number; total: number }
  | { kind: "habits_left"; left: number }
  | { kind: "available"; cashCents: number };

/**
 * A fact plus, when the detector offered one, its fix. Server only: `ref` (the detector's own key for it) is all that
 * reaches the browser, and the server finds the fix again from the person's records when they tap (services/idea-clouds.ts).
 */
export type RawInsight = InsightFact & {
  ref?: string;
  action?: ProactiveAction;
  /** The detector's candidate, kept so a tapped fix is recorded like any other (a message with Undo). */
  source?: { kind: string; topic: string; dedupeKey: string; facts: Record<string, unknown>; priority: number; urgent?: boolean };
};
export type InsightCloud = IdeaCloud;

export const MAX_WORDS = 8;
const words = (t: string) => t.trim().split(/\s+/).length;
/** The first wording that fits in eight words. */
const fit = (...options: string[]) => options.find((o) => words(o) <= MAX_WORDS) ?? options[options.length - 1];
/** A real name kept whole, or cut at a word boundary when long. */
const name = (t: string, max = 22) => {
  if (t.length <= max) return t;
  const cut = t.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut || t.slice(0, max)}…`;
};
const when = (dueIn: string, date: string, weekday: (d: string) => string) => (/^(today|tomorrow)$/.test(dueIn) ? dueIn : weekday(date));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hm = (min: number) => (min % 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${Math.floor(min / 60)}h`);
const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

type Described = {
  say: string;
  why: string;
  cta: string;
  weather: Weather;
  bolt?: boolean;
  ask: string;
  priority: number;
  about: string[];
};
const abbr = (day?: string) => (day ? day.slice(0, 3) : "");
/** "2 hours on Wednesday at 9 AM" as "Wed 9 AM". */
const blockShort = (when: string) => {
  const m = when.match(/on (\w+) at (.+)$/);
  return m ? `${abbr(m[1])} ${m[2]}` : "";
};

/** Wording, weather, ranking weight and what it is about, for one fact. `about` keys stop two clouds saying the same thing. */
export function describe(f: RawInsight, skyling = "Ray"): Described {
  switch (f.kind) {
    case "bill_short": {
      const soon = f.dueIn === "today" || f.dueIn === "tomorrow";
      const day = when(f.dueIn, f.dueDate, shortDay);
      return {
        say: fit(`${name(f.bill, 14)} ${usd(f.billCents)} ${day}, you have ${usd(f.cashCents)}`, `${name(f.bill, 14)} ${usd(f.billCents)} ${day}`),
        why: `That's ${usd(f.shortCents)} short, so there's time to plan it.`,
        cta: f.action ? "Remind me to cover it" : "Show me my options",
        weather: "storm",
        bolt: soon,
        ask: `${f.bill} is ${usd(f.billCents)} ${soon ? f.dueIn : `on ${shortDay(f.dueDate)}`} and I have ${usd(f.cashCents)}. ${
          f.canMoveFromSavings ? `Move ${usd(f.shortCents)} from savings to cover it.` : "What are my ways to cover it?"
        }`,
        priority: 100,
        about: ["shortfall"],
      };
    }
    case "bill_due": {
      const soon = f.dueIn === "today" || f.dueIn === "tomorrow";
      const day = when(f.dueIn, f.dueDate, shortDay);
      return {
        say: fit(`${name(f.bill, 14)} ${usd(f.billCents)} ${day}, you have ${usd(f.cashCents)}`, `${name(f.bill, 14)} ${usd(f.billCents)} ${day}`),
        why: f.cashCents >= f.billCents ? `That leaves ${usd(f.cashCents - f.billCents)} after it.` : "Checking plus cash, right now.",
        cta: "See what's left",
        weather: soon ? "heads-up" : "tip",
        ask: `${f.bill} is ${usd(f.billCents)} ${soon ? f.dueIn : `on ${shortDay(f.dueDate)}`}. What will I have left after it?`,
        priority: soon ? 74 : 58,
        about: ["bills", "shortfall"],
      };
    }
    case "conflict": {
      const day = abbr(f.dueDay);
      return {
        say: f.blockWhen
          ? fit(
              `${name(f.assignment)} due ${day}: 2 free hours ${blockShort(f.blockWhen)}`,
              `${name(f.assignment)} due ${day}, ${f.shiftWhen.replace(/^(\w{3})\w*/, "$1")}`,
              `${name(f.assignment)} due ${day}`,
            )
          : fit(
              `${name(f.assignment)} due ${day}, ${f.shiftWhen.replace(/^(\w{3})\w*/, "$1")}`,
              `${name(f.assignment)} due ${day} after a shift`,
              `${name(f.assignment)} due ${day}`,
            ),
        why: f.blockWhen ? `You work ${f.shiftWhen}. ${blockShort(f.blockWhen)} is free.` : `You work ${f.shiftWhen}, with no 2 free hours before it.`,
        cta: f.blockWhen && f.action ? `Block ${blockShort(f.blockWhen)}` : "Find me time",
        weather: "storm",
        bolt: !f.blockWhen,
        ask: f.blockWhen
          ? `Block ${f.blockWhen} to work on ${f.assignment}.`
          : `${f.assignment} is due ${f.dueDay} and I work ${f.shiftWhen}. Where can I fit it in?`,
        priority: 88,
        about: ["conflict", `due:${f.assignment.toLowerCase()}`],
      };
    }
    case "due_soon": {
      const [first, ...rest] = f.titles;
      return {
        say: fit(
          `${name(first)} due ${f.due}${rest.length ? `, +${rest.length} more` : ""}`,
          `${name(first)} due ${f.due}`,
          `${plural(f.titles.length, "thing")} due soon`,
        ),
        why: "Due within the next 24 hours.",
        cta: `Plan it with ${skyling}`,
        weather: "heads-up",
        ask: rest.length
          ? `${f.titles.length} things are due in the next day, ${first} first. Help me get through them.`
          : `Help me finish ${first} before it's due ${f.due}.`,
        priority: f.today ? 86 : 78,
        about: ["due", ...f.titles.map((t) => `due:${t.toLowerCase()}`)],
      };
    }
    case "busy_day": {
      const dues = f.dueCount ? `${f.dueCount} due` : "";
      const shift = f.shift ? `${f.shift.from} to ${f.shift.to} shift` : "";
      return {
        say: fit(
          `${f.weekday}: ${[dues, shift].filter(Boolean).join(", ")}`,
          `${f.weekday}: ${[dues, f.shift ? "a shift" : ""].filter(Boolean).join(" and ")}`,
        ),
        why: "The fullest day coming up this week.",
        cta: "Plan the day",
        weather: "heads-up",
        ask: `${f.weekdayLong} has ${[dues, shift && `a ${shift}`].filter(Boolean).join(" and ")}. Help me plan it.`,
        priority: 66,
        about: ["load", `day:${f.date}`, ...f.titles.map((t) => `due:${t.toLowerCase()}`)],
      };
    }
    case "overdue_todos":
      return {
        say: f.total === 1 ? fit(`"${name(f.firstTitle, 28)}" is past due`, "1 to-do is past due") : `${f.total} to-dos are past due`,
        why: "One tap moves them to tomorrow.",
        cta: f.moved < f.total ? `Move ${f.moved} to tomorrow` : "Move to tomorrow",
        weather: "heads-up",
        ask: f.total === 1 ? `Move "${f.firstTitle}" to tomorrow.` : `Move my ${f.total} past due to-dos to tomorrow.`,
        priority: 40,
        about: ["overdue"],
      };
    case "spending_pace":
      return {
        say: fit(`${name(f.category, 14)} is ${usd(f.overCents)} over your usual this week`, `${name(f.category, 14)}: ${usd(f.overCents)} over usual`),
        why: `${name(f.fromCategory, 16)} has room to cover it.`,
        cta: `Move ${usd(f.moveCents)} from ${name(f.fromCategory, 10)}`,
        weather: "heads-up",
        ask: `Move ${usd(f.moveCents)} from ${f.fromCategory} to ${f.category} this month.`,
        priority: 50,
        about: ["spending"],
      };
    case "sub_overlap":
      return {
        say: fit(`${f.names}: about ${usd(f.yearlyCents)} a year`, `Two similar services: about ${usd(f.yearlyCents)} a year`),
        why: "Services that do the same job.",
        cta: "Take a look",
        weather: "tip",
        ask: `I pay for ${f.names}, about ${usd(f.yearlyCents)} a year. Do I need all of them?`,
        priority: 48,
        about: ["subs"],
      };
    case "trial_ending": {
      const left = f.daysLeft <= 0 ? "today" : f.daysLeft === 1 ? "tomorrow" : `in ${f.daysLeft} days`;
      return {
        say: fit(`${name(f.name, 16)} trial ends ${left}, then ${usd(f.thenCents)}`, `${name(f.name, 16)} trial ends ${left}`),
        why: "It turns paid unless you cancel it.",
        cta: "Keep or cancel",
        weather: f.daysLeft <= 2 ? "heads-up" : "tip",
        ask: `My ${f.name} trial ends ${left} and then it's ${usd(f.thenCents)}. What are my options?`,
        priority: f.daysLeft <= 2 ? 92 : 70,
        about: ["subs"],
      };
    }
    case "sub_price_up":
      return {
        say: fit(`${name(f.name, 16)} went from ${usd(f.fromCents)} to ${usd(f.toCents)}`, `${name(f.name, 16)} is now ${usd(f.toCents)}`),
        why: `Up ${usd(f.toCents - f.fromCents)} on your bill.`,
        cta: "Take a look",
        weather: "heads-up",
        ask: `${f.name} went from ${usd(f.fromCents)} to ${usd(f.toCents)}. Is there a cheaper way to get it?`,
        priority: 64,
        about: ["subs"],
      };
    case "free_before_class":
      return {
        say: `${f.hours} free ${f.hours === 1 ? "hour" : "hours"} before your ${f.classTime} class`,
        why: "Enough time to finish something.",
        cta: "Use them",
        weather: "tip",
        ask: `I have ${f.hours} free ${f.hours === 1 ? "hour" : "hours"} before my ${f.classTime} class. What should I use them for?`,
        priority: 52,
        about: ["free"],
      };
    case "sleep":
      return {
        say: `You slept ${hm(f.minutes)} last night`,
        why: "Worth knowing before you plan today.",
        cta: "Pace my day",
        weather: "tip",
        ask: `I slept ${hm(f.minutes)} last night. How should I pace today?`,
        priority: 54,
        about: ["sleep"],
      };
    case "todos_left":
      return {
        say: `${f.done} of ${f.total} done today`,
        why: `${f.total - f.done} left on today's list.`,
        cta: "What's next?",
        weather: "tip",
        ask: `I've done ${f.done} of ${f.total} to-dos today. What should I do next?`,
        priority: 46,
        about: ["todos"],
      };
    case "habits_left":
      return {
        say: `${plural(f.left, "habit")} left today`,
        why: "Still open on today's list.",
        cta: "See my habits",
        weather: "tip",
        ask: "Which habits do I still have today?",
        priority: 44,
        about: ["habits"],
      };
    case "available":
      return {
        say: `${usd(f.cashCents)} available now`,
        why: "Checking plus cash, right now.",
        cta: "See this week",
        weather: "tip",
        ask: `I have ${usd(f.cashCents)} available now. What's coming out this week?`,
        priority: 42,
        about: ["bills", "shortfall"],
      };
  }
}

/** The fixes a tap can carry out (they all have Undo; money moves state their exact amount on the button). */
export const DOABLE = new Set<string>(["block_time", "create_task", "move_tasks", "shift_budget"]);

export { noteTopics } from "./insights";

const MONEY_KINDS = new Set(["bill_short", "bill_due", "spending_pace", "sub_overlap", "trial_ending", "sub_price_up", "available"]);
const SOURCES: Record<string, string> = {
  bill_short: "detector billsDue",
  bill_due: "detector billsDue",
  conflict: "detector deadlineConflicts",
  due_soon: "service tonight",
  busy_day: "services school and work",
  overdue_todos: "detector overdueTasks",
  spending_pace: "detector spendingPace",
  sub_overlap: "detector subscriptionWatch",
  trial_ending: "detector subscriptionWatch",
  sub_price_up: "detector subscriptionWatch",
  free_before_class: "service tonight",
  sleep: "service health",
  todos_left: "service tasks",
  habits_left: "service habits",
  available: "service accounts",
};

/** A raw fact as the shared Insight: wording, weather, rank, and the fix (kept on the server) when the detector offered one. */
export function insightOf(f: RawInsight, skyling = "Ray"): Insight {
  const d = describe(f, skyling);
  const doable = f.action && DOABLE.has(f.action.type) && f.ref && f.source;
  return {
    key: f.ref ?? `${f.kind}:${d.about.join("|")}`,
    kind: f.kind,
    tone: d.weather === "heads-up" ? "heads_up" : d.weather,
    headline: d.say,
    why: d.why,
    action: {
      label: d.cta,
      ask: d.ask,
      doIt: doable ? { kind: f.action!.type, payload: { action: f.action, source: f.source } } : undefined,
    },
    source: SOURCES[f.kind] ?? "service",
    rank: d.priority,
    money: MONEY_KINDS.has(f.kind) || undefined,
    bolt: d.bolt,
    about: d.about,
    href: f.action?.type === "open" ? f.action.href : undefined,
  };
}

/** Raw facts straight to clouds (for tests and callers that hold raw facts). */
export function pickInsights(facts: RawInsight[], opts: { noteId?: string | null; count?: number; skyling?: string } = {}): InsightCloud[] {
  return cloudsFrom(
    facts.map((f) => insightOf(f, opts.skyling)),
    opts,
  );
}
