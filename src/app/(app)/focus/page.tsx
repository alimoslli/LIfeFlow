import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { firstStep, startable } from "@/lib/first-step";
import { assistantProfile } from "@/lib/assistant";
import { formatIn, todayIn, addDaysStr } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { busyAgenda } from "@/server/services/calendar";
import { headsUpMinutes } from "@/lib/heads-up";
import { getAssignment } from "@/server/services/school";
import { getTask } from "@/server/services/tasks";
import { FocusScreen } from "./focus-screen";

export const metadata: Metadata = { title: "Start it" };

/**
 * "Start it with me" and "Sit with me" (owner, 2026-11-22, the ADHD helps, items 1, 4 and 6;
 * docs/backlog/2026-11-22-adhd-six.md): one thing, one small first step from our code (lib/first-step.ts), a short timer,
 * and the person's skyling sitting with them. The next class, shift, meeting or exam is passed in so the screen can say,
 * gently, when it's time to wrap up. No AI is called here.
 */
export default async function FocusPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const key = (await searchParams).item ?? "";
  const target = startable(key);
  if (!target) redirect("/");
  let data;
  try {
    data = await withCurrentUser(async (scope, user) => {
      const tz = user.timezone || "UTC";
      const now = new Date();
      const thing =
        target.origin === "task"
          ? await getTask(scope, target.id).then((t) => ({ title: t.title, kind: "task", done: t.status === "done", course: null as string | null }))
          : await getAssignment(scope, target.id).then((a) => ({
              title: a.title,
              kind: a.kind as string,
              done: a.status === "done",
              course: a.course.code ?? a.course.name,
            }));
      // the next fixed thing (a class, shift, meeting or exam) in the next day, so the screen can say when to wrap up
      const today = todayIn(tz, now);
      const next = (await busyAgenda(scope, tz, today, addDaysStr(today, 1), { now }))
        .filter((i) => i.blocksTime && i.startsAt > now)
        .sort((a, b) => +a.startsAt - +b.startsAt)[0];
      return {
        ...thing,
        step: firstStep(thing.kind, thing.title),
        name: assistantProfile(user.preferences, user.timezone).name,
        companion: user.preferences?.companion ?? null,
        next: next ? { title: next.title, at: next.startsAt.toISOString(), clock: formatIn(next.startsAt, tz, "h:mm a") } : null,
        headsUp: headsUpMinutes(user.preferences),
      };
    });
  } catch (e) {
    // a thing that's gone or isn't theirs goes back to Today; the session's own redirects pass through
    unstable_rethrow(e);
    redirect("/");
  }
  return <FocusScreen itemKey={key} origin={target.origin} id={target.id} {...data} />;
}
