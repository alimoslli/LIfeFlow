import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";
import { collectSnapshot } from "@/server/briefing/collect";
import { makeToolContext } from "@/server/jarvis/agent";
import { executeToolCall } from "@/server/jarvis/executor";
import { createRecurring } from "@/server/services/finance/planning";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);

// 11 PM on Thursday Nov 5 in Los Angeles: UTC is already Friday Nov 6 (audit A18).
const LA = "America/Los_Angeles";
const LATE = new Date("2026-11-06T07:00:00Z");

async function laUser() {
  const u = await makeUser("Lena LA");
  await getDb().update(users).set({ timezone: LA }).where(eq(users.id, u.user.id));
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: LA, accountKind: "standard", preferences: {} };
  return { ...u, session };
}

describe("dates in the user's time zone late in the evening (audit A18)", () => {
  it("Today's exam horizon (14 days) counts the exam's local day, not its UTC day", async () => {
    const { run, session } = await laUser();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Biology", code: "BIO 101" });
      // Nov 19 at 8 PM in LA is Nov 20 in UTC; the horizon from Nov 5 is Nov 19.
      await createAssignment(s, LA, { courseId: c.id, title: "Midterm", kind: "exam", dueDate: "2026-11-19", dueTime: "20:00" });
      await createAssignment(s, LA, { courseId: c.id, title: "Final", kind: "exam", dueDate: "2026-11-20", dueTime: "09:00" });
    });
    const snap = await run((s) => collectSnapshot(s, session, LATE));
    expect(snap.today).toBe("2026-11-05");
    expect(snap.exams.map((e) => e.title)).toEqual(["Midterm"]);
  });

  it("recurring_payments looks 30 days ahead from the user's today", async () => {
    const { run, session } = await laUser();
    await run(async (s) => {
      await createRecurring(s, { name: "Phone", amountCents: -4500, frequency: "yearly", nextDueDate: "2026-12-05", kind: "bill" });
      await createRecurring(s, { name: "Gym", amountCents: -3000, frequency: "yearly", nextDueDate: "2026-12-06", kind: "bill" });
    });
    const out = await executeToolCall("recurring_payments", "{}", makeToolContext(session, crypto.randomUUID(), LATE), "c1");
    expect(out).toMatchObject({ kind: "result", result: { ok: true } });
    const upcoming = (out as { result: { data: { upcoming30Days: { name: string; date: string }[] } } }).result.data.upcoming30Days;
    expect(upcoming.map((u) => `${u.name} ${u.date}`)).toEqual(["Phone 2026-12-05"]);
  });
});
