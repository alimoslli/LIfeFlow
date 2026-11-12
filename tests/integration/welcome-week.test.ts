import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents, jarvisMessages, recurringItems, tasks, workShifts } from "@/server/db/schema";
import { createEvent } from "@/server/services/calendar";
import { dayClockData } from "@/server/services/day-clock";
import { respondToMessage } from "@/server/services/proactive/respond";
import { createAssignment, createCourse } from "@/server/services/school";
import { firstFix, saveFirstThing } from "@/server/services/welcome-week";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const today = todayIn(TZ);

describe("the welcome's week so far", () => {
  it("offers no fix when nothing real can be fixed (nothing is made up)", async () => {
    const { user, run } = await makeUser();
    expect(await run((s) => firstFix(s, TZ, user.preferences))).toBeNull();
    // a due date far away isn't this week's
    await run(async (s) => {
      const c = await createCourse(s, { name: "BIO 101" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Final paper", kind: "assignment", dueDate: addDaysStr(today, 20), dueTime: "23:59" });
    });
    expect(await run((s) => firstFix(s, TZ, user.preferences))).toBeNull();
  });

  it("offers one study block before a due date; Yes uses the suggestion path with Undo; asking again shows the same card", async () => {
    const { user, run } = await makeUser();
    await run(async (s) => {
      const c = await createCourse(s, { name: "BIO 101" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab report", kind: "assignment", dueDate: addDaysStr(today, 4), dueTime: "23:59" });
    });
    const fix = await run((s) => firstFix(s, TZ, user.preferences));
    expect(fix?.status).toBe("pending");
    expect(fix?.body).toContain("Lab report");
    expect(fix?.body).toContain("Want me to block 2 hours on");
    // looking again doesn't make a second card
    const again = await run((s) => firstFix(s, TZ, user.preferences));
    expect(again?.id).toBe(fix!.id);
    expect(await run((s) => s.tx.select().from(jarvisMessages))).toHaveLength(1);
    // nothing changed on the calendar until Yes
    expect(await run((s) => s.tx.select().from(calendarEvents))).toHaveLength(0);

    const done = await run((s) => respondToMessage(s, user, fix!.id, "do", today));
    expect(done.text).toContain("Work on Lab report");
    const events = await run((s) => s.tx.select().from(calendarEvents));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("study");
    // it's on the sky, and the card reads as done
    const clock = await run((s) => dayClockData(s, TZ, new Date(), { money: false, ownBills: true }));
    expect(clock.items.some((i) => i.title === "Work on Lab report")).toBe(true);
    expect((await run((s) => firstFix(s, TZ, user.preferences)))?.status).toBe("done");

    await run((s) => respondToMessage(s, user, fix!.id, "undo", today));
    expect(await run((s) => s.tx.select().from(calendarEvents))).toHaveLength(0);
    expect((await run((s) => firstFix(s, TZ, user.preferences)))?.status).toBe("undone");
  });

  it("stays quiet when time is already set aside for it", async () => {
    const { user, run } = await makeUser();
    await run(async (s) => {
      const c = await createCourse(s, { name: "BIO 101" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab report", kind: "assignment", dueDate: addDaysStr(today, 4), dueTime: "23:59" });
      await createEvent(s, TZ, { title: "Study for the lab", kind: "study", date: addDaysStr(today, 2), startTime: "10:00", endTime: "12:00" });
    });
    expect(await run((s) => firstFix(s, TZ, user.preferences))).toBeNull();
  });

  it("saves one real class, shift, bill or to-do through the services, and the sky shows it", async () => {
    const { run } = await makeUser();
    const day = addDaysStr(today, 1);
    await run(async (s) => {
      await saveFirstThing(s, TZ, { kind: "class", name: "ENG 201", date: day, startTime: "10:00", endTime: "11:15", weekly: true });
      await saveFirstThing(s, TZ, { kind: "shift", name: "Campus Cafe", date: day, startTime: "16:00", endTime: "21:00" });
      await saveFirstThing(s, TZ, { kind: "bill", name: "Phone", amount: "$45.50", date: addDaysStr(today, 2) });
      await saveFirstThing(s, TZ, { kind: "todo", name: "Pick up meds", date: day });
    });
    expect(await run((s) => s.tx.select().from(workShifts))).toHaveLength(1);
    expect((await run((s) => s.tx.select().from(recurringItems)))[0]).toMatchObject({ name: "Phone", amountCents: -4550, kind: "bill", source: "manual" });
    expect((await run((s) => s.tx.select().from(tasks)))[0].title).toBe("Pick up meds");
    const clock = await run((s) => dayClockData(s, TZ, new Date(), { money: false, ownBills: true }));
    const titles = clock.items.map((i) => i.title);
    for (const t of ["ENG 201", "Pick up meds", "Phone"]) expect(titles).toContain(t);
    expect(clock.items.some((i) => i.cat === "work")).toBe(true);
    // the welcome's sky carries no money of its own: without ownBills a typed bill stays off it
    const plain = await run((s) => dayClockData(s, TZ, new Date(), { money: false }));
    expect(plain.items.some((i) => i.title === "Phone")).toBe(false);
  });

  it("refuses what isn't a real thing: no name, no amount", async () => {
    const { run } = await makeUser();
    await expect(run((s) => saveFirstThing(s, TZ, { kind: "todo", name: " ", date: today }))).rejects.toThrow();
    await expect(run((s) => saveFirstThing(s, TZ, { kind: "bill", name: "Rent", amount: "lots", date: today }))).rejects.toThrow();
    expect(await run((s) => s.tx.select().from(tasks))).toHaveLength(0);
  });
});
