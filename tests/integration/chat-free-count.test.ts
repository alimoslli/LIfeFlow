import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { rateLimitCount } from "@/server/rate-limit";
import { FREE_JARVIS_PER_DAY } from "@/server/billing";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => {
  Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_x", STRIPE_WEBHOOK_SECRET: "wh_x", STRIPE_PRICE_ID: "price_x", APP_URL: "http://localhost" });
  return { user: null as SessionUser | null, refuse: false, resend: false, turns: 0 };
});
vi.mock("@/server/auth/current-user", () => ({ getSessionUser: async () => h.user }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/server/auth/money-lock", () => ({ moneyLocked: async () => false }));
vi.mock("@/server/services/ai-gate", () => ({
  subjectFor: async () => ({}),
  peekAi: async () => (h.refuse ? { scope: "user" } : null),
}));
vi.mock("@/server/services/ai-limits", () => ({ refusalMessage: () => "Not today." }));
vi.mock("@/server/jarvis/turn-state", () => ({ turnStateOf: async () => ({ state: "finished", conversationId: h.resend ? "c" : null, runId: null }) }));
vi.mock("@/server/jarvis/providers", () => ({ getProvider: () => ({}), modelPrices: () => null, smallModelPrices: () => null }));
vi.mock("@/server/jarvis/agent", () => ({
  runJarvisTurn: async () => {
    h.turns++;
  },
}));
const { POST } = await import("@/app/api/jarvis/chat/route");

afterAll(closeDb);
beforeEach(() => {
  h.refuse = false;
  h.resend = false;
  h.turns = 0;
});

const send = (clientMessageId = randomUUID()) =>
  POST(
    new Request("http://localhost/api/jarvis/chat", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ message: "hi", clientMessageId }),
    }),
  );

async function freeUser() {
  const a = await makeUser();
  h.user = {
    id: a.user.id,
    email: a.user.email,
    name: a.user.name,
    timezone: a.user.timezone,
    accountKind: "standard",
    plan: "free",
    preferences: { aiConsentAt: new Date().toISOString() },
  } as unknown as SessionUser;
  return a.user.id;
}
const used = (id: string) => rateLimitCount(getDb(), `jarvis:free:${id}`, 86_400);

describe("free message count", () => {
  it("counts a message that passes the allowance check", async () => {
    const id = await freeUser();
    expect((await send()).status).toBe(200);
    expect(await used(id)).toBe(1);
  });

  it("does not count a message the allowance check refuses", async () => {
    const id = await freeUser();
    h.refuse = true;
    expect((await send()).status).toBe(429);
    expect(await used(id)).toBe(0);
  });

  it("does not count a client retry of a message already received", async () => {
    const id = await freeUser();
    h.resend = true;
    expect((await send()).status).toBe(200);
    expect(await used(id)).toBe(0);
  });

  it("stops at the free limit", async () => {
    const id = await freeUser();
    for (let i = 0; i < FREE_JARVIS_PER_DAY; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(402);
    expect(await used(id)).toBe(FREE_JARVIS_PER_DAY);
  });
});
