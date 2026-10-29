/**
 * How Jarvis words what he says on his own. Detectors produce facts (real
 * numbers); this turns them into a message in the user's chosen tone. Pure,
 * so the personality settings can preview it live.
 */

export type JarvisTone = "coach" | "friend" | "direct";
export type Mood = "win" | "warn" | "info";
export type Parts = { headline: string; fact: string; ask?: string; mood: Mood };

const usd = (cents: number) => {
  const d = Math.abs(cents) / 100;
  return `$${d >= 100 ? Math.round(d).toLocaleString("en-US") : d.toFixed(d % 1 ? 2 : 0)}`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
type F = Record<string, unknown>;
const s = (f: F, k: string) => String(f[k] ?? "");
const n = (f: F, k: string) => Number(f[k] ?? 0);

/** One entry per message kind. Facts come from the detectors in services/proactive. */
const KINDS: Record<string, (f: F) => Parts> = {
  spending_pace: (f) => ({
    headline: `${s(f, "category")} is running high`,
    fact: `You spent ${usd(n(f, "spentCents"))} on ${s(f, "category").toLowerCase()} this week, ${usd(n(f, "overCents"))} more than usual.`,
    ask: f.fromCategory ? `Want me to move ${usd(n(f, "moveCents"))} from ${s(f, "fromCategory")} to ${s(f, "category")}?` : "Want to see where it went?",
    mood: "warn",
  }),
  goal_milestone: (f) => ({
    headline: `${n(f, "percent")}% of the way to ${s(f, "goal")}`,
    fact:
      `You're ${n(f, "percent")}% of the way to ${s(f, "goal")}` +
      (n(f, "weeksAhead") > 0
        ? `, ${plural(n(f, "weeksAhead"), "week")} ahead of plan.`
        : n(f, "weeksAhead") < 0
          ? `, ${plural(-n(f, "weeksAhead"), "week")} behind plan.`
          : "."),
    ask: n(f, "weeksAhead") < 0 && n(f, "extraCents") ? `Adding ${usd(n(f, "extraCents"))} a week gets you back on track.` : undefined,
    mood: "win",
  }),
  deadline_conflict: (f) => ({
    headline: `${s(f, "assignment")} vs. your shift`,
    fact: `${s(f, "assignment")} is due ${s(f, "dueDay")} and you work ${s(f, "shiftWhen")}.`,
    ask: f.done ? `I blocked ${s(f, "blockWhen")} for it.` : `Want me to block ${s(f, "blockWhen")}?`,
    mood: "warn",
  }),
  bill_short: (f) => ({
    headline: `${s(f, "bill")} may not be covered`,
    fact: `${s(f, "bill")} (${usd(n(f, "billCents"))}) is due ${s(f, "dueIn")} and your checking is ${usd(n(f, "shortCents"))} short.`,
    ask: s(f, "options") || "Want two ways to cover it?",
    mood: "warn",
  }),
  bill_due: (f) => ({
    headline: `${s(f, "bill")} is due ${s(f, "dueIn")}`,
    fact: `${s(f, "bill")} (${usd(n(f, "billCents"))}) is due ${s(f, "dueIn")}. You have ${usd(n(f, "cashCents"))} in checking.`,
    ask: "Want a reminder the day it's due?",
    mood: "info",
  }),
  payday_split: (f) => ({
    headline: `Payday ${s(f, "when")}`,
    fact: `Payday ${s(f, "when")} (${usd(n(f, "payCents"))} expected). Here's how I'd split it: ${s(f, "split")}.`,
    ask: "Want a reminder on payday to set it aside?",
    mood: "info",
  }),
  task_streak: (f) => ({
    headline: `${n(f, "days")}-day streak`,
    fact: `You've finished every to-do ${n(f, "days")} days in a row.${f.best ? " Best streak yet." : ""}`,
    mood: "win",
  }),
  log_reminder: (f) => ({
    headline: "Catch up on spending",
    fact: `You haven't logged spending in ${plural(n(f, "days"), "day")}.`,
    ask: "Want to catch up in 30 seconds?",
    mood: "info",
  }),
  saved_more: (f) => ({
    headline: `You saved ${usd(n(f, "moreCents"))} more`,
    fact: `In ${s(f, "month")} you saved ${usd(n(f, "savedCents"))}, ${usd(n(f, "moreCents"))} more than the month before.`,
    ask: f.goal ? `Want to put ${usd(n(f, "moveCents"))} toward ${s(f, "goal")}?` : undefined,
    mood: "win",
  }),
  overdue_tasks: (f) => ({
    headline: `${plural(n(f, "count"), "to-do")} slipped`,
    fact: `${s(f, "titles")} ${n(f, "count") === 1 ? "is" : "are"} past due.`,
    ask: f.done ? "I moved them to tomorrow." : "Move them to tomorrow?",
    mood: "info",
  }),
  unusual_spend: (f) => ({
    headline: `Unusual charge: ${s(f, "merchant")}`,
    fact: `${usd(n(f, "amountCents"))} at ${s(f, "merchant")} is about ${n(f, "times")}x what you usually spend there.`,
    ask: "Was that expected?",
    mood: "warn",
  }),
  morning_brief: (f) => ({
    headline: "Your morning brief",
    fact: `${n(f, "count") ? `${plural(n(f, "count"), "thing")} on today's list` : "A clear day"}${f.money ? `, ${s(f, "money")}` : ""}.`,
    ask: f.oneThing ? `The one thing: ${s(f, "oneThing")}.` : undefined,
    mood: "info",
  }),
  evening_wrap: (f) => ({
    headline: "Today's wrap-up",
    fact: `You finished ${plural(n(f, "done"), "to-do")} today.${n(f, "left") ? ` ${plural(n(f, "left"), "to-do")} didn't happen.` : ""}`,
    ask: n(f, "left") ? "Move the rest to tomorrow?" : undefined,
    mood: n(f, "left") ? "info" : "win",
  }),
  weekly_review: (f) => ({
    headline: "Your week in review",
    fact: `${plural(n(f, "done"), "to-do")} done, ${n(f, "slipped")} slipped, ${usd(n(f, "spentCents"))} spent${n(f, "budgetCents") ? ` of about ${usd(n(f, "budgetCents"))} budgeted` : ""}.`,
    ask: f.change ? `One change for next week: ${s(f, "change")}` : undefined,
    mood: "info",
  }),
  monthly_review: (f) => ({
    headline: `${s(f, "month")} in review`,
    fact:
      f.rate === null || f.rate === undefined
        ? `You spent ${usd(n(f, "spentCents"))} in ${s(f, "month")}.`
        : `You kept ${n(f, "rate")}% of what came in during ${s(f, "month")}.`,
    ask: "Want the full breakdown?",
    mood: Number(f.rate) > 0 ? "win" : "info",
  }),
  goal_forecast: (f) => ({
    headline: `${s(f, "goal")} forecast`,
    fact: f.paceDate ? `At this pace you reach ${s(f, "goal")} in ${s(f, "paceDate")}.` : `${s(f, "goal")} has no regular savings yet.`,
    ask: `Adding ${usd(n(f, "extraCents"))} a week makes it ${s(f, "fasterDate")}.${f.weeklyStepCents ? ` To hit your date: ${usd(n(f, "weeklyStepCents"))} a week.` : ""}`,
    mood: "info",
  }),
  habit_streak: (f) => ({
    headline: `${s(f, "habit")}: ${n(f, "days")} in a row`,
    fact: `${n(f, "days")} in a row on "${s(f, "habit")}".${f.best ? " Best streak yet." : ""}`,
    mood: "win",
  }),
  habit_struggle: (f) => ({
    headline: `${s(f, "habit")} is slipping`,
    fact: `"${s(f, "habit")}" slipped ${n(f, "missed")} times lately. That's a sign the step is too big, not that you failed.`,
    ask: f.smaller ? `Try ${s(f, "smaller")} for two weeks?` : "Want to make it smaller for a while?",
    mood: "info",
  }),
  subscription_price_up: (f) => ({
    headline: `${s(f, "name")} went up`,
    fact: `${s(f, "name")} went from ${usd(n(f, "fromCents"))} to ${usd(n(f, "toCents"))}, ${usd(n(f, "yearlyExtraCents"))} more a year.`,
    ask: "Keep it, or want cancel steps?",
    mood: "warn",
  }),
  trial_ending: (f) => ({
    headline: `${s(f, "name")} trial ends ${n(f, "daysLeft") === 0 ? "today" : `in ${plural(n(f, "daysLeft"), "day")}`}`,
    fact: `Your ${s(f, "name")} free trial turns into ${usd(n(f, "thenCents"))} ${n(f, "daysLeft") === 0 ? "today" : `in ${plural(n(f, "daysLeft"), "day")}`}.`,
    ask: "Keep it or cancel before then?",
    mood: "warn",
  }),
  new_subscription: (f) => ({
    headline: `New recurring charge: ${s(f, "name")}`,
    fact: `${s(f, "name")} charged you about ${usd(n(f, "amountCents"))} ${n(f, "count")} times, on a regular schedule.`,
    ask: "Want to track it with your subscriptions?",
    mood: "info",
  }),
  savings_found: (f) => ({
    headline: `Cheaper option for ${s(f, "bill")}`,
    fact: `Switching to ${s(f, "provider")} ${s(f, "plan")} saves about ${usd(n(f, "yearlyCents"))}/year (source: ${s(f, "source")}).`,
    ask: "Want the details and a script to ask your provider to match it?",
    mood: "info",
  }),
  question: (f) => ({
    headline: s(f, "question"),
    fact: "A quick one so I can help you better.",
    ask: "Your answer goes into What Jarvis knows in Settings, where you can edit or delete it.",
    mood: "info",
  }),
  consent: () => ({
    headline: "Can I learn from your answers?",
    fact: "I'd like to notice which of my messages help and which you skip, so I speak up at better times and less about what you don't need.",
    ask: "You can change this anytime in Settings.",
    mood: "info",
  }),
};

const OPENERS: Record<JarvisTone, Record<Mood, string[]>> = {
  coach: { win: ["Great work!", "That's how it's done.", "Huge."], warn: ["Let's get ahead of this.", "Quick course-correct:"], info: ["Here's your move:"] },
  friend: { win: ["Nice!", "Love this.", "Look at you!"], warn: ["Heads up:", "Just so you know:"], info: ["Hey!", "Quick one:"] },
  direct: { win: [], warn: [], info: [] },
};

/** Builds the final title and text. `brief` drops the opener (Jarvis learned the user prefers shorter messages). */
export function composeMessage(kind: string, facts: F, tone: JarvisTone, opts: { brief?: boolean; seed?: number } = {}) {
  const p = (KINDS[kind] ?? (() => ({ headline: s(facts, "headline"), fact: s(facts, "text"), mood: "info" as Mood })))(facts);
  const openers = OPENERS[tone][p.mood];
  const opener = !opts.brief && openers.length ? openers[(opts.seed ?? 0) % openers.length] : "";
  const parts = tone === "direct" ? [p.fact, p.ask] : [opener, p.fact, p.ask];
  return { title: p.headline, body: parts.filter(Boolean).join(" ") };
}

/** Plain names for each kind, for Settings (What Jarvis knows). */
export const KIND_LABELS: Record<string, string> = {
  spending_pace: "Spending pace in a budget",
  goal_milestone: "Goal milestones",
  deadline_conflict: "Deadlines that clash with shifts",
  bill_short: "Bills you might be short for",
  bill_due: "Bills coming due",
  payday_split: "Payday plans",
  task_streak: "To-do streaks",
  log_reminder: "Reminders to log spending",
  saved_more: "Saving more than usual",
  overdue_tasks: "Overdue to-dos",
  unusual_spend: "Unusual charges",
  morning_brief: "Morning brief",
  evening_wrap: "Evening wrap-up",
  weekly_review: "Sunday weekly review",
  monthly_review: "Monthly review",
  goal_forecast: "Goal forecasts",
  habit_streak: "Habit streaks",
  habit_struggle: "Habits that slipped",
  subscription_price_up: "Subscription price increases",
  trial_ending: "Free trials ending",
  new_subscription: "New subscriptions",
  savings_found: "Cheaper bills found",
  question: "Get-to-know questions",
  consent: "Asking to learn",
};

export const TONES: Record<JarvisTone, { label: string; hint: string }> = {
  coach: { label: "Coach", hint: "Motivating, holds you to your goals" },
  friend: { label: "Friend", hint: "Casual and warm" },
  direct: { label: "Straight to the point", hint: "Short, numbers only" },
};

/** Example situations for the live preview in settings. */
export const PREVIEW_SAMPLES: { kind: string; facts: F }[] = [
  { kind: "spending_pace", facts: { category: "Food", spentCents: 8600, overCents: 3000, fromCategory: "Fun", moveCents: 3000 } },
  { kind: "goal_milestone", facts: { goal: "Paris", percent: 50, weeksAhead: 3 } },
  { kind: "deadline_conflict", facts: { assignment: "Your essay", dueDay: "Friday", shiftWhen: "Thursday night", blockWhen: "2 hours on Wednesday" } },
];
