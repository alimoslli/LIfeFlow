import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { adminFor } from "@/server/auth/admin";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, users } from "@/server/db/schema";
import { AdminError, codeAskers, confirmEmailsByAdmin } from "@/server/services/admin";
import { rateLimit } from "@/server/rate-limit";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { makeUser } from "../helpers";

/**
 * Confirming emails from HQ (owner, 2026-11-17: the confirmation email reached nobody but him; "find out who tried ... and
 * sign them up from our side").
 */
afterAll(closeDb);
const db = () => getDb();

async function makeAdmin() {
  const { user } = await makeUser("Owner");
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, user.id));
  process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, user.email].filter(Boolean).join(",");
  return (await adminFor(db(), user.id))!;
}
const asked = (id: string) => rateLimit(db(), `email-confirm:send:user:${id}`, 3, 3600);

describe("confirming emails from HQ", () => {
  it("lists only people who asked for a code and aren't confirmed, never an admin or one locked under 13", async () => {
    const admin = await makeAdmin();
    const { user: a } = await makeUser("Asked Andy");
    const { user: quiet } = await makeUser("Quiet Quinn");
    const { user: locked } = await makeUser("Lock Ed");
    await asked(a.id);
    await asked(locked.id);
    await asked(admin.id);
    await db()
      .update(users)
      .set({ preferences: { ageBlockedAt: new Date().toISOString() } })
      .where(eq(users.id, locked.id));
    const list = await codeAskers(db());
    expect(list.some((p) => p.id === a.id)).toBe(true);
    expect(list.some((p) => p.id === quiet.id)).toBe(false);
    expect(list.some((p) => p.id === locked.id)).toBe(false);
    expect(list.some((p) => p.id === admin.id)).toBe(false);
    // once confirmed they drop off
    await confirmEmailsByAdmin(db(), admin, [a.id], true);
    expect((await codeAskers(db())).some((p) => p.id === a.id)).toBe(false);
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
