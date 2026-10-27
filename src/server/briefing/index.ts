import type { SessionUser } from "../auth/sessions";
import type { UserScope } from "../db/with-user";
import { collectSnapshot } from "./collect";
import { buildBriefing } from "./rules";

export async function getBriefing(scope: UserScope, user: SessionUser, now = new Date()) {
  const snapshot = await collectSnapshot(scope, user, now);
  return { snapshot, briefing: buildBriefing(snapshot) };
}

export type { Briefing, Insight, LifeSnapshot, SafeToSpend } from "./types";
