import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { inviteCodeFor, invitedCount, inviterFor, newInviteCode, recordInvite } from "@/server/services/invites";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("invite links", () => {
  it("gives each person one stable code", async () => {
    const maya = await makeUser("Maya Chen");
    const code = await inviteCodeFor(getDb(), maya.user.id);
    expect(code).toMatch(/^[a-z2-9]{10}$/);
    expect(await inviteCodeFor(getDb(), maya.user.id)).toBe(code);
    expect(newInviteCode()).not.toBe(code);
  });

  it("credits the inviter once and counts friends who joined", async () => {
    const maya = await makeUser("Maya Chen");
    const code = await inviteCodeFor(getDb(), maya.user.id);
    expect(await inviterFor(getDb(), code.toUpperCase())).toEqual({ id: maya.user.id, firstName: "Maya" });

    const sam = await makeUser("Sam Ortiz");
    expect(await recordInvite(getDb(), sam.user.id, code)).toBe(true);
    const [row] = await getDb().select({ by: users.invitedBy }).from(users).where(eq(users.id, sam.user.id));
    expect(row.by).toBe(maya.user.id);

    // A second code can't move the credit.
    const other = await makeUser("Other");
    expect(await recordInvite(getDb(), sam.user.id, await inviteCodeFor(getDb(), other.user.id))).toBe(false);
    expect(await invitedCount(getDb(), maya.user.id)).toBe(1);
    expect(await invitedCount(getDb(), other.user.id)).toBe(0);
  });

  it("ignores unknown codes, junk and self-invites", async () => {
    const maya = await makeUser("Maya Chen");
    const code = await inviteCodeFor(getDb(), maya.user.id);
    expect(await inviterFor(getDb(), "zzzzzzzzzz")).toBeNull();
    expect(await inviterFor(getDb(), "'; drop table users; --")).toBeNull();
    expect(await recordInvite(getDb(), maya.user.id, code)).toBe(false);
    expect(await invitedCount(getDb(), maya.user.id)).toBe(0);
  });
});
