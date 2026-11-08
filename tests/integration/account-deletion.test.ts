import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports, integrations, users } from "@/server/db/schema";
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
