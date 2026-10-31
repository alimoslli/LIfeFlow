import { addDaysStr, formatIn, localDateOf, startOfLocalDay } from "@/lib/dates";
import { computeLifeLoad } from "@/lib/life-load";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { getAgenda } from "./calendar";
import { listAccounts } from "./finance/accounts";
import { balancesOf } from "./finance/overview";
import { upcomingRecurring } from "./finance/planning";
import { listAssignments } from "./school";
import { listTasks } from "./tasks";

/** The week ahead's life load from the user's own records (ADR 0020). Money is left out when it's locked. */
export async function lifeLoad(scope: UserScope, tz: string, today: string, opts: { includeMoney?: boolean } = {}) {
  const end = addDaysStr(today, 6);
  const [agenda, upcoming, overdue, tasks] = await series(
    () => getAgenda(scope, tz, today, end, { include: ["event", "shift"] }),
    () => listAssignments(scope, tz, { view: "upcoming", limit: 200 }),
    () => listAssignments(scope, tz, { view: "overdue", limit: 50 }),
    () => listTasks(scope, { status: "open", dueBefore: startOfLocalDay(addDaysStr(end, 1), tz) }),
  );
  const money = opts.includeMoney
    ? await series(
        () => upcomingRecurring(scope, today, end),
        () => listAccounts(scope),
      )
    : null;

  const horizon = addDaysStr(today, 13);
  return computeLifeLoad({
    today,
    committed: agenda
      .filter((i) => i.blocksTime && i.endsAt)
      .map((i) => ({
        date: localDateOf(i.startsAt, tz),
        minutes: (i.endsAt!.getTime() - i.startsAt.getTime()) / 60_000,
        label: `${i.title.replace(/^Work · /, "Work at ")} ${formatIn(i.startsAt, tz, "h:mm a")}–${formatIn(i.endsAt!, tz, "h:mm a")}`,
      })),
    deadlines: [...overdue, ...upcoming]
      .filter((a) => a.dueAt && a.status !== "done" && localDateOf(a.dueAt, tz) <= horizon)
      .map((a) => ({ date: localDateOf(a.dueAt!, tz), title: a.title, kind: a.kind, course: a.course.code ?? a.course.name })),
    tasks: tasks.filter((t) => t.dueAt).map((t) => ({ date: localDateOf(t.dueAt!, tz), title: t.title, priority: t.priority })),
    bills: money?.[0].filter((b) => b.amountCents < 0).map((b) => ({ date: b.date, name: b.name, amountCents: -b.amountCents })),
    liquidCents: money ? balancesOf(money[1]).cashCents : null,
  });
}
