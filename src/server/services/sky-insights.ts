import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { addDaysStr, dayOfWeek, localDateOf } from "@/lib/dates";
import { rankInsights, type SkyAction, type SkyInsight, type Weather } from "@/lib/sky-insights";
import type { UserScope } from "../db/with-user";
import { jarvisMessages } from "../db/schema";
import { allInsights } from "../briefing/rules";
import type { Insight, LifeSnapshot } from "../briefing/types";

/**
 * The one ranked list of what the sky says on its own (lib/sky-insights; docs/backlog/2026-11-12-useful-sky.md): the live
 * briefing rules (Tonight, free gaps, due-date maths, a clash, an exam coming) and the stored messages that carry a step
 * (study blocks, the Sunday review, trials, double charges, what subscriptions add up to). No AI call; facts only. Money
 * is left out while the Money lock is on, money in the live rules too.
 */

type Row = typeof jarvisMessages.$inferSelect;

/** Stored kinds that join the sky, and how each looks. */
const STORED: Record<string, (f: Record<string, unknown>) => Weather> = {
  exam_study: (f) => (f.noFreeBlock ? "storm" : "grey"),
  deadline_conflict: (f) => (f.noFreeBlock ? "storm" : "grey"),
  start_earlier: () => "clear",
  weekly_review: () => "clear",
  double_charge: () => "storm",
  trial_ending: () => "grey",
  subscription_price_up: () => "grey",
  subscription_total: () => "clear",
  subscription_overlap: () => "clear",
};

/** On Today, never what an organized person already knows (owner, 2026-11-11): no money warnings, budget nags or late to-dos. */
const LEFT_OUT = /^(overdraft|budget-|pace-|overdue)/;
const MONEY_ICONS = new Set(["money", "trend", "goal"]);

function fromRule(i: Insight): SkyInsight {
  const a = i.action;
  const action: SkyAction | null = !a
    ? null
    : a.block
      ? { type: "block", label: a.label, block: a.block }
      : a.prompt
        ? { type: "ask", label: a.label, prompt: a.prompt }
        : a.href
          ? { type: "open", label: a.label, href: a.href }
          : null;
  return {
    id: i.id,
    kind: i.id.split("-")[0],
    weather: i.weather ?? (i.tone === "good" ? "clear" : "grey"),
    headline: i.text.replace(/\.$/, ""),
    why: i.detail ?? null,
    action,
    money: i.money ?? MONEY_ICONS.has(i.icon),
    score: i.score,
  };
}

function fromMessage(m: Row): SkyInsight {
  const a = m.action;
  const action: SkyAction | null =
    a && m.status !== "done"
      ? {
          type: "message",
          label: a.label,
          messageId: m.id,
          href: a.type === "open" ? a.href : undefined,
          prompt: a.type === "ask" ? a.prompt : undefined,
        }
      : null;
  const sections = Array.isArray(m.facts.sections) ? (m.facts.sections as { heading: string; lines: string[] }[]) : undefined;
  return {
    id: m.id,
    kind: m.kind,
    weather: STORED[m.kind](m.facts),
    headline: m.title,
    why: m.body,
    action,
    money: m.topic === "money",
    score: m.priority,
    ...(sections ? { sections } : {}),
  };
}

/** Is a stored message still worth showing now? The Sunday review stays from Sunday 6 PM through Monday. */
function stillCurrent(m: Row, s: Pick<LifeSnapshot, "now" | "tz" | "today">) {
  if (m.status === "snoozed" && !(m.snoozedUntil && m.snoozedUntil <= s.now)) return false;
  if (m.kind === "weekly_review") {
    // made by the Sunday look (from 6 PM): that Sunday and the Monday after it
    const made = localDateOf(m.createdAt, s.tz);
    return dayOfWeek(made) === 0 && (s.today === made || s.today === addDaysStr(made, 1));
  }
  // a booking offer whose day has passed is no use
  if (m.action?.type === "block_time" && m.action.date < s.today) return false;
  return true;
}

export async function skyInsights(scope: UserScope, snapshot: LifeSnapshot, opts: { moneyLocked: boolean }): Promise<SkyInsight[]> {
  const s: LifeSnapshot = opts.moneyLocked ? { ...snapshot, money: null } : snapshot;
  const rows = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(
      and(
        eq(jarvisMessages.userId, scope.userId),
        inArray(jarvisMessages.kind, Object.keys(STORED)),
        inArray(jarvisMessages.status, ["new", "snoozed"]),
        gte(jarvisMessages.createdAt, new Date(s.now.getTime() - 3 * 86_400_000)),
      ),
    )
    .orderBy(desc(jarvisMessages.createdAt))
    .limit(30);
  const stored = rows.filter((m) => stillCurrent(m, s) && !(opts.moneyLocked && m.topic === "money"));
  // an exam with its own study offer doesn't also need the general "exam coming" line
  const offered = new Set(stored.filter((m) => m.kind === "exam_study").map((m) => m.dedupeKey.split(":")[1]));
  const live = allInsights(s)
    .filter((i) => !LEFT_OUT.test(i.id) && !(i.id.startsWith("exam-") && offered.has(i.id.slice(5))))
    .map(fromRule)
    .filter((i) => !(opts.moneyLocked && i.money));
  return rankInsights([...stored.map(fromMessage), ...live]);
}
