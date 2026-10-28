import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { listAccounts } from "@/server/services/finance/accounts";
import { listActiveMemories } from "@/server/services/memory";
import { completeOnboarding, finishOnboarding, setTourState } from "@/server/services/onboarding";
import { listCourses } from "@/server/services/school";
import { listEmployers } from "@/server/services/work";
import { makeUser } from "../helpers";

afterAll(closeDb);

const prefs = async (id: string) => (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p;

describe("onboarding", () => {
  it("saves everything through the regular services and queues the tour", async () => {
    const { user, run } = await makeUser("Nia Brooks");
    const r = await run((s) =>
      completeOnboarding(s, {
        lifeStage: "both",
        courses: ["Biology II", "biology ii", "Statistics"],
        job: { name: "Campus Library", hourlyRate: 16.5 },
        checking: { name: "Checking", balance: 1250.5 },
        studyTime: "evening",
        jarvisTone: "concise",
        aboutMe: "Saving for a car.",
      }),
    );
    expect(r).toEqual({ courses: 2, job: true, checking: true, memory: true });
    expect((await run((s) => listCourses(s))).map((c) => c.name).sort()).toEqual(["Biology II", "Statistics"]);
    const [job] = await run((s) => listEmployers(s));
    expect(job).toMatchObject({ name: "Campus Library", hourlyRateCents: 1650 });
    const [acct] = await run((s) => listAccounts(s));
    expect(acct).toMatchObject({ name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 125050 });
    const [mem] = await run((s) => listActiveMemories(s));
    expect(mem).toMatchObject({ content: "Saving for a car.", source: "user", status: "active" });
    expect(await prefs(user.id)).toMatchObject({ lifeStage: "both", studyTime: "evening", jarvisTone: "concise", onboarding: "done", tour: "pending" });
  });

  it("is all-or-nothing: a refused step saves nothing", async () => {
    const { user, run } = await makeUser();
    await expect(run((s) => completeOnboarding(s, { courses: ["Chemistry"], aboutMe: "my password is hunter22" }))).rejects.toThrow(/Sensitive data/);
    expect(await run((s) => listCourses(s))).toHaveLength(0);
    expect((await prefs(user.id)).onboarding).toBeUndefined();
  });

  it("skipping finishes setup without creating anything, and the tour can be finished and replayed", async () => {
    const { user, run } = await makeUser();
    await run((s) => finishOnboarding(s));
    expect(await prefs(user.id)).toMatchObject({ onboarding: "done", tour: "pending" });
    expect(await run((s) => listCourses(s))).toHaveLength(0);
    await run((s) => setTourState(s, "done"));
    expect((await prefs(user.id)).tour).toBe("done");
    await run((s) => setTourState(s, "pending"));
    expect((await prefs(user.id)).tour).toBe("pending");
  });

  it("existing accounts have no onboarding flag, so they're never sent to setup", async () => {
    const { user } = await makeUser();
    expect((await prefs(user.id)).onboarding).toBeUndefined();
  });

  it("only changes the signed-in user's preferences", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await a.run((s) => finishOnboarding(s, { studyTime: "morning" }));
    expect((await prefs(b.user.id)).onboarding).toBeUndefined();
  });
});
