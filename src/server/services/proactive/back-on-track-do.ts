import { and, eq } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { jarvisMessages, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { ServiceError } from "../errors";
import { DETECTORS } from "./detectors";
import { saveMessage, toneOf } from "./engine";
import { respondToMessage } from "./respond";

/**
 * The one tap on Today (owner, 2026-11-22): the plan is made again here from the person's own records (the browser sends
 * nothing), filed as the usual message and run through the same "Do it", so Undo is the usual one. Returns the message id
 * and what changed.
 */
export async function applyBackOnTrack(scope: UserScope, user: { id: string; timezone: string; preferences?: UserPreferences }, now = new Date()) {
  const tz = user.timezone;
  const today = todayIn(tz, now);
  const [c] = await DETECTORS.overdueTasks({ scope, tz, today, now, fresh: true });
  if (!c?.action) throw new ServiceError("Nothing is waiting now.");
  const saved = await saveMessage(scope, c, toneOf(user.preferences), false, "today");
  const [row] = saved
    ? [saved]
    : await scope.tx
        .select()
        .from(jarvisMessages)
        .where(and(eq(jarvisMessages.userId, scope.userId), eq(jarvisMessages.dedupeKey, c.dedupeKey)));
  // already done today from Updates or a cloud: the same message, so a second tap changes nothing
  const r = await respondToMessage(scope, user, row.id, "do", today);
  return { id: row.id, text: r.text };
}
