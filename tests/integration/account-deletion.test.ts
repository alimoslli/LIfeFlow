import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, errorReports, integrations, ownerInbox, users } from "@/server/db/schema";
import { emailHash } from "@/server/services/referrals";
import { encryptSecret } from "@/server/crypto";
import { deleteAccount } from "@/server/services/accounts";
import { saveGoogleConnection } from "@/server/integrations/google";
import { adminFor } from "@/server/auth/admin";
import { deleteUser } from "@/server/services/admin";
import { makeUser } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "sec";
  process.env.PLAID_ENV = "sandbox";
});

const PASSWORD = "correct horse battery";
const STRIPE_ENV = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "APP_URL"] as const;

function withStripe() {
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  process.env.STRIPE_PRICE_ID = "price_1";
  process.env.APP_URL = "https://lifeflow.test";
}
function withoutStripe() {
  for (const k of STRIPE_ENV) delete process.env[k];
}

/** Records every outside call; `failHosts` answer 500. */
function fakeWorld(
  opts: { failHosts?: string[]; hangHosts?: string[]; subs?: { id: string; status: string }[]; pages?: { id: string; status: string }[][] } = {},
) {
  const calls: { url: string; method: string; body: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
    if (opts.hangHosts?.some((h) => url.includes(h))) return new Promise<Response>(() => {});
    if (opts.failHosts?.some((h) => url.includes(h))) return new Response("{}", { status: 500 });
    if (url.includes("api.stripe.com/v1/subscriptions?")) {
      if (opts.pages) {
        const i = url.includes("starting_after=") ? 1 : 0;
        return Response.json({ data: opts.pages[i], has_more: i < opts.pages.length - 1 });
      }
      return Response.json({ data: opts.subs ?? [] });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { f, calls };
}

async function setup(opts: { plaid?: string[]; google?: boolean; stripeCustomer?: string } = {}) {
  const u = await makeUser("Delete Me");
  for (const token of opts.plaid ?? []) {
    await u.run((s) =>
      s.tx.insert(integrations).values({
        userId: u.user.id,
        provider: "plaid",
        status: "connected",
        externalId: `item-${token}`,
        encryptedCredentials: encryptSecret(JSON.stringify({ accessToken: token, cursor: null })),
      }),
    );
  }
  if (opts.google)
    await u.run((s) => saveGoogleConnection(s, { refreshToken: "g-refresh", accessToken: "a", expiresAt: Date.now() + 3_600_000, scope: "x" }, "g@x.y"));
  if (opts.stripeCustomer) await getDb().update(users).set({ stripeCustomerId: opts.stripeCustomer }).where(eq(users.id, u.user.id));
  return u;
}

const gone = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id))).length === 0;

describe("deleting an account closes what lives outside our database", () => {
  it("removes each Plaid item once, with its own token", async () => {
    const u = await setup({ plaid: ["tok-1", "tok-2"] });
    const w = fakeWorld();
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
    const removes = w.calls.filter((c) => c.url.endsWith("/item/remove"));
    expect(removes).toHaveLength(2);
    expect(removes.map((c) => JSON.parse(c.body).access_token).sort()).toEqual(["tok-1", "tok-2"]);
    expect(await gone(u.user.id)).toBe(true);
  });

  it("revokes the Google grant once", async () => {
    const u = await setup({ google: true });
    const w = fakeWorld();
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
    const revokes = w.calls.filter((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke"));
    expect(revokes).toHaveLength(1);
    expect(revokes[0].url).toContain("token=g-refresh");
    expect(await gone(u.user.id)).toBe(true);
  });

  it("cancels live Stripe subscriptions now and leaves cancelled ones alone", async () => {
    const u = await setup({ stripeCustomer: `cus_${crypto.randomUUID().slice(0, 8)}` });
    withStripe();
    try {
      const w = fakeWorld({
        subs: [
          { id: "sub_live", status: "active" },
          { id: "sub_old", status: "canceled" },
        ],
      });
      await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
      const deletes = w.calls.filter((c) => c.method === "DELETE");
      expect(deletes.map((c) => c.url)).toEqual(["https://api.stripe.com/v1/subscriptions/sub_live"]);
      expect(await gone(u.user.id)).toBe(true);
    } finally {
      withoutStripe();
    }
  });

  it("a provider failure never stops the deletion and is recorded without ids or tokens", async () => {
    const u = await setup({ plaid: ["tok-secret-9"], google: true });
    try {
      const w = fakeWorld({ failHosts: ["plaid.com", "googleapis.com"] });
      await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
      expect(await gone(u.user.id)).toBe(true);
      const reports = (await getDb().select().from(errorReports)).filter((r) => r.route === "account.delete");
      expect(reports.map((r) => r.message)).toEqual(
        expect.arrayContaining(["Account deletion: Google revoke failed", "Account deletion: bank link removal failed"]),
      );
      for (const r of reports) expect(r.message).not.toMatch(/tok-secret|cus_|g-refresh|@/);
    } finally {
      withoutStripe();
    }
  });

  it("a network error (thrown fetch) doesn't stop deletion either", async () => {
    const u = await setup({ plaid: ["tok-n"] });
    const f = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: f });
    expect(await gone(u.user.id)).toBe(true);
  });

  it("makes no outside calls when there is nothing connected", async () => {
    const u = await setup();
    withStripe();
    try {
      const w = fakeWorld();
      await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
      expect(w.calls).toHaveLength(0);
      expect(await gone(u.user.id)).toBe(true);
    } finally {
      withoutStripe();
    }
  });

  it("a wrong password revokes nothing and deletes nothing", async () => {
    const u = await setup({ plaid: ["tok-w"] });
    const w = fakeWorld();
    await expect(deleteAccount(getDb(), u.user.id, "wrong password!!", { fetch: w.f })).rejects.toThrow(/incorrect/);
    expect(w.calls).toHaveLength(0);
    expect(await gone(u.user.id)).toBe(false);
  });

  it("a Stripe failure refuses the deletion, revokes nothing else and keeps the account", async () => {
    const u = await setup({ plaid: ["tok-s"], google: true, stripeCustomer: `cus_${crypto.randomUUID().slice(0, 8)}` });
    withStripe();
    try {
      const w = fakeWorld({ subs: [{ id: "sub_live", status: "active" }], failHosts: ["subscriptions/sub_live"] });
      await expect(deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f })).rejects.toThrow(/couldn't cancel your plan/);
      expect(w.calls.some((c) => c.url.includes("plaid.com") || c.url.includes("googleapis.com"))).toBe(false);
      expect(await gone(u.user.id)).toBe(false);
    } finally {
      withoutStripe();
    }
  });

  it("follows Stripe's paging and cancels subscriptions on every page", async () => {
    const u = await setup({ stripeCustomer: `cus_${crypto.randomUUID().slice(0, 8)}` });
    withStripe();
    try {
      const w = fakeWorld({ pages: [[{ id: "sub_a", status: "active" }], [{ id: "sub_b", status: "trialing" }]] });
      await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
      expect(w.calls.filter((c) => c.method === "DELETE").map((c) => c.url.split("/").pop())).toEqual(["sub_a", "sub_b"]);
    } finally {
      withoutStripe();
    }
  });

  it("never sends another user's connections to a provider", async () => {
    const mine = await setup({ plaid: ["tok-mine"] });
    await setup({ plaid: ["tok-theirs"], google: true });
    const w = fakeWorld();
    await deleteAccount(getDb(), mine.user.id, PASSWORD, { fetch: w.f });
    expect(w.calls).toHaveLength(1);
    expect(JSON.parse(w.calls[0].body).access_token).toBe("tok-mine");
  });

  it("a hanging provider stops at the deadline and deletion still completes", async () => {
    const u = await setup({ plaid: ["tok-h"], google: true });
    const w = fakeWorld({ hangHosts: ["plaid.com"] });
    const started = Date.now();
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f, deadlineMs: 300 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(w.calls.some((c) => c.url.includes("googleapis.com"))).toBe(true); // ran in parallel
    expect(await gone(u.user.id)).toBe(true);
  });

  it("the admin delete runs the same cleanup, and refuses on a Stripe failure", async () => {
    const owner = await makeUser("Owner");
    await getDb().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.user.id));
    const savedAdmins = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = [savedAdmins, owner.user.email].filter(Boolean).join(",");
    const admin = (await adminFor(getDb(), owner.user.id, { ADMIN_EMAILS: owner.user.email }))!;

    const u = await setup({ plaid: ["tok-admin"] });
    const w = fakeWorld();
    await deleteUser(getDb(), admin, u.user.id, u.user.email, { fetch: w.f });
    expect(w.calls.filter((c) => c.url.endsWith("/item/remove"))).toHaveLength(1);
    expect(await gone(u.user.id)).toBe(true);

    const v = await setup({ stripeCustomer: `cus_${crypto.randomUUID().slice(0, 8)}` });
    withStripe();
    try {
      const bad = fakeWorld({ failHosts: ["api.stripe.com"] });
      await expect(deleteUser(getDb(), admin, v.user.id, v.user.email, { fetch: bad.f })).rejects.toThrow(/plan couldn.t be cancelled/);
      expect(await gone(v.user.id)).toBe(false);
    } finally {
      withoutStripe();
      process.env.ADMIN_EMAILS = savedAdmins;
    }
  });
});

describe("deleting an account removes the owner's copies of its feedback", () => {
  const feedbackOf = async (id: string) => getDb().select().from(ownerInbox).where(eq(ownerInbox.senderUserId, id));
  const send = (u: { id: string; name: string; email: string }) =>
    getDb().insert(ownerInbox).values({ senderUserId: u.id, senderName: u.name, senderEmail: u.email, kind: "idea", message: "Please add dark mode" });

  it("the person's own deletion", async () => {
    const u = await setup();
    const other = await makeUser("Keeps Theirs");
    await send(u.user);
    await send(other.user);
    expect(await feedbackOf(u.user.id)).toHaveLength(1);
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: fakeWorld().f });
    expect(await feedbackOf(u.user.id)).toEqual([]);
    expect(await getDb().select().from(ownerInbox).where(eq(ownerInbox.senderEmail, u.user.email))).toEqual([]);
    expect(await feedbackOf(other.user.id)).toHaveLength(1);
  });

  it("the owner's deletion", async () => {
    const owner = await makeUser("Owner");
    await getDb().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.user.id));
    const saved = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = [saved, owner.user.email].filter(Boolean).join(",");
    try {
      const admin = (await adminFor(getDb(), owner.user.id, { ADMIN_EMAILS: owner.user.email }))!;
      const u = await setup();
      await send(u.user);
      await deleteUser(getDb(), admin, u.user.id, u.user.email, { fetch: fakeWorld().f });
      expect(await getDb().select().from(ownerInbox).where(eq(ownerInbox.senderEmail, u.user.email))).toEqual([]);
    } finally {
      process.env.ADMIN_EMAILS = saved;
    }
  });
});

describe("deleting an account takes the plain email out of the owner's action log", () => {
  const rowsFor = (id: string) => getDb().select().from(adminActions).where(eq(adminActions.targetUserId, id));

  it("the owner's deletion keeps every row, with the email replaced by its keyed fingerprint, deletion row included", async () => {
    const owner = await makeUser("Owner");
    await getDb().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.user.id));
    const saved = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = [saved, owner.user.email].filter(Boolean).join(",");
    try {
      const admin = (await adminFor(getDb(), owner.user.id, { ADMIN_EMAILS: owner.user.email }))!;
      const u = await setup();
      await getDb()
        .insert(adminActions)
        .values({ actorUserId: admin.id, actorEmail: admin.email, action: "waitlist.accept", targetUserId: u.user.id, targetEmail: u.user.email });
      await deleteUser(getDb(), admin, u.user.id, u.user.email, { fetch: fakeWorld().f });
      const rows = await rowsFor(u.user.id);
      expect(rows.map((r) => r.action).sort()).toEqual(["user.delete", "waitlist.accept"]);
      expect(rows.every((r) => r.targetEmail === emailHash(u.user.email))).toBe(true);
      expect(await getDb().select().from(adminActions).where(eq(adminActions.targetEmail, u.user.email))).toEqual([]);
    } finally {
      process.env.ADMIN_EMAILS = saved;
    }
  });

  it("the person's own deletion does the same for earlier actions about them", async () => {
    const u = await setup();
    await getDb()
      .insert(adminActions)
      .values({ actorEmail: "owner@example.com", action: "waitlist.accept", targetUserId: u.user.id, targetEmail: u.user.email });
    await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: fakeWorld().f });
    const rows = await rowsFor(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].targetEmail).toBe(emailHash(u.user.email));
  });
});

describe("closing a link the provider already forgot", () => {
  const answer = (status: number, body: unknown) => (async () => Response.json(body, { status })) as unknown as typeof fetch;

  it("counts as closed at Plaid (ITEM_NOT_FOUND, INVALID_ACCESS_TOKEN), so a retry never sticks; a real failure still throws", async () => {
    const { removeAtPlaid } = await import("@/server/integrations/plaid");
    const creds = encryptSecret(JSON.stringify({ accessToken: "tok-gone", cursor: null }));
    await expect(removeAtPlaid(creds, answer(400, { error_code: "ITEM_NOT_FOUND", error_message: "gone" }))).resolves.toBeUndefined();
    await expect(removeAtPlaid(creds, answer(400, { error_code: "INVALID_ACCESS_TOKEN" }))).resolves.toBeUndefined();
    await expect(removeAtPlaid(creds, answer(500, { error_code: "INTERNAL_SERVER_ERROR" }))).rejects.toThrow();
  });

  it("counts as revoked at Google (400 invalid_token); any other refusal still throws", async () => {
    const { revokeGoogleGrant } = await import("@/server/integrations/google");
    const creds = encryptSecret(JSON.stringify({ refreshToken: "r-gone", accessToken: "a", expiresAt: 0 }));
    await expect(revokeGoogleGrant(creds, answer(400, { error: "invalid_token" }))).resolves.toBeUndefined();
    await expect(revokeGoogleGrant(creds, answer(500, {}))).rejects.toThrow();
  });
});

describe("Delete my account on the under-13 lock screen", () => {
  it("deletes a locked account after the typed DELETE and the password; refuses an unlocked one and a wrong word", async () => {
    const { deleteLockedAccount } = await import("@/server/services/accounts");
    const locked = await setup();
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "pending", ageBlockedAt: new Date().toISOString() } })
      .where(eq(users.id, locked.user.id));
    await expect(deleteLockedAccount(getDb(), locked.user.id, "delete me", PASSWORD)).rejects.toThrow("Type DELETE to confirm.");
    await expect(deleteLockedAccount(getDb(), locked.user.id, " DELETE ", "wrong password")).rejects.toThrow("Password is incorrect.");
    expect(await gone(locked.user.id)).toBe(false);
    await deleteLockedAccount(getDb(), locked.user.id, " DELETE ", PASSWORD);
    expect(await gone(locked.user.id)).toBe(true);

    const normal = await setup();
    await expect(deleteLockedAccount(getDb(), normal.user.id, "DELETE", PASSWORD)).rejects.toThrow("This account isn't locked.");
    expect(await gone(normal.user.id)).toBe(false);
  });
});
