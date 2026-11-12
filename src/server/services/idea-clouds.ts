import { and, eq, sql } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { CLOUDS, pickClouds, type IdeaCloud } from "@/lib/idea-clouds";
import { DOABLE } from "@/lib/insight-clouds";
import { cloudsFrom } from "@/lib/insights";
import type { UserScope } from "../db/with-user";
import { jarvisMessages, users, type ProactiveAction, type UserPreferences } from "../db/schema";
import { cloudFacts } from "./cloud-facts";
import { ServiceError } from "./errors";
import { listInsights } from "./insights";
import type { Candidate } from "./proactive/detectors";
import { saveMessage, toneOf } from "./proactive/engine";
import { respondToMessage } from "./proactive/respond";

export { cloudFacts };

/** The person's local day number, so the clouds change from day to day in their time zone. */
export const localDay = (tz: string, now = new Date()) => Math.floor(Date.parse(`${todayIn(tz, now)}T00:00:00Z`) / 86_400_000);

/**
 * The clouds for this person now (owner, 2026-11-12): up to three real insights from their own records, most useful first, none
 * the skyling's note on Today already says (`noteId`). The sky is never empty: with fewer than two insights, calm feature
 * clouds (white tips) fill it to two.
 */
export async function ideaClouds(
  scope: UserScope,
  tz: string,
  prefs: UserPreferences | undefined,
  name: string,
  now = new Date(),
  opts: { noteId?: string | null } = {},
): Promise<IdeaCloud[]> {
  const have = await cloudFacts(scope, tz, prefs, now);
  const insights = cloudsFrom(await listInsights(scope, tz, prefs, now), { noteId: opts.noteId, count: 3 });
  if (insights.length >= 2) return insights;
  return [...insights, ...pickClouds(have, name, localDay(tz, now), 2 - insights.length)];
}

/**
 * A tapped insight's one fix (owner, 2026-11-12: "what you can change or what you can do"). The browser sends only the
 * insight's key; the fix is found again here from the person's own records (so nothing sent can choose what runs, and the
 * Money lock, which keeps money insights from being read at all, still holds). It is filed as a message and run through the
 * same path as every "Do it", so it has Undo (`respondToMessage`). Returns the message id and what changed.
 */
export async function doCloud(scope: UserScope, user: { id: string; timezone: string; preferences?: UserPreferences }, ref: string, now = new Date()) {
  if (typeof ref !== "string" || ref.length > 200) throw new ServiceError("That one changed. Open Today again.");
  const found = (await listInsights(scope, user.timezone, user.preferences, now)).find((i) => i.key === ref && i.action?.doIt);
  const doIt = found?.action?.doIt;
  const source = doIt?.payload.source as
    { kind: string; topic: string; dedupeKey: string; facts: Record<string, unknown>; priority: number; urgent?: boolean } | undefined;
  const action = doIt?.payload.action as ProactiveAction | undefined;
  if (!found || !source || !action || !DOABLE.has(action.type)) throw new ServiceError("That one changed. Open Today again.");
  const saved = await saveMessage(
    scope,
    {
      kind: source.kind,
      topic: source.topic as Candidate["topic"],
      dedupeKey: source.dedupeKey,
      facts: source.facts,
      action,
      priority: source.priority,
      urgent: source.urgent,
    },
    toneOf(user.preferences),
    false,
    "cloud",
  );
  const [row] = saved
    ? [saved]
    : await scope.tx
        .select()
        .from(jarvisMessages)
        .where(and(eq(jarvisMessages.userId, scope.userId), eq(jarvisMessages.dedupeKey, source.dedupeKey)));
  const r = await respondToMessage(scope, user, row.id, "do", todayIn(user.timezone, now));
  return { id: row.id, text: r.text };
}

/** A tapped cloud counts as used (a count only, never the message). Unknown keys are ignored. */
export async function recordCloudTap(scope: UserScope, key: string) {
  if (!CLOUDS.some((c) => c.key === key)) return;
  await scope.tx
    .update(users)
    .set({
      // one atomic update (two taps at once both count), creating ideaTaps on the first tap
      preferences: sql`${users.preferences} || jsonb_build_object('ideaTaps', coalesce(${users.preferences} -> 'ideaTaps', '{}'::jsonb) || jsonb_build_object(${key}::text, coalesce((${users.preferences} -> 'ideaTaps' ->> ${key}::text)::int, 0) + 1))`,
    })
    .where(eq(users.id, scope.userId));
}
