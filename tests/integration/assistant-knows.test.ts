import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { courses } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { whatAssistantKnows } from "@/server/services/integrations";
import { createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("what the empty chat says it knows (audit A20)", () => {
  it("is nothing for a new account, then only what was added", async () => {
    const { run } = await makeUser();
    expect(await run((s) => whatAssistantKnows(s))).toEqual([]);
    await run(async (s) => {
      await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 10_000 });
    });
    expect(await run((s) => whatAssistantKnows(s))).toEqual(["classes", "money"]);
    await run(async (s) => {
      const job = await createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: addDaysStr(todayIn(TZ), 1), startTime: "10:00", endTime: "14:00" });
    });
    expect(await run((s) => whatAssistantKnows(s))).toEqual(["classes", "shifts", "money"]);
  });

  it("doesn't count archived classes (review)", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Old term", code: "HIS 100" });
      await s.tx.update(courses).set({ archivedAt: new Date() }).where(eq(courses.id, c.id));
    });
    expect(await run((s) => whatAssistantKnows(s))).toEqual([]);
  });
});
