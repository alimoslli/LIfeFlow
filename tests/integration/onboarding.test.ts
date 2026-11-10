import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { calendarEvents, errorReports, integrations, ownerInbox, users } from "@/server/db/schema";
import { sql } from "drizzle-orm";
import { createTask } from "@/server/services/tasks";
import { createCourse } from "@/server/services/school";
import { createEmployer } from "@/server/services/work";
import { provisionalName } from "@/lib/provisional-name";
import { listAccounts } from "@/server/services/finance/accounts";
import { listActiveMemories } from "@/server/services/memory";
import { setCompanion, updateProfile } from "@/server/services/accounts";
import {
  afterAgeLock,
  closeLockedConnections,
  completeOnboarding,
  finishOnboarding,
  retryLockClosing,
  saveBirthday,
  saveWelcomeProgress,
  setTourState,
} from "@/server/services/onboarding";
import { closeAtProvider } from "@/server/services/account-cleanup";
import { listCourses } from "@/server/services/school";
import { listEmployers } from "@/server/services/work";
import { assistantProfile } from "@/lib/assistant";
import { makeUser } from "../helpers";

afterAll(closeDb);

// The lock closes connections at their provider (Plaid, Google); record which instead of calling out.
const closed = vi.hoisted(() => [] as string[]);
vi.mock("@/server/services/account-cleanup", async (load) => ({
  ...(await load<typeof import("@/server/services/account-cleanup")>()),
  closeAtProvider: vi.fn(async (row: { provider: string }) => void closed.push(row.provider)),
}));
// and a paid plan is cancelled at Stripe: record which customer instead of calling out
const cancelled = vi.hoisted(() => [] as string[]);
vi.mock("@/server/billing", async (load) => ({
  ...(await load<typeof import("@/server/billing")>()),
  billingConfig: () => ({ secretKey: "sk_test_x", priceId: "price_x", webhookSecret: "whsec_x", appUrl: "http://localhost" }),
  cancelSubscriptionsNow: vi.fn(async (_cfg: unknown, customer: string) => (cancelled.push(customer), 1)),
}));

/** Every table with a user_id that still holds their rows, other than how they sign in and the security log. */
async function leftovers(userId: string) {
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
    sql`select distinct c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE' where c.column_name = 'user_id' and c.table_schema = current_schema()`,
  );
  // Counted as the user: their tables are behind row-level security, so a count from outside always reads 0 and would
  // make every "nothing is left" check pass whether or not anything was removed.
  return withUser(userId, async (scope) => {
    const left: string[] = [];
    for (const { table_name } of tables.rows) {
      if (keep.has(table_name)) continue;
      const [{ n }] = (await scope.tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table_name)} where user_id = ${userId}`)).rows;
      if (n) left.push(table_name);
    }
    return left.sort();
  });
}

/** A finished account with things in it: a to-do, a class, a bank link and a paid plan. */
async function finishedWithData(name: string) {
  const made = await makeUser(name);
  await getDb()
    .update(users)
    .set({ preferences: { ...made.user.preferences, onboarding: "done", birthDate: undefined }, stripeCustomerId: `cus_${randomUUID().slice(0, 8)}` })
    .where(eq(users.id, made.user.id));
  await made.run(async (s) => {
    await s.tx
      .insert(integrations)
      .values({ userId: made.user.id, provider: "plaid", status: "connected", displayName: "Bank", encryptedCredentials: "sealed" });
    await createCourse(s, { name: "Math 7" });
    await createTask(s, "UTC", { title: "Homework" });
  });
  return made;
}

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
    expect(await prefs(user.id)).toMatchObject({ lifeStage: "both", studyTime: "evening", jarvisTone: "concise", onboarding: "done", tour: "done" });
  });

  it("finishing setup with no name leaves it going by its skyling's own (Ray by default), never 'Jarvis'", async () => {
    const { user, run } = await makeUser();
    await born(run);
    await run((s) => completeOnboarding(s, { lifeStage: "both", assistant: { name: undefined, style: "friend" } }));
    const p = await prefs(user.id);
    expect(p.assistantName).toBeUndefined();
    expect(assistantProfile(p)).toMatchObject({ name: "Ray", named: false });
  });

  it("is all-or-nothing: a refused step saves nothing", async () => {
    const { user, run } = await makeUser();
    await expect(run((s) => completeOnboarding(s, { courses: ["Chemistry"], aboutMe: "my password is hunter22" }))).rejects.toThrow(/Sensitive data/);
    expect(await run((s) => listCourses(s))).toHaveLength(0);
    expect((await prefs(user.id)).onboarding).toBeUndefined();
  });

  it("skipping finishes setup without creating anything or queuing a tour, and the tour can be replayed and finished", async () => {
    const { user, run } = await makeUser();
    await born(run);
    await run((s) => finishOnboarding(s));
    // item 7: no tour after the welcome (it teaches what the tour did); Settings can still replay it
    expect(await prefs(user.id)).toMatchObject({ onboarding: "done", tour: "done" });
    expect(await run((s) => listCourses(s))).toHaveLength(0);
    await run((s) => setTourState(s, "pending"));
    expect((await prefs(user.id)).tour).toBe("pending");
    await run((s) => setTourState(s, "done"));
    expect((await prefs(user.id)).tour).toBe("done");
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
    // a real new account is in setup; only setup locks at once (a finished account confirms the date first)
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "pending" } })
      .where(eq(users.id, user.id));
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
    // the name they gave goes too (only the stand-in from the email is left), whatever stage the account was at
    expect((await getDb().select({ name: users.name }).from(users).where(eq(users.id, user.id)))[0].name).toBe(provisionalName(user.email));
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
      await s.tx.insert(integrations).values([
        { userId: user.id, provider: "canvas", status: "connected", displayName: "canvas.school.edu" },
        { userId: user.id, provider: "plaid", status: "connected", displayName: "Bank", encryptedCredentials: "sealed" },
        { userId: user.id, provider: "google", status: "connected", displayName: "kai@example.com", encryptedCredentials: "sealed" },
      ]);
      const c = await createCourse(s, { name: "Grade 5 Science" });
      await createTask(s, "UTC", { title: "Volcano model" });
      await s.tx
        .insert(calendarEvents)
        .values({ userId: user.id, title: "Science", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), kind: "class", courseId: c.id });
      await createEmployer(s, { name: "Lemonade stand", payType: "hourly" });
    });
    await getDb()
      .update(users)
      .set({ timezone: "America/Denver", inboxToken: `t${Date.now()}`, smsPhone: `+1555${String(Date.now()).slice(-7)}` })
      .where(eq(users.id, user.id));
    // they also sent feedback, which the owner's inbox keeps a copy of
    await getDb()
      .insert(ownerInbox)
      .values({ senderUserId: user.id, senderName: "Kai Real", senderEmail: user.email, kind: "idea", message: "more dinosaurs" });
    // then they went back and gave their real birthday
    closed.length = 0;
    expect(await run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 10}-02-02` }))).toEqual({ blocked: true });
    expect(await getDb().select().from(ownerInbox).where(eq(ownerInbox.senderUserId, user.id))).toEqual([]);
    // nothing outside is called inside the lock: the bank link and the Google grant wait, as only their sealed grant, for the commit
    expect(closed).toEqual([]);
    expect(await leftovers(user.id)).toEqual(["integrations"]);
    const waiting = await run((s) => s.tx.select().from(integrations));
    expect(waiting.map((w) => [w.provider, w.displayName, w.externalId, w.metadata]).sort()).toEqual([
      ["google", null, null, {}],
      ["plaid", null, null, {}],
    ]);
    expect((await prefs(user.id)).ageLockClosing).toBe(true);
    // then the bank link is removed at Plaid and the Google grant revoked, like deleting an account, and nothing is left
    expect(await closeLockedConnections(getDb(), user.id)).toEqual({ closed: 2, left: 0 });
    expect(closed.sort()).toEqual(["google", "plaid"]);
    expect(await leftovers(user.id)).toEqual([]);
    const [u] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(u.name).toBe(provisionalName(u.email));
    expect([u.timezone, u.inboxToken, u.smsPhone]).toEqual(["UTC", null, null]);
    expect(Object.keys(u.preferences).sort()).toEqual(["ageBlockedAt", "onboarding"]);
    expect(u.preferences.onboarding).toBe("pending");
  });

  it("a link that doesn't close at the provider stays marked, is shown to the owner, and the sync cron's retry closes it", async () => {
    const { user, run } = await finishedWithData("Rae Retry");
    closed.length = 0;
    expect(await run((s) => saveBirthday(s, "UTC", `${new Date().getFullYear() - 9}-03-03`, { confirmed: true }))).toEqual({ blocked: true });
    // Plaid is down the first time
    vi.mocked(closeAtProvider).mockRejectedValueOnce(new Error("down"));
    expect(await closeLockedConnections(getDb(), user.id)).toEqual({ closed: 0, left: 1 });
    expect((await prefs(user.id)).ageLockClosing).toBe(true);
    expect(await leftovers(user.id)).toEqual(["integrations"]);
    const { ageLocksToReview } = await import("@/server/services/admin");
    expect((await ageLocksToReview(getDb())).find((r) => r.id === user.id)).toMatchObject({ paid: true, closing: true });
    // the cron's next run closes it and clears the mark; the paid plan still waits for the owner
    expect(await retryLockClosing(getDb())).toBeGreaterThanOrEqual(1);
    expect(closed).toEqual(["plaid"]);
    expect(await leftovers(user.id)).toEqual([]);
    expect((await prefs(user.id)).ageLockClosing).toBeUndefined();
    expect((await ageLocksToReview(getDb())).find((r) => r.id === user.id)).toMatchObject({ paid: true, closing: false });
    // a link that never closes is not kept forever: after the tenth try nothing more is kept of it, and the owner is told
    const stuck = await finishedWithData("Sid Stuck");
    await stuck.run((s) => saveBirthday(s, "UTC", `${new Date().getFullYear() - 9}-03-03`, { confirmed: true }));
    vi.mocked(closeAtProvider).mockRejectedValue(new Error("down"));
    try {
      for (let i = 1; i < 10; i++) expect(await closeLockedConnections(getDb(), stuck.user.id)).toEqual({ closed: 0, left: 1 });
      expect(await closeLockedConnections(getDb(), stuck.user.id)).toEqual({ closed: 1, left: 0 });
    } finally {
      vi.mocked(closeAtProvider).mockReset();
      vi.mocked(closeAtProvider).mockImplementation(async (row: { provider: string }) => void closed.push(row.provider));
    }
    expect(await leftovers(stuck.user.id)).toEqual([]);
    expect((await prefs(stuck.user.id)).ageLockClosing).toBeUndefined();
    const notes = await getDb().select().from(errorReports).where(eq(errorReports.route, "age.lock"));
    expect(notes.map((n) => n.message)).toContain(
      "Age lock: a bank or Google link couldn't be closed at the provider after several tries. It was removed here.",
    );
    // and it never touches an account that isn't locked
    const other = await finishedWithData("Nora Normal");
    expect(await closeLockedConnections(getDb(), other.user.id)).toEqual({ closed: 0, left: 0 });
    expect(await leftovers(other.user.id)).toContain("integrations");
  });

  it("the demo account can't be locked", async () => {
    const { user, run } = await makeUser("Demo Dee");
    await getDb()
      .update(users)
      .set({ accountKind: "demo", preferences: { onboarding: "pending" } })
      .where(eq(users.id, user.id));
    await expect(run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 9}-03-03` }))).rejects.toThrow(
      "The demo account keeps its birthday.",
    );
    expect((await prefs(user.id)).ageBlockedAt).toBeUndefined();
  });

  it("a new table with a user_id is emptied by the lock unless it's listed as kept, and a view can't break it", async () => {
    const t = `lock_probe_${Date.now()}`;
    await getDb().execute(sql`create table ${sql.identifier(t)} (user_id uuid not null)`);
    // a view that can't be deleted from (distinct), with a user_id column
    await getDb().execute(sql`create view ${sql.identifier(`${t}_v`)} as select distinct user_id from ${sql.identifier(t)}`);
    try {
      const { user, run } = await makeUser("Probe");
      await getDb()
        .update(users)
        .set({ preferences: { onboarding: "pending" } })
        .where(eq(users.id, user.id));
      await getDb().execute(sql`insert into ${sql.identifier(t)} values (${user.id})`);
      expect(await run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 9}-01-01` }))).toEqual({ blocked: true });
      const [{ n }] = (await getDb().execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)} where user_id = ${user.id}`)).rows;
      expect(n).toBe(0);
    } finally {
      await getDb().execute(sql`drop view if exists ${sql.identifier(`${t}_v`)}`);
      await getDb().execute(sql`drop table if exists ${sql.identifier(t)}`);
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

  it("Settings never locks or empties a finished account: an under-13 date there is a slip (the review of 0c77531)", async () => {
    const { user } = await finishedWithData("Set Tings");
    const base = { name: "Set Tings", timezone: "UTC" };
    const before = await leftovers(user.id);
    closed.length = 0;
    cancelled.length = 0;
    await expect(updateProfile(getDb(), user.id, { ...base, birthDate: "2015-05-05" })).rejects.toThrow("Check the year.");
    const [u] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(u.preferences.ageBlockedAt).toBeUndefined();
    expect(u.name).toBe("Set Tings");
    expect(await leftovers(user.id)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
    expect(closed).toEqual([]);
    expect(cancelled).toEqual([]);
    // the right year then saves
    await updateProfile(getDb(), user.id, { ...base, birthDate: "2000-05-05" });
    expect((await prefs(user.id)).birthDate).toBe("2000-05-05");
  });

  it("a finished account is locked and emptied only after the date is read back and confirmed; a paid plan is flagged, never cancelled", async () => {
    const { user, run } = await finishedWithData("Con Firm");
    const before = await leftovers(user.id);
    const young = `${new Date().getFullYear() - 8}-05-05`;
    closed.length = 0;
    cancelled.length = 0;
    // today's date (a phone's picker opens on it) is a slip: refused, nothing touched
    const today = new Date().toISOString().slice(0, 10);
    await expect(run((s) => saveBirthday(s, "UTC", today))).rejects.toThrow("Check the year.");
    await expect(run((s) => saveBirthday(s, "UTC", today, { confirmed: true }))).rejects.toThrow("Check the year.");
    // a plausible under-13 date: read back first, nothing touched
    expect(await run((s) => saveBirthday(s, "UTC", young))).toEqual({ blocked: false, confirm: young });
    expect((await prefs(user.id)).ageBlockedAt).toBeUndefined();
    expect(await leftovers(user.id)).toEqual(before);
    // the welcome's own save can't be used to lock a finished account either
    await expect(run((s) => saveWelcomeProgress(s, "UTC", { birthDate: young }))).rejects.toThrow("Check the year.");
    expect((await prefs(user.id)).ageBlockedAt).toBeUndefined();
    // confirmed: locked and emptied like setup, the bank closed at Plaid after the commit, and Stripe left alone
    await getDb().delete(errorReports).where(eq(errorReports.route, "age.lock"));
    expect(await run((s) => saveBirthday(s, "UTC", young, { confirmed: true }))).toEqual({ blocked: true });
    expect(closed).toEqual([]);
    expect(await leftovers(user.id)).toEqual(["integrations"]);
    // nothing outside happens inside the lock, not even the owner's flag (it can send him an email)
    expect(await getDb().select().from(errorReports).where(eq(errorReports.route, "age.lock"))).toEqual([]);
    expect(await afterAgeLock(getDb(), user.id)).toEqual({ closed: 1, left: 0 });
    const [u] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(Object.keys(u.preferences).sort()).toEqual(["ageBlockedAt", "onboarding"]);
    expect(u.name).toBe(provisionalName(u.email));
    expect(await leftovers(user.id)).toEqual([]);
    expect(closed).toEqual(["plaid"]);
    expect(cancelled).toEqual([]);
    const flags = await getDb().select().from(errorReports).where(eq(errorReports.route, "age.lock"));
    expect(flags.map((f) => f.message)).toEqual(["Age lock: a locked account has a billing record. Review it in Stripe."]);
    await expect(updateProfile(getDb(), user.id, { name: "Con Firm", timezone: "UTC", birthDate: "2000-05-05" })).rejects.toThrow(
      "LifeFlow is for people 13 and older.",
    );
  });

  it("an older account without a birthday is asked once: a real one saves; under 13 locks the same way", async () => {
    const a = await makeUser("Ola Old");
    expect(await a.run((s) => saveBirthday(s, "America/Chicago", "1998-08-08"))).toEqual({ blocked: false });
    expect((await prefs(a.user.id)).birthDate).toBe("1998-08-08");
    await expect(a.run((s) => saveBirthday(s, "UTC", "2010-02-31"))).rejects.toThrow("Pick your birthday.");
    // Today's card on a finished account: under 13 locks it and empties it, like setup does, once they've confirmed the date
    const b = await finishedWithData("Bo Young");
    expect(await b.run((s) => saveBirthday(s, "UTC", `${new Date().getFullYear() - 8}-05-05`, { confirmed: true }))).toEqual({ blocked: true });
    await closeLockedConnections(getDb(), b.user.id);
    expect(await leftovers(b.user.id)).toEqual([]);
    expect(Object.keys(await prefs(b.user.id)).sort()).toEqual(["ageBlockedAt", "onboarding"]);
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
