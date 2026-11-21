import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { oauthIdentities } from "@/server/db/schema";
import { appleAccessNotRevocable } from "@/server/services/accounts";
import { makeUser } from "../helpers";

afterAll(closeDb);
const db = getDb();

/** The delete screen's Apple line (owner, 2026-11-21): only when deleting can't end Apple's access for them. */
describe("appleAccessNotRevocable", () => {
  it("is true only for an Apple sign-in with no stored token", async () => {
    const none = await makeUser();
    expect(await appleAccessNotRevocable(db, none.user.id)).toBe(false);
    const old = await makeUser();
    await db.insert(oauthIdentities).values({ userId: old.user.id, provider: "apple", subject: `old-${old.user.id}` });
    expect(await appleAccessNotRevocable(db, old.user.id)).toBe(true);
    const fresh = await makeUser();
    await db.insert(oauthIdentities).values({ userId: fresh.user.id, provider: "apple", subject: `new-${fresh.user.id}`, encryptedRefreshToken: "sealed" });
    expect(await appleAccessNotRevocable(db, fresh.user.id)).toBe(false);
    const google = await makeUser();
    await db.insert(oauthIdentities).values({ userId: google.user.id, provider: "google", subject: `g-${google.user.id}` });
    expect(await appleAccessNotRevocable(db, google.user.id)).toBe(false);
  });
});
