import type { Insight, InsightAction, InsightTone } from "@/lib/insights";
import type { SkyInsight, Weather } from "@/lib/sky-insights";
import { collectSnapshot } from "../../briefing/collect";
import type { InsightProducer } from "../insights";
import { skyInsights } from "../sky-insights";

/**
 * The sky's own noticing (owner, 2026-11-12; docs/backlog/2026-11-12-useful-sky.md) as the shared insight shape, so the clouds
 * show it too: Tonight, free gaps, the free hours before the next due date, an exam coming and its study block, a head start,
 * the Sunday review, a double charge, what subscriptions add up to, and what the morning's Gmail look found. Kinds the
 * `noticing` producer already says (a clash, bills, trials, a busy day) are left to it.
 */
const OURS = new Set(["tonight", "gap", "due", "exam", "exam_study", "start_earlier", "weekly_review", "double_charge", "subscription_total", "from_email"]);

const TONE: Record<Weather, InsightTone> = { clear: "tip", grey: "heads_up", storm: "storm" };

/** Topics, so a cloud and another producer's never say the same thing (lib/insights `about`). */
const ABOUT: Record<string, string[]> = {
  tonight: ["tonight"],
  gap: ["free"],
  due: ["due"],
  exam: ["exam"],
  exam_study: ["exam"],
  start_earlier: ["start"],
  weekly_review: ["review"],
  double_charge: ["charges"],
  subscription_total: ["subs"],
};

export function asInsight(i: SkyInsight): Insight {
  const a = i.action;
  let action: InsightAction | undefined;
  let href: string | undefined;
  if (a?.type === "ask") action = { label: a.label, ask: a.prompt };
  else if (a?.type === "block") action = { label: a.label, doIt: { kind: "block", payload: { block: a.block } } };
  else if (a?.type === "open") href = a.href;
  else if (a?.type === "message") {
    if (a.prompt) action = { label: a.label, ask: a.prompt };
    else if (a.href) href = a.href;
    else action = { label: a.label, doIt: { kind: "message", payload: { messageId: a.messageId } } };
  }
  return {
    key: `sky:${i.id}`,
    kind: i.kind,
    tone: TONE[i.weather],
    headline: i.headline,
    why: i.why ?? "",
    ...(action ? { action } : {}),
    ...(href ? { href } : {}),
    source: "sky",
    rank: i.score,
    money: i.money,
    about: ABOUT[i.kind] ?? [`sky:${i.id}`],
  };
}

export const skyProducer: InsightProducer = async (scope, tz, prefs, now) => {
  const snapshot = await collectSnapshot(scope, { timezone: tz, name: "", preferences: prefs }, now);
  const list = await skyInsights(scope, snapshot, { moneyLocked: prefs?.moneyLock?.enabled === true });
  return list.filter((i) => OURS.has(i.kind)).map(asInsight);
};
