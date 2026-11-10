import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { calendarEvents, integrations, users } from "@/server/db/schema";
import { sql } from "drizzle-orm";
import { createTask } from "@/server/services/tasks";
import { createCourse } from "@/server/services/school";
import { createEmployer } from "@/server/services/work";
import { provisionalName } from "@/lib/provisional-name";
import { listAccounts } from "@/server/services/finance/accounts";
import { listActiveMemories } from "@/server/services/memory";
import { setCompanion, updateProfile } from "@/server/services/accounts";
import { completeOnboarding, finishOnboarding, saveBirthday, saveWelcomeProgress, setTourState } from "@/server/services/onboarding";
import { listCourses } from "@/server/services/school";
import { listEmployers } from "@/server/services/work";
import { assistantProfile } from "@/lib/assistant";
import { makeUser } from "../helpers";

afterAll(closeDb);

/** Setup finishes (or is skipped) only with a birthday on the account (owner, 2026-11-10). */
const born = (run: Awaited<ReturnType<typeof makeUser>>["run"]) => run((s) => saveWelcomeProgress(s, "UTC", { birthDate: "2001-03-04" }));

const prefs = async (id: string) => (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p;

describe("onboarding", () => {
  it("saves everything through the regular services and queues the tour", async () => {
    const { user, run } = await makeUser("Nia Brooks");
    await born(run);
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

  it("finishing setup with no assistant name leaves it 'your skyling', never 'Jarvis'", async () => {
    const { user, run } = await makeUser();
    await born(run);
    await run((s) => completeOnboarding(s, { lifeStage: "both", assistant: { name: undefined, style: "friend" } }));
    const p = await prefs(user.id);
    expect(p.assistantName).toBeUndefined();
    expect(assistantProfile(p)).toMatchObject({ name: "your skyling", named: false });
  });

  it("is all-or-nothing: a refused step saves nothing", async () => {
    const { user, run } = await makeUser();
    await expect(run((s) => completeOnboarding(s, { courses: ["Chemistry"], aboutMe: "my password is hunter22" }))).rejects.toThrow(/Sensitive data/);
    expect(await run((s) => listCourses(s))).toHaveLength(0);
    expect((await prefs(user.id)).onboarding).toBeUndefined();
  });

  it("skipping finishes setup without creating anything, and the tour can be finished and replayed", async () => {
    const { user, run } = await makeUser();
    await born(run);
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

  it("the welcome keeps the skyling and 'about you' before connecting (it leaves the page and comes back)", async () => {
    const { user, run } = await makeUser("Sam Ortiz");
    await run((s) =>
      saveWelcomeProgress(s, "America/Chicago", {
        assistant: { name: "Nova", style: "coach", companion: "ray" },
        name: "Sammy",
        birthDate: "2005-04-12",
        lifeStage: "student",
        school: "State University",
      }),
    );
    const p = await prefs(user.id);
    expect(p).toMatchObject({
      assistantName: "Nova",
      assistantStyle: "coach",
      companion: "ray",
      birthDate: "2005-04-12",
      lifeStage: "student",
      school: "State University",
    });
    // still in setup: only finishing marks it done
    expect(p.onboarding).not.toBe("done");
    expect((await getDb().select({ name: users.name }).from(users).where(eq(users.id, user.id)))[0].name).toBe("Sammy");
    // a birthday can't be in the future
    const year = new Date().getFullYear();
    await expect(run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${year + 1}-01-01` }))).rejects.toThrow(/hasn't happened/);
    expect((await prefs(user.id)).birthDate).toBe("2005-04-12");
  });

  it("keeps 'where you work' while they connect, and makes it an employer only when setup finishes", async () => {
    const { user, run } = await makeUser("Ren Ito");
    await run((s) => saveWelcomeProgress(s, "UTC", { lifeStage: "working", job: "Campus Coffee" }));
    expect((await prefs(user.id)).welcomeJob).toBe("Campus Coffee");
    expect(await run((s) => listEmployers(s))).toEqual([]);
    // back from Google: the welcome hands the kept name to finishing
    const kept = (await prefs(user.id)).welcomeJob!;
    await born(run);
    await run((s) => completeOnboarding(s, { lifeStage: "working", job: { name: kept } }));
    expect((await run((s) => listEmployers(s))).map((e) => e.name)).toEqual(["Campus Coffee"]);
    expect((await prefs(user.id)).welcomeJob).toBeUndefined();
  });

  it("a birthday can be changed and removed in Settings, and left as it is", async () => {
    const { user } = await makeUser("Ada Moss");
    const base = { name: "Ada Moss", timezone: "UTC" };
    await updateProfile(getDb(), user.id, { ...base, birthDate: "2001-05-02" });
    expect((await prefs(user.id)).birthDate).toBe("2001-05-02");
    await updateProfile(getDb(), user.id, base); // not on the form: kept
    expect((await prefs(user.id)).birthDate).toBe("2001-05-02");
    await updateProfile(getDb(), user.id, { ...base, birthDate: "" }); // cleared on the form: removed
    expect((await prefs(user.id)).birthDate).toBeUndefined();
    await expect(updateProfile(getDb(), user.id, { ...base, birthDate: "2010-02-31" })).rejects.toThrow("Pick your birthday.");
  });

  it("setup can't be finished or skipped without a birthday, checked on the server", async () => {
    const { run } = await makeUser("Noa Lin");
    await expect(run((s) => completeOnboarding(s, { lifeStage: "student" }))).rejects.toThrow("Add your birthday to finish setting up.");
    await expect(run((s) => finishOnboarding(s))).rejects.toThrow("Add your birthday to finish setting up.");
    await born(run);
    await run((s) => finishOnboarding(s));
  });

  it("under 13 locks the welcome, keeps nothing else, and a later, older year doesn't get through", async () => {
    const { user, run } = await makeUser("Kai Young");
    const year = new Date().getFullYear();
    const r = await run((s) =>
      saveWelcomeProgress(s, "UTC", { name: "Kai", birthDate: `${year - 9}-03-03`, school: "Maple Elementary", lifeStage: "student", job: "Lemonade" }),
    );
    expect(r).toEqual({ blocked: true });
    let p = await prefs(user.id);
    expect(p.ageBlockedAt).toBeTruthy();
    expect(p.birthDate).toBeUndefined();
    expect(p.school).toBeUndefined();
    expect(p.welcomeJob).toBeUndefined();
    expect(p.lifeStage).toBeUndefined();
    expect((await getDb().select({ name: users.name }).from(users).where(eq(users.id, user.id)))[0].name).toBe("Kai Young");
    // retyping an older year: still locked, still nothing kept
    expect(await run((s) => saveWelcomeProgress(s, "UTC", { birthDate: "2000-01-01" }))).toEqual({ blocked: true });
    expect((await prefs(user.id)).birthDate).toBeUndefined();
    await expect(run((s) => completeOnboarding(s, { lifeStage: "student" }))).rejects.toThrow("LifeFlow is for people 13 and older.");
    await expect(run((s) => finishOnboarding(s))).rejects.toThrow("LifeFlow is for people 13 and older.");
    expect(await run((s) => saveBirthday(s, "UTC", "2000-01-01"))).toEqual({ blocked: true });
    await expect(updateProfile(getDb(), user.id, { name: "Kai", timezone: "UTC", birthDate: "2000-01-01" })).rejects.toThrow("13 and older");
    p = await prefs(user.id);
    expect(p.onboarding).not.toBe("done");
  });

  it("under 13 during setup keeps nothing: not the name, the connections, the classes, the job or the to-dos", async () => {
    const { user, run } = await makeUser("Real Name");
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "pending" } })
      .where(eq(users.id, user.id));
    // they typed an adult year first, then connected things and filled in their week
    await run((s) => saveWelcomeProgress(s, "UTC", { name: "Kai Real", birthDate: "1999-01-01", lifeStage: "both", school: "Maple", job: "Lemonade" }));
    await run(async (s) => {
      await s.tx.insert(integrations).values({ userId: user.id, provider: "canvas", status: "connected", displayName: "canvas.school.edu" });
      const c = await createCourse(s, { name: "Grade 5 Science" });
      await createTask(s, "UTC", { title: "Volcano model" });
      await s.tx
        .insert(calendarEvents)
        .values({ userId: user.id, title: "Science", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), kind: "class", courseId: c.id });
      await createEmployer(s, { name: "Lemonade stand", payType: "hourly" });
    });
    // then they went back and gave their real birthday
    expect(await run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 10}-02-02` }))).toEqual({ blocked: true });
    const [u] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(u.name).toBe(provisionalName(u.email));
    expect(Object.keys(u.preferences).sort()).toEqual(["ageBlockedAt", "onboarding"]);
    expect(u.preferences.onboarding).toBe("pending");
    // every table that holds their rows is empty except how they sign in and the action log
    const keep = new Set([
      "users",
      "sessions",
      "oauth_identities",
      "passkeys",
      "recovery_codes",
      "login_challenges",
      "auth_challenges",
      "password_resets",
      "audit_events",
    ]);
    const tables = await getDb().execute<{ table_name: string }>(
      sql`select distinct table_name from information_schema.columns where column_name = 'user_id' and table_schema = current_schema()`,
    );
    for (const { table_name } of tables.rows) {
      if (keep.has(table_name)) continue;
      const [{ n }] = (await getDb().execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table_name)} where user_id = ${user.id}`)).rows;
      expect(n, table_name).toBe(0);
    }
  });

  it("two saves at once (13+ and under 13) can't clear the lock", async () => {
    const { user, run } = await makeUser("Race Kid");
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "pending" } })
      .where(eq(users.id, user.id));
    const young = `${new Date().getFullYear() - 9}-01-01`;
    await Promise.all([
      run((s) => saveWelcomeProgress(s, "UTC", { birthDate: young })),
      run((s) => saveWelcomeProgress(s, "UTC", { birthDate: "1999-09-09" })),
    ]);
    const p = await prefs(user.id);
    expect(p.ageBlockedAt).toBeTruthy();
    expect(p.birthDate).toBeUndefined();
  });

  it("Settings: an under-13 year sets the same flag, so a second, older year is refused", async () => {
    const { user } = await makeUser("Set Tings");
    const base = { name: "Set Tings", timezone: "UTC" };
    await expect(updateProfile(getDb(), user.id, { ...base, birthDate: "2015-05-05" })).rejects.toThrow("LifeFlow is for people 13 and older.");
    expect((await prefs(user.id)).ageBlockedAt).toBeTruthy();
    await expect(updateProfile(getDb(), user.id, { ...base, birthDate: "2000-05-05" })).rejects.toThrow("LifeFlow is for people 13 and older.");
    expect((await prefs(user.id)).birthDate).toBeUndefined();
    // the rest of the profile still saves
    await updateProfile(getDb(), user.id, { ...base, name: "Set" });
  });

  it("an older account without a birthday is asked once: a real one saves; under 13 locks the same way", async () => {
    const a = await makeUser("Ola Old");
    expect(await a.run((s) => saveBirthday(s, "America/Chicago", "1998-08-08"))).toEqual({ blocked: false });
    expect((await prefs(a.user.id)).birthDate).toBe("1998-08-08");
    await expect(a.run((s) => saveBirthday(s, "UTC", "2010-02-31"))).rejects.toThrow("Pick your birthday.");
    const b = await makeUser("Bo Young");
    expect(await b.run((s) => saveBirthday(s, "UTC", `${new Date().getFullYear() - 8}-05-05`))).toEqual({ blocked: true });
    expect(await b.run((s) => saveBirthday(s, "UTC", "1990-01-01"))).toEqual({ blocked: true });
    expect((await prefs(b.user.id)).birthDate).toBeUndefined();
  });

  it("'Changes with the sky' keeps their own name and their way of talking (only the look follows the time)", async () => {
    const { user, run } = await makeUser("Sky Picker");
    await run((s) => saveWelcomeProgress(s, "UTC", { assistant: { name: "Pip", style: "direct", companion: "noon" } }));
    expect(await setCompanion(getDb(), user.id, "sky")).toEqual({ name: "Changes with the sky" });
    expect(await prefs(user.id)).toMatchObject({ companion: "sky", assistantName: "Pip", assistantStyle: "direct" });
    // the welcome accepts it too
    await run((s) => saveWelcomeProgress(s, "UTC", { assistant: { style: "friend", companion: "sky" } }));
    expect((await prefs(user.id)).companion).toBe("sky");
    await expect(setCompanion(getDb(), user.id, "nova")).rejects.toThrow(/let the sky choose/);
  });

  it("only changes the signed-in user's preferences", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await born(a.run);
    await a.run((s) => finishOnboarding(s, { studyTime: "morning" }));
    expect((await prefs(b.user.id)).onboarding).toBeUndefined();
  });
});
