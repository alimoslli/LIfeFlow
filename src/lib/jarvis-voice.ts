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
  consent: () => ({
    headline: "Can I learn from your answers?",
    fact: "I'd like to notice which of my messages help and which you skip, so I speak up at better times and less about what you don't need.",
    ask: "You can change this anytime in Settings.",
    mood: "info",
  }),
};

const OPENERS: Record<JarvisTone, Record<Mood, string[]>> = {
  coach: { win: ["Great work!", "That's how it's done.", "Huge."], warn: ["Let's get ahead of this.", "Quick course-correct:"], info: ["Here's your move:"] },
  friend: { win: ["Nice!", "Love this.", "Look at you!"], warn: ["Heads up:", "Just so you know,"], info: ["Hey,", "Quick one:"] },
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
