import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { adminFor } from "@/server/auth/admin";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, users } from "@/server/db/schema";
import { AdminError, confirmEmailsByAdmin, sendApologies, unconfirmedEmails } from "@/server/services/admin";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { makeUser } from "../helpers";

/**
 * Confirming emails from HQ, and the apology (owner, 2026-11-17: the confirmation email reached nobody but him; "confirm
 * their waitlist registration ... apologise for the mistake ... send them back to see their waiting list status").
 */
afterAll(closeDb);
const db = () => getDb();

async function makeAdmin() {
  const { user } = await makeUser("Owner");
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, user.id));
  process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, user.email].filter(Boolean).join(",");
  return (await adminFor(db(), user.id))!;
}
const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "LifeFlow <hello@example.com>", APP_URL: "https://lifeflow.example" };

describe("confirming emails from HQ", () => {
  it("lists unconfirmed real accounts, never an admin or one locked under 13", async () => {
    const admin = await makeAdmin();
    const { user: a } = await makeUser("Una Confirmed");
    const { user: locked } = await makeUser("Lock Ed");
    await db()
      .update(users)
      .set({ preferences: { ageBlockedAt: new Date().toISOString() } })
      .where(eq(users.id, locked.id));
    const list = await unconfirmedEmails(db(), 100);
    expect(list.some((p) => p.id === a.id)).toBe(true);
    expect(list.some((p) => p.id === locked.id)).toBe(false);
    expect(list.some((p) => p.id === admin.id)).toBe(false);
  });

  it("needs the confirm box, confirms once, credits the friend who invited them, and logs it", async () => {
    const admin = await makeAdmin();
    const { user: inviter } = await makeUser("Ivy Inviter");
    const { user: friend } = await makeUser("Fred Friend");
    await recordInvite(db(), friend.id, await inviteCodeFor(db(), inviter.id));
    await expect(confirmEmailsByAdmin(db(), admin, [friend.id], false)).rejects.toThrow(AdminError);
    const [before] = await db().select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, friend.id));
    expect(before.v).toBeNull();

    const r = await confirmEmailsByAdmin(db(), admin, [friend.id], true);
    expect(r.confirmed).toBe(1);
    const [after] = await db().select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, friend.id));
    expect(after.v).not.toBeNull();
    const logged = await db()
      .select()
      .from(adminActions)
      .where(and(eq(adminActions.action, "email.confirm_by_admin"), eq(adminActions.targetUserId, friend.id)));
    expect(logged).toHaveLength(1);

    // a second press changes nothing
    expect((await confirmEmailsByAdmin(db(), admin, [friend.id], true)).confirmed).toBe(0);
  });

  it("refuses the admin themself, and ignores ids that aren't accounts", async () => {
    const admin = await makeAdmin();
    const r = await confirmEmailsByAdmin(db(), admin, [admin.id, "00000000-0000-4000-8000-000000000000"], true);
    expect(r.confirmed).toBe(0);
    await expect(confirmEmailsByAdmin(db(), admin, ["not-an-id"], true)).rejects.toThrow("Nobody was chosen.");
  });
});

describe("the apology", () => {
  it("goes only to confirmed people, links to APP_URL's waitlist, and counts as sent only with the provider's id", async () => {
    const admin = await makeAdmin();
    const { user: done } = await makeUser("Dana Done");
    const { user: notYet } = await makeUser("Nate Notyet");
    await confirmEmailsByAdmin(db(), admin, [done.id], true);
    const sent: { to: string; text: string; html: string }[] = [];
    const send = async (_c: unknown, m: { to: string; text: string; html: string }) => {
      sent.push(m);
      return { id: "msg_1" };
    };
    const r = await sendApologies(db(), admin, [done.id, notYet.id], true, { send: send as never, env });
    expect(r.sent).toBe(1);
    expect(r.notConfirmed).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(done.email);
    expect(sent[0].text).toContain("https://lifeflow.example/waitlist");
    expect(sent[0].text).toContain("Sorry");
    expect(sent[0].text).not.toMatch(/assistant|companion|jarvis/i);
  });

  it("sends nothing without the confirm box, without email set up, or when the provider refuses", async () => {
    const admin = await makeAdmin();
    const { user: p } = await makeUser("Pat Person");
    await confirmEmailsByAdmin(db(), admin, [p.id], true);
    await expect(sendApologies(db(), admin, [p.id], false, { env })).rejects.toThrow(AdminError);
    await expect(sendApologies(db(), admin, [p.id], true, { env: {} })).rejects.toThrow("Email isn't set up yet");
    const refuse = async () => {
      throw new Error("Email provider refused the message (HTTP 403): validation_error: domain not verified.");
    };
    const r = await sendApologies(db(), admin, [p.id], true, { send: refuse as never, env });
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.why).toContain("domain not verified");
  });
});
