import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { exportPKCS8, generateKeyPair } from "jose";
import { completeAppleSignIn, linkPendingApple, unlinkApple } from "@/server/auth/apple";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports, oauthIdentities, users } from "@/server/db/schema";
import { decryptSecret } from "@/server/crypto";
import { deleteAccount } from "@/server/services/accounts";
import { makeUser } from "../helpers";

afterAll(closeDb);

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

/** Records every outside call; `fail` answers 500. */
function fakeWorld(fail = false) {
  const calls: { url: string; body: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return fail ? new Response("{}", { status: 500 }) : Response.json({ ok: true });
  }) as typeof fetch;
  return { f, revokes: () => calls.filter((c) => c.url === REVOKE_URL) };
}

async function config() {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  return {
    clientId: "app.lifeflow.web",
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: await exportPKCS8(privateKey),
    redirectUri: "https://x.test/cb",
  };
}

const gone = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id))).length === 0;

describe("Sign in with Apple is revoked on delete and unlink", () => {
  it("stores the refresh token encrypted, revokes it once on delete, and survives a failure", async () => {
    const cfg = await config();
    const db = getDb();
    // Apple-only accounts have no password, so deleteAccount needs none.
    const make = async (token: string | null) => {
      const claims = {
        sub: `001.${crypto.randomUUID()}`,
        email: `${crypto.randomUUID().slice(0, 8)}@privaterelay.appleid.com`,
        emailVerified: true,
        isPrivateEmail: true,
      };
      const r = await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null, token);
      if (r.kind !== "created") throw new Error("expected created");
      return r.userId;
    };

    const id1 = await make("r-token-1");
    const [row] = await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, id1));
    expect(row.encryptedRefreshToken).toMatch(/^v1\./);
    expect(row.encryptedRefreshToken).not.toContain("r-token-1");
    const raw = await db.execute(sql`select encrypted_refresh_token as t from oauth_identities where user_id = ${id1}`);
    expect(JSON.stringify(raw)).not.toContain("r-token-1");

    const w = fakeWorld();
    await deleteAccount(db, id1, "", { fetch: w.f, apple: cfg });
    expect(w.revokes()).toHaveLength(1);
    const body = new URLSearchParams(w.revokes()[0].body);
    expect(body.get("token")).toBe("r-token-1");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("app.lifeflow.web");
    expect(body.get("client_secret")).toBeTruthy();
    expect(await gone(id1)).toBe(true);

    // A failing Apple does not block deletion; the error record carries no token.
    const id2 = await make("r-token-2");
    const w2 = fakeWorld(true);
    const total = async () =>
      (await db.select().from(errorReports).where(eq(errorReports.message, "Account deletion: Apple revoke failed"))).reduce((n, r) => n + r.count, 0);
    const errsBefore = await total();
    await deleteAccount(db, id2, "", { fetch: w2.f, apple: cfg });
    expect(w2.revokes()).toHaveLength(1);
    expect(await gone(id2)).toBe(true);
    expect(await total()).toBe(errsBefore + 1);
    const errs = await db.select().from(errorReports);
    expect(JSON.stringify(errs)).not.toContain("r-token-2");

    // No stored token, no call.
    const id3 = await make(null);
    const w3 = fakeWorld();
    await deleteAccount(db, id3, "", { fetch: w3.f, apple: cfg });
    expect(w3.revokes()).toHaveLength(0);
    expect(await gone(id3)).toBe(true);
  });

  it("revokes and clears the token when Apple is unlinked", async () => {
    const cfg = await config();
    const db = getDb();
    const u = await makeUser("Unlink Apple"); // has a password, so unlinking is allowed
    const claims = { sub: `001.${crypto.randomUUID()}`, email: "a@privaterelay.appleid.com", emailVerified: true, isPrivateEmail: true };
    await completeAppleSignIn(db, claims, { mode: "link", tz: "UTC", userId: u.user.id }, null, "link-refresh");
    const [row] = await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, u.user.id));
    expect(row.encryptedRefreshToken).toMatch(/^v1\./);

    const w = fakeWorld();
    await unlinkApple(db, u.user.id, { fetch: w.f, config: cfg });
    expect(w.revokes()).toHaveLength(1);
    expect(new URLSearchParams(w.revokes()[0].body).get("token")).toBe("link-refresh");
    expect(await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, u.user.id))).toHaveLength(0);
  });
  const linked = async (token: string | null) => {
    const db = getDb();
    const u = await makeUser("Unlink Apple edge");
    const claims = { sub: `001.${crypto.randomUUID()}`, email: "e@privaterelay.appleid.com", emailVerified: true, isPrivateEmail: true };
    await completeAppleSignIn(db, claims, { mode: "link", tz: "UTC", userId: u.user.id }, null, token);
    return u.user.id;
  };
  const identities = async (id: string) => getDb().select().from(oauthIdentities).where(eq(oauthIdentities.userId, id));
  const unlinkErrors = async () =>
    (await getDb().select().from(errorReports).where(eq(errorReports.message, "Unlink: Apple revoke failed"))).reduce((n, r) => n + r.count, 0);

  it("unlink: Apple answering 500 still removes the link and records an error without the token", async () => {
    const cfg = await config();
    const id = await linked("tok-500");
    const before = await unlinkErrors();
    const w = fakeWorld(true);
    await unlinkApple(getDb(), id, { fetch: w.f, config: cfg });
    expect(w.revokes()).toHaveLength(1);
    expect(await identities(id)).toHaveLength(0);
    expect(await unlinkErrors()).toBe(before + 1);
    expect(JSON.stringify(await getDb().select().from(errorReports))).not.toContain("tok-500");
  });

  it("unlink: no stored token, or no Apple config, makes no call; the row is still deleted", async () => {
    const cfg = await config();
    const noToken = await linked(null);
    const w = fakeWorld();
    await unlinkApple(getDb(), noToken, { fetch: w.f, config: cfg });
    expect(w.revokes()).toHaveLength(0);
    expect(await identities(noToken)).toHaveLength(0);

    const noConfig = await linked("tok-nocfg");
    const before = await unlinkErrors();
    await unlinkApple(getDb(), noConfig, { fetch: w.f, config: null });
    expect(w.revokes()).toHaveLength(0);
    expect(await identities(noConfig)).toHaveLength(0);
    expect(await unlinkErrors()).toBe(before + 1);
  });

  it("unlink: a fetch that never answers is cut off by the deadline and the row is still deleted", async () => {
    const cfg = await config();
    const id = await linked("tok-hang");
    const real = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => real(50));
    const hang = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason ?? new Error("aborted"))))) as typeof fetch;
    try {
      await unlinkApple(getDb(), id, { fetch: hang, config: cfg });
    } finally {
      spy.mockRestore();
    }
    expect(await identities(id)).toHaveLength(0);
  });

  it("the link-required path keeps the sealed refresh token when the pending link is completed", async () => {
    const db = getDb();
    const u = await makeUser("Pending Apple");
    const claims = { sub: `001.${crypto.randomUUID()}`, email: u.user.email, emailVerified: true, isPrivateEmail: false };
    const r = await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null, "pending-refresh");
    if (r.kind !== "link-required") throw new Error("expected link-required");
    expect(await linkPendingApple(db, u.user.id, r.pendingToken)).toBe(true);
    const [row] = await identities(u.user.id);
    expect(row.encryptedRefreshToken).toMatch(/^v1\./);
    expect(row.encryptedRefreshToken).not.toContain("pending-refresh");
    expect(decryptSecret(row.encryptedRefreshToken!)).toBe("pending-refresh");
  });
});
