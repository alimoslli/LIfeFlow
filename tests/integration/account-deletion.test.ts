import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports, integrations, users } from "@/server/db/schema";
import { encryptSecret } from "@/server/crypto";
import { deleteAccount } from "@/server/services/accounts";
import { saveGoogleConnection } from "@/server/integrations/google";
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
function fakeWorld(opts: { failHosts?: string[]; subs?: { id: string; status: string }[] } = {}) {
  const calls: { url: string; method: string; body: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
    if (opts.failHosts?.some((h) => url.includes(h))) return new Response("{}", { status: 500 });
    if (url.includes("api.stripe.com/v1/subscriptions?")) return Response.json({ data: opts.subs ?? [] });
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
    const u = await setup({ plaid: ["tok-secret-9"], google: true, stripeCustomer: `cus_${crypto.randomUUID().slice(0, 8)}` });
    withStripe();
    try {
      const w = fakeWorld({ failHosts: ["plaid.com", "googleapis.com", "stripe.com"] });
      await deleteAccount(getDb(), u.user.id, PASSWORD, { fetch: w.f });
      expect(await gone(u.user.id)).toBe(true);
      const reports = (await getDb().select().from(errorReports)).filter((r) => r.route === "account.delete");
      expect(reports.map((r) => r.message)).toEqual(
        expect.arrayContaining([
          "Account deletion: Google revoke failed",
          "Account deletion: bank link removal failed",
          "Account deletion: subscription cancel failed",
        ]),
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
});
