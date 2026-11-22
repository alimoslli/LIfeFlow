import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, localDateOf, localTimeOf, localToInstant, todayIn } from "@/lib/dates";
import { spread, spreadLine } from "@/lib/back-on-track";
import { closeDb } from "@/server/db/client";
import { calendarEvents, tasks } from "@/server/db/schema";
import { backOnTrackPlan } from "@/server/services/back-on-track";
import { respondToMessage } from "@/server/services/proactive/respond";
import { runProactive } from "@/server/services/proactive/engine";
import { createTask } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Back on track (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 3)
const NOW = localToInstant("2026-11-24", "08:00", TZ);
const today = todayIn(TZ, NOW);
const user = (id: string) => ({ id, timezone: TZ, preferences: {} }) as never;

describe("back on track", () => {
  it("places one per free gap, at most two a day, in day order; what doesn't fit stays", () => {
    const at = (d: string, t: string) => localToInstant(d, t, TZ);
    const day1 = [
      { startsAt: at(today, "09:00"), endsAt: at(today, "10:00") },
      { startsAt: at(today, "13:00"), endsAt: at(today, "15:00") },
      { startsAt: at(today, "18:00"), endsAt: at(today, "21:00") },
    ];
    const day2 = [{ startsAt: at(addDaysStr(today, 1), "09:00"), endsAt: at(addDaysStr(today, 1), "21:00") }];
    const out = spread(["a", "b", "c", "d", "e"], [day1, day2, []]);
    expect(out.map((o) => [o.item, localDateOf(o.at, TZ), localTimeOf(o.at, TZ)])).toEqual([
      ["a", today, "09:00"],
      ["b", today, "13:00"],
      ["c", addDaysStr(today, 1), "09:00"],
      ["d", addDaysStr(today, 1), "09:30"],
    ]);
    const line = spreadLine(
      out.map((o) => ({ title: o.item, at: o.at })),
      TZ,
      today,
    );
    expect(line).toBe("a today at 9:00 AM, b today at 1:00 PM and 2 more");
    expect(line).not.toMatch(/overdue|missed|ago|late/i);
  });

  it("spreads waiting to-dos around classes, keeps assignments, and Undo puts every one back", async () => {
    const { user: u, run } = await makeUser("Back Person");
    for (const title of ["Laundry", "Email Prof Lee", "Call the bank"]) await run((s) => createTask(s, TZ, { title, dueDate: addDaysStr(today, -9) }));
    // a class over all of today's free time: nothing may land inside it
    await run((s) =>
      s.tx.insert(calendarEvents).values({
        userId: u.id,
        title: "Bio 101",
        kind: "class",
        startsAt: localToInstant(today, "08:00", TZ),
        endsAt: localToInstant(today, "21:00", TZ),
      }),
    );
    const plan = await run((s) => backOnTrackPlan(s, TZ, NOW));
    expect(plan.late).toHaveLength(3);
    expect(plan.moves).toHaveLength(3);
    for (const m of plan.moves) expect(localDateOf(m.at, TZ) > today).toBe(true);
    const perDay = new Map<string, number>();
    for (const m of plan.moves) perDay.set(localDateOf(m.at, TZ), (perDay.get(localDateOf(m.at, TZ)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);

    const msgs = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "midday", now: NOW }));
    const m = msgs.find((x) => x.kind === "overdue_tasks")!;
    expect(m.title).toBe("Back on track");
    expect(m.body).not.toMatch(/past due|overdue|missed|days? ago/i);
    const before = await run((s) => s.tx.select().from(tasks));
    await run((s) => respondToMessage(s, user(u.id), m.id, "do", today));
    const after = await run((s) => s.tx.select().from(tasks));
    expect(new Set(after.map((t) => t.dueAt!.toISOString()))).toEqual(new Set(plan.moves.map((x) => x.at.toISOString())));
    expect(after.every((t) => !t.dueAllDay)).toBe(true);

    await run((s) => respondToMessage(s, user(u.id), m.id, "undo", today));
    const back = await run((s) => s.tx.select().from(tasks));
    for (const t of back) {
      const was = before.find((b) => b.id === t.id)!;
      expect([t.dueAt?.toISOString(), t.dueAllDay, t.remindAt?.toISOString()]).toEqual([was.dueAt?.toISOString(), was.dueAllDay, was.remindAt?.toISOString()]);
    }
  });
});
