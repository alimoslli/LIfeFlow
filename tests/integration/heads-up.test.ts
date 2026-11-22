import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { headsUpPush } from "@/lib/heads-up";
import { closeDb } from "@/server/db/client";
import { createEvent } from "@/server/services/calendar";
import { pushHeadsUp } from "@/server/services/heads-up";
import { saveSubscription, type PushMessage, type Sender } from "@/server/services/push";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The heads-up before something starts (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 2)
const DAY = "2026-11-24";
const at = (t: string) => localToInstant(DAY, t, TZ);
const sub = () => ({
  endpoint: `https://push.example.com/send/${randomUUID()}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});
function fakeSender() {
  const sent: PushMessage[] = [];
  const send: Sender = async (_s, msg) => {
    sent.push(msg);
    return { ok: true, gone: false };
  };
  return { sent, send };
}

describe("heads-up before things start", () => {
  it("says the thing, its time and place, in the person's own minutes; calm words", () => {
    expect(headsUpPush({ title: "Bio 101", clock: "10:00 AM", location: "Hall 201" }, 14.6)).toEqual({
      title: "Bio 101 at 10:00 AM",
      body: "In 15 minutes, Hall 201. Time to wrap up.",
    });
    expect(headsUpPush({ title: "Target", clock: "2:00 PM" }, 1).body).toBe("In 1 minute. Time to wrap up.");
    expect(JSON.stringify(headsUpPush({ title: "X", clock: "1:00 PM" }, 10))).not.toMatch(/—|hurry|late|missed|don't forget/i);
  });

  it("goes once per class or shift inside the window; never a deadline or an all-day thing", async () => {
    const { run } = await makeUser("Heads Up");
    await run(async (s) => {
      await saveSubscription(s, sub());
      await createEvent(s, TZ, { title: "Bio 101", date: DAY, startTime: "10:00", endTime: "11:15", kind: "class", location: "Hall 201" });
      await createEvent(s, TZ, { title: "Field day", date: DAY, allDay: true, kind: "personal" });
      const job = await createEmployer(s, { name: "Target", position: "Cashier", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: DAY, startTime: "14:00", endTime: "18:00" });
      const course = await createCourse(s, { name: "Calculus", code: "MATH 120" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Problem set 4", dueDate: DAY, dueTime: "10:05" });
    });
    const { sent, send } = fakeSender();
    // 9:40: Bio is 20 minutes out, outside the 15
    expect(await run((s) => pushHeadsUp(s, TZ, {}, send, at("09:40")))).toBe(0);
    // 9:45: in
    expect(await run((s) => pushHeadsUp(s, TZ, {}, send, at("09:45")))).toBe(1);
    expect(sent[0]).toMatchObject({ title: "Bio 101 at 10:00 AM", body: "In 15 minutes, Hall 201. Time to wrap up.", url: "/" });
    // the next run says nothing again, and the deadline at 10:05 never gets one
    expect(await run((s) => pushHeadsUp(s, TZ, {}, send, at("09:50")))).toBe(0);
    // the shift, with the person's own 30 minutes
    expect(await run((s) => pushHeadsUp(s, TZ, { notifications: { headsUp: 30 } } as never, send, at("13:31")))).toBe(1);
    expect(sent[1].title).toBe("Target at 2:00 PM");
    expect(sent).toHaveLength(2);
  });

  it("is off when turned off, muted, or in quiet hours", async () => {
    const { run } = await makeUser("Heads Off");
    await run(async (s) => {
      await saveSubscription(s, sub());
      await createEvent(s, TZ, { title: "Early lab", date: DAY, startTime: "07:00", endTime: "08:00", kind: "class" });
      await createEvent(s, TZ, { title: "Bio 101", date: DAY, startTime: "10:00", endTime: "11:15", kind: "class" });
    });
    const { sent, send } = fakeSender();
    expect(await run((s) => pushHeadsUp(s, TZ, { notifications: { headsUp: 0 } } as never, send, at("09:50")))).toBe(0);
    expect(await run((s) => pushHeadsUp(s, TZ, { jarvis: { mutedKinds: ["heads_up"] } } as never, send, at("09:50")))).toBe(0);
    // 6:50 AM is inside the default quiet hours
    expect(await run((s) => pushHeadsUp(s, TZ, {}, send, at("06:50")))).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
