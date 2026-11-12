import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { adminFor } from "@/server/auth/admin";
import { createSession, validateSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, errorReports, passkeys, sessions, users } from "@/server/db/schema";
import { AdminError, clearError, deleteUser, getUser, health, listUsers, overview, setPlan, setSuspended, signOutEverywhere } from "@/server/services/admin";
import { emailHash } from "@/server/services/referrals";
import { makeUser } from "../helpers";

afterAll(closeDb);

const db = () => getDb();

async function makeAdmin() {
  const { user } = await makeUser("Owner");
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, user.id));
  const env = { ADMIN_EMAILS: user.email };
  const admin = await adminFor(db(), user.id, env);
  expect(admin).not.toBeNull();
  // Services read ADMIN_EMAILS from the process environment, like production.
  process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, user.email].filter(Boolean).join(",");
  return { admin: admin!, user };
}

describe("who counts as an admin", () => {
  it("needs the email on the list AND two-step sign-in or a passkey", async () => {
    const { user } = await makeUser("Squatter");
    const env = { ADMIN_EMAILS: user.email };
    expect(await adminFor(db(), user.id, env)).toBeNull(); // listed, but no 2FA or passkey
    await db()
      .insert(passkeys)
      .values({ userId: user.id, credentialId: `c-${user.id}`, publicKey: "k", name: "Test phone" });
    expect(await adminFor(db(), user.id, env)).toEqual({ id: user.id, email: user.email });
    expect(await adminFor(db(), user.id, { ADMIN_EMAILS: "someone-else@x.io" })).toBeNull();
    expect(await adminFor(db(), user.id, {})).toBeNull();
  });
  it("is never a suspended account", async () => {
    const { user } = await makeUser("Suspended owner");
    await db().update(users).set({ totpEnabledAt: new Date(), suspendedAt: new Date() }).where(eq(users.id, user.id));
    expect(await adminFor(db(), user.id, { ADMIN_EMAILS: user.email })).toBeNull();
  });
});

describe("overview and user list", () => {
  it("counts users and finds them by search, escaping wildcards", async () => {
    const before = await overview(db());
    const a = await makeUser("Zelda Findable");
    await makeUser("Plain Person");
    const after = await overview(db());
    expect(after.users).toBe(before.users + 2);
    expect(after.new24h).toBeGreaterThanOrEqual(before.new24h + 2);
    expect(after.signupsByDay).toHaveLength(30);
    expect(after.signupsByDay.at(-1)!.n).toBeGreaterThanOrEqual(2);

    expect((await listUsers(db(), { q: "zelda find" })).rows.map((r) => r.id)).toContain(a.user.id); // partial, any case
    expect((await listUsers(db(), { q: "findable zelda" })).rows).toEqual([]); // words must be in order
    expect((await listUsers(db(), { q: a.user.email.toUpperCase() })).rows.map((r) => r.id)).toEqual([a.user.id]); // by email
    expect((await listUsers(db(), { q: "%" })).total).toBe(0); // a literal %, not "everything"
  });
  it("filters by plan and status, and pages", async () => {
    const u = await makeUser("Pro Person");
    await db().update(users).set({ plan: "pro" }).where(eq(users.id, u.user.id));
    const pro = await listUsers(db(), { plan: "pro", q: "Pro Person" });
    expect(pro.rows).toHaveLength(1);
    expect((await listUsers(db(), { status: "suspended", q: "Pro Person" })).rows).toHaveLength(0);
    const all = await listUsers(db(), { page: 99999 });
    expect(all.rows).toEqual([]);
    expect(all.pages).toBeGreaterThanOrEqual(1);
  });
  it("lists only the accounts seen in the last 24 hours, newest seen first, matching the Active today count", async () => {
    const tag = `Seen ${Date.now()}`;
    const early = await makeUser(`${tag} early`);
    const late = await makeUser(`${tag} late`);
    const away = await makeUser(`${tag} away`);
    const none = await makeUser(`${tag} none`); // never signed in
    await createSession(db(), early.user.id);
    await createSession(db(), late.user.id);
    await createSession(db(), away.user.id);
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
    await db()
      .update(sessions)
      .set({ lastSeenAt: ago(5) })
      .where(eq(sessions.userId, early.user.id));
    await db()
      .update(sessions)
      .set({ lastSeenAt: ago(1) })
      .where(eq(sessions.userId, late.user.id));
    await db()
      .update(sessions)
      .set({ lastSeenAt: ago(48) })
      .where(eq(sessions.userId, away.user.id));

    const today = await listUsers(db(), { q: tag, seen: "today" });
    expect(today.rows.map((r) => r.id)).toEqual([late.user.id, early.user.id]); // newest seen first; away and none left out
    expect(today.total).toBe(2);
    expect((await listUsers(db(), { q: tag })).total).toBe(4); // without the filter, everyone
    expect(today.rows.map((r) => r.id)).not.toContain(none.user.id);

    // The list and the "Active today" tile use the same rule.
    const before = (await overview(db())).active24h;
    await db()
      .update(sessions)
      .set({ lastSeenAt: ago(2) })
      .where(eq(sessions.userId, away.user.id));
    expect((await overview(db())).active24h).toBe(before + 1);
    expect((await listUsers(db(), { q: tag, seen: "today" })).total).toBe(3);
  });
  it("stamps last seen every 10 minutes of use, not once a day", async () => {
    const u = await makeUser("Seen Stamp");
    const { token } = await createSession(db(), u.user.id);
    const at = async () => (await db().select({ t: sessions.lastSeenAt }).from(sessions).where(eq(sessions.userId, u.user.id)))[0].t.getTime();
    await db()
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 2 * 60_000) })
      .where(eq(sessions.userId, u.user.id));
    const recent = await at();
    await validateSession(db(), token);
    expect(await at()).toBe(recent); // used 2 minutes ago: no write
    await db()
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(sessions.userId, u.user.id));
    await validateSession(db(), token);
    expect(Date.now() - (await at())).toBeLessThan(60_000); // 30 minutes stale: stamped now
  });
  it("shows account facts and nothing private", async () => {
    const u = await makeUser("Detail Person");
    const d = await getUser(db(), u.user.id);
    expect(d).toMatchObject({ email: u.user.email, plan: "free", twoFactor: false, passkeys: 0, hasPhone: false, hasStripeCustomer: false, isAdmin: false });
    expect(JSON.stringify(d)).not.toMatch(/password|hash|secret/i);
    expect(await getUser(db(), "not-a-uuid")).toBeNull();
  });
});

describe("admin actions", () => {
  it("signs a user out everywhere and logs it", async () => {
    const { admin } = await makeAdmin();
    const { user } = await makeUser("Signed In");
    await createSession(db(), user.id);
    await createSession(db(), user.id);
    expect((await db().select().from(sessions).where(eq(sessions.userId, user.id))).length).toBe(2);
    await signOutEverywhere(db(), admin, user.id);
    expect(await db().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    const [row] = await db().select().from(adminActions).where(eq(adminActions.targetUserId, user.id));
    expect(row).toMatchObject({ action: "user.sign_out_everywhere", actorEmail: admin.email, targetEmail: user.email });
  });

  it("suspends: existing sessions stop working at once, data stays, and unsuspend restores sign-in", async () => {
    const { admin } = await makeAdmin();
    const { user } = await makeUser("To Suspend");
    const { token } = await createSession(db(), user.id);
    expect((await validateSession(db(), token))?.id).toBe(user.id);
    await setSuspended(db(), admin, user.id, true);
    expect(await validateSession(db(), token)).toBeNull();
    const { token: t2 } = await createSession(db(), user.id); // even a session made after suspension is useless
    expect(await validateSession(db(), t2)).toBeNull();
    expect((await db().select().from(users).where(eq(users.id, user.id))).length).toBe(1);
    await setSuspended(db(), admin, user.id, false);
    expect((await validateSession(db(), t2))?.id).toBe(user.id);
  });

  it("changes the plan, rejecting anything but free or pro", async () => {
    const { admin } = await makeAdmin();
    const { user } = await makeUser("Plan Change");
    await setPlan(db(), admin, user.id, "pro");
    expect((await getUser(db(), user.id))!.plan).toBe("pro");
    await expect(setPlan(db(), admin, user.id, "gold")).rejects.toBeInstanceOf(AdminError);
    const [row] = await db().select().from(adminActions).where(eq(adminActions.targetUserId, user.id));
    expect(row.metadata).toMatchObject({ from: "free", to: "pro" });
  });

  it("deletes only with the exact email typed, refuses active Pro users, and keeps the log readable afterwards", async () => {
    const { admin } = await makeAdmin();
    const { user } = await makeUser("To Delete");
    await expect(deleteUser(db(), admin, user.id, "wrong@x.io")).rejects.toThrow(/doesn't match/);
    expect(await getUser(db(), user.id)).not.toBeNull();

    await db().update(users).set({ plan: "pro" }).where(eq(users.id, user.id));
    await expect(deleteUser(db(), admin, user.id, user.email)).rejects.toThrow(/Stripe/);
    expect(await getUser(db(), user.id)).not.toBeNull();

    await db().update(users).set({ plan: "free" }).where(eq(users.id, user.id));
    await deleteUser(db(), admin, user.id, `  ${user.email.toUpperCase()} `);
    expect(await getUser(db(), user.id)).toBeNull();
    const [row] = await db().select().from(adminActions).where(eq(adminActions.targetUserId, user.id));
    // the log keeps the action and who did it, but the plain email is replaced by the one-way fingerprint
    expect(row).toMatchObject({ action: "user.delete", targetEmail: emailHash(user.email) });
    expect(row.targetEmail).not.toBe(user.email);
  });

  it("never acts on the admin, another admin, or the demo account", async () => {
    const { admin, user: owner } = await makeAdmin();
    const other = await makeAdmin(); // a second admin
    const demo = await makeUser("Demo");
    await db().update(users).set({ accountKind: "demo" }).where(eq(users.id, demo.user.id));
    for (const id of [owner.id, other.user.id, demo.user.id]) {
      await expect(setSuspended(db(), admin, id, true)).rejects.toBeInstanceOf(AdminError);
      await expect(deleteUser(db(), admin, id, "x")).rejects.toBeInstanceOf(AdminError);
      await expect(signOutEverywhere(db(), admin, id)).rejects.toBeInstanceOf(AdminError);
    }
    await expect(setPlan(db(), admin, "not-a-uuid", "pro")).rejects.toThrow(/Unknown user/);
  });

  it("clears an error report and logs it", async () => {
    const { admin } = await makeAdmin();
    const fp = `ab${Date.now().toString(16)}`;
    await db().insert(errorReports).values({ fingerprint: fp, source: "server", route: "/x", message: "boom" });
    await clearError(db(), admin, fp);
    expect(await db().select().from(errorReports).where(eq(errorReports.fingerprint, fp))).toHaveLength(0);
    await expect(clearError(db(), admin, "NOT HEX!")).rejects.toBeInstanceOf(AdminError);
  });
});

describe("health", () => {
  it("reports the database and which integrations are configured, never a key", async () => {
    const h = await health(db(), { OPENAI_API_KEY: "sk-secret-value", CRON_SECRET: "cron-secret-value" });
    expect(h.dbMs).toBeGreaterThanOrEqual(0);
    expect(h.migrations).toBeGreaterThan(0);
    expect(h.integrations.find((i) => i.name.startsWith("AI"))!.on).toBe(true);
    expect(h.integrations.find((i) => i.name.startsWith("Payments"))!.on).toBe(false);
    expect(JSON.stringify(h)).not.toMatch(/secret-value/);
  });
});

describe("AI use, limits and invites", () => {
  it("reads each person's testing-limit counters and resets them, logged", async () => {
    const { admin } = await makeAdmin();
    const { user } = await makeUser("Heavy user");
    const { reserveBudget, settleBudget } = await import("@/server/services/ai-budget");
    const { todayIn } = await import("@/lib/dates");
    const day = todayIn(user.timezone);
    const use = async (period: string, what: string, amount: number) => {
      const r = await reserveBudget([{ key: `u:${user.id}:${period}:${what}`, kind: "count", amount, limit: null }], 60);
      if (r.ok && r.holdId) await settleBudget(r.holdId);
    };
    await use(day, "msgs", 3);
    await use(day.slice(0, 7), "msgs", 3);
    await use(day, "vcalls", 1);
    const { usage, usageFor, resetLimits } = await import("@/server/services/admin");
    expect(await usageFor(db(), user.id)).toMatchObject({ messagesToday: 3, messagesMonth: 3, voiceToday: 1, voiceMonth: 0 });
    const all = await usage(db());
    expect(all.pricing.unpriced).toContain("Voice"); // voice is never priced
    expect(typeof all.pricing.dollarsCounting).toBe("boolean");
    expect(all.people.find((p) => p.userId === user.id)).toMatchObject({ email: user.email, messagesMonth: 3 });

    await resetLimits(db(), admin, user.id);
    expect(await usageFor(db(), user.id)).toMatchObject({ messagesToday: 0, messagesMonth: 0, voiceToday: 0 });
    const [logged] = await db().select().from(adminActions).where(eq(adminActions.targetUserId, user.id));
    expect(logged.action).toBe("reset_limits");
  });

  it("shows who invited someone and how many they invited", async () => {
    const { user: inviter } = await makeUser("Inviter");
    const { user: friend } = await makeUser("Friend");
    await db().update(users).set({ invitedBy: inviter.id }).where(eq(users.id, friend.id));
    expect((await getUser(db(), friend.id))?.invitedBy).toEqual({ id: inviter.id, email: inviter.email });
    expect((await getUser(db(), inviter.id))?.invitedCount).toBe(1);
    expect((await overview(db())).invited).toBeGreaterThanOrEqual(1);
  });
});

describe("feedback inbox, announcements, growth and export", () => {
  it("copies feedback to the owner's inbox in full, and handling it is logged", async () => {
    const { admin } = await makeAdmin();
    const u = await makeUser("Sender Sam");
    const { sendFeedback } = await import("@/server/services/feedback");
    await u.run((s) =>
      sendFeedback(s, { name: "Sender Sam", email: u.user.email }, { kind: "bug", message: "The Money tab froze after I synced." }, { env: {} }),
    );
    const { listInbox, setInboxHandled, inboxCounts } = await import("@/server/services/admin");
    const open = await listInbox(db(), { status: "open" });
    const mine = open.find((f) => f.senderUserId === u.user.id)!;
    expect(mine).toMatchObject({
      kind: "bug",
      message: "The Money tab froze after I synced.",
      senderName: "Sender Sam",
      senderEmail: u.user.email,
      emailedAt: null,
    });
    expect((await inboxCounts(db())).open).toBeGreaterThanOrEqual(1);
    await setInboxHandled(db(), admin, mine.id, true);
    expect((await listInbox(db(), { status: "handled" })).some((f) => f.id === mine.id)).toBe(true);
    const logged = await db().select().from(adminActions).where(eq(adminActions.action, "feedback.handled"));
    expect(logged.some((l) => (l.metadata as { feedbackId?: string }).feedbackId === mine.id)).toBe(true);
  });

  it("shows one announcement at a time, checks links, and ends on request", async () => {
    const { admin } = await makeAdmin();
    const { createAnnouncement, endAnnouncement, listAnnouncements } = await import("@/server/services/admin");
    const { activeAnnouncement } = await import("@/server/services/announcements");
    await expect(createAnnouncement(db(), admin, { message: "Hi", tone: "info" })).rejects.toThrow(/between 3 and 240/);
    await expect(createAnnouncement(db(), admin, { message: "Bad link here", tone: "info", linkUrl: "javascript:alert(1)" })).rejects.toThrow(
      /must start with/,
    );
    await createAnnouncement(db(), admin, { message: "First news", tone: "info", days: 7 });
    await createAnnouncement(db(), admin, { message: "Second news", tone: "warning", linkUrl: "/settings/integrations" });
    const live = await activeAnnouncement(db());
    expect(live).toMatchObject({ message: "Second news", tone: "warning", linkUrl: "/settings/integrations" });
    const { live: listed } = await listAnnouncements(db());
    expect(listed?.id).toBe(live!.id);
    await endAnnouncement(db(), admin, live!.id);
    expect(await activeAnnouncement(db())).toBeNull();
  });

  it("ranks inviters and exports accounts as safe CSV, logged", async () => {
    const { admin } = await makeAdmin();
    const { user: inviter } = await makeUser("Top Inviter");
    const { user: f1 } = await makeUser("=cmd|' /C calc'!A0");
    await db().update(users).set({ invitedBy: inviter.id }).where(eq(users.id, f1.id));
    const { growth, usersCsv, csvCell } = await import("@/server/services/admin");
    const g = await growth(db());
    expect(g.topInviters.find((t) => t.id === inviter.id)?.invited).toBe(1);
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    const csv = await usersCsv(db(), admin);
    expect(csv.split("\r\n")[0]).toBe('"Name","Email","Plan","Joined","Last seen","Suspended","Invited by"');
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(csv).toContain(`"${inviter.email}"`);
    const logged = await db().select().from(adminActions).where(eq(adminActions.action, "users.export"));
    expect(logged.length).toBeGreaterThan(0);
  });
});
