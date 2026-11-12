import { assistantProfile } from "@/lib/assistant";
import { insightOf } from "@/lib/insight-clouds";
import { rankInsights, type Insight } from "@/lib/insights";
import type { UserPreferences } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { cloudFacts } from "./cloud-facts";
import { insightFacts } from "./insight-facts";
import { skyProducer } from "./insights/sky";
import { courseNames } from "./insights/course-names";

/**
 * Insights (owner, 2026-11-12): everything the app can notice about the person's own week, as one shape (lib/insights.ts).
 * Each producer reads real records through the existing detectors and services and returns insights; new noticing is a new
 * producer appended to PRODUCERS (new files under services/insights/). `listInsights` runs them all, applies the Money lock,
 * dedupes by key and ranks, most urgent first. A producer that fails adds nothing and never blanks Today.
 */
export type InsightProducer = (scope: UserScope, tz: string, prefs: UserPreferences | undefined, now: Date) => Promise<Insight[]>;

/** The clash, bills, subscriptions, spending, to-dos, free time, sleep and habits insights, from the detectors and services. */
export const noticing: InsightProducer = async (scope, tz, prefs, now) => {
  const have = await cloudFacts(scope, tz, prefs, now);
  const skyling = assistantProfile(prefs, tz).name;
  return (await insightFacts(scope, tz, have, now)).map((f) => insightOf(f, skyling));
};

export const PRODUCERS: InsightProducer[] = [noticing, skyProducer, courseNames];

export async function listInsights(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now: Date = new Date()): Promise<Insight[]> {
  const locked = prefs?.moneyLock?.enabled === true;
  const all: Insight[] = [];
  // one after another: they share one transaction
  for (const produce of PRODUCERS) {
    try {
      all.push(...(await scope.tx.transaction(async (tx) => produce({ ...scope, tx }, tz, prefs, now))));
    } catch (e) {
      console.error("insight producer failed", e instanceof Error ? e.name : e);
    }
  }
  return rankInsights(all.filter((i) => !(locked && i.money)));
}
