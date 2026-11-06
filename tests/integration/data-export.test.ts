import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { attachments, inboxSenders, integrations, syncJobs, transactions, users } from "@/server/db/schema";
import { encryptSecret } from "@/server/crypto";
import { createSession, setMoneyUnlockedAt, type SessionUser } from "@/server/auth/sessions";
import { exportStream } from "@/server/services/data-export";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createHabit, checkHabit } from "@/server/services/habits";
import { createMemory } from "@/server/services/memory";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
import { makeUser } from "../helpers";

// The route reads the signed-in user and the session cookie; everything else (database, money lock, streaming) is real.
const h = vi.hoisted(() => ({ user: null as SessionUser | null, token: "" }));
vi.mock("@/server/auth/current-user", () => ({ getSessionUser: async () => h.user }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (h.token ? { name, value: h.token } : undefined) }) }));
const { GET } = await import("@/app/api/export/route");

afterAll(closeDb);
beforeEach(() => {
  h.user = null;
  h.token = "";
});

const readAll = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();
const profileOf = (u: { name: string; email: string; timezone: string }) => ({ name: u.name, email: u.email, timezone: u.timezone });

async function signIn(name: string, prefs: SessionUser["preferences"] = {}) {
  const u = await makeUser(name);
  await getDb().update(users).set({ preferences: prefs }).where(eq(users.id, u.user.id));
  const { token } = await createSession(getDb(), u.user.id);
  h.user = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: u.user.timezone, accountKind: "standard", preferences: prefs };
  h.token = token;
  return { ...u, token };
}

describe("Download my data", () => {
  it("holds milestones, goals, habits and memories (decrypted), and no secrets, hashes or other people's rows", async () => {
    const a = await makeUser("Ana Export");
    const b = await makeUser("Ben Other");
    await a.run(async (s) => {
      await createMilestone(s, { title: "First job", category: "work", when: "2023" });
      await createPersonalGoal(s, { title: "Read 12 books", target: 12, unit: "books" });
      const habit = await createHabit(s, { title: "Study 25 minutes a day", kind: "study", cadence: "daily", target: 25 });
      await checkHabit(s, habit.id, "2026-11-04");
      await createMemory(s, { content: "Works at the campus library on Tuesdays", category: "routine" }, "user");
      await s.tx
        .insert(integrations)
        .values({ userId: s.userId, provider: "canvas", status: "connected", encryptedCredentials: encryptSecret('{"token":"canvas-secret-xyz"}') });
      await s.tx.insert(inboxSenders).values({ userId: s.userId, email: "ana@school.edu", codeHash: "deadbeefhash" });
      await s.tx
        .insert(attachments)
        .values({ userId: s.userId, filename: "schedule.png", mimeType: "image/png", sizeBytes: 3, sha256: "abc123sha", dataBase64: "QUJD" });
    });
    await b.run((s) => createMilestone(s, { title: "Ben's secret milestone" }));

    const json = await readAll(exportStream(a.user.id, { ...profileOf(a.user), preferences: { sms: { codeHash: "smscodehash", money: true } } }));
    const data = JSON.parse(json) as Record<string, unknown>;

    expect((data.milestones as { title: string }[]).map((m) => m.title)).toEqual(["First job"]);
    expect((data.personalGoals as { title: string }[])[0].title).toBe("Read 12 books");
    expect(data.habits as unknown[]).toHaveLength(1);
    expect(data.habitChecks as unknown[]).toHaveLength(1);
    expect((data.memories as { content: string }[])[0].content).toBe("Works at the campus library on Tuesdays");
    expect((data.attachments as { filename: string }[])[0].filename).toBe("schedule.png");
    expect((data.inboxSenders as { email: string }[])[0].email).toBe("ana@school.edu");
    expect(data.activity).toBeDefined();

    for (const secret of ["canvas-secret-xyz", "encryptedCredentials", "deadbeefhash", "codeHash", "smscodehash", "abc123sha", "QUJD", "dataBase64"]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(json).not.toContain("Ben's secret milestone");
    expect((data.profile as { preferences: { sms: { money: boolean } } }).preferences.sms.money).toBe(true);
  });

  it("streams a large account in batches, never as one string: valid JSON, no indentation, no sync log", async () => {
    const { run, user } = await signIn("Lars Large");
    const TOTAL = 20_000;
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100_000 });
      const pad = "Coffee and a long merchant description from the bank feed ".repeat(4);
      for (let i = 0; i < TOTAL; i += 2000) {
        await s.tx.insert(transactions).values(
          Array.from({ length: 2000 }, (_, j) => ({
            userId: s.userId,
            accountId: acct.id,
            date: `20${20 + ((i + j) % 6)}-0${1 + ((i + j) % 9)}-1${(i + j) % 9}`,
            description: `${pad}#${i + j}`,
            amountCents: -(100 + ((i + j) % 5000)),
            kind: "expense" as const,
          })),
        );
      }
      // A year of the background sync log, every 30 minutes: never exported.
      await s.tx.insert(syncJobs).values(
        Array.from({ length: 2000 }, () => ({
          userId: s.userId,
          kind: "plaid.sync",
          status: "failed" as const,
          error: "Check PLAID_CLIENT_ID, PLAID_SECRET",
        })),
      );
    });

    const res = await GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("lifeflow-export-");
    expect(res.headers.get("content-length")).toBeNull();
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    let chunks = 0;
    let biggest = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks++;
      biggest = Math.max(biggest, value.byteLength);
      text += dec.decode(value, { stream: true });
    }
    // Far over Vercel's 4.5 MB limit for a response built in one piece, yet it arrives in small batches.
    expect(Buffer.byteLength(text)).toBeGreaterThan(4.5 * 1024 * 1024);
    expect(chunks).toBeGreaterThan(TOTAL / 1000);
    expect(biggest).toBeLessThan(1024 * 1024);
    expect(text).not.toMatch(/\n\s/);
    const data = JSON.parse(text) as Record<string, unknown[]>;
    expect(data.transactions).toHaveLength(TOTAL);
    expect(new Set((data.transactions as { id: string }[]).map((t) => t.id)).size).toBe(TOTAL);
    expect(data.syncJobs).toBeUndefined();
    expect(text).not.toContain("PLAID_");
    expect((data.profile as unknown as { email: string }).email).toBe(user.email);
  }, 120_000);

  it("refuses both formats while Money is locked, with a plain message, and works once Money is unlocked", async () => {
    const { token } = await signIn("Maya Locked", { moneyLock: { enabled: true, idleMinutes: 5 } });
    for (const url of ["http://localhost/api/export", "http://localhost/api/export?format=transactions.csv"]) {
      const res = await GET(new Request(url));
      expect(res.status, url).toBe(403);
      expect(res.headers.get("content-disposition")).toBeNull();
      expect(await res.text()).toBe("Unlock Money first, then download your data again.");
    }
    await setMoneyUnlockedAt(getDb(), token, new Date());
    const json = await GET(new Request("http://localhost/api/export"));
    expect(json.status).toBe(200);
    expect(JSON.parse(await json.text()).profile.name).toBe("Maya Locked");
    const csv = await GET(new Request("http://localhost/api/export?format=transactions.csv"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("lifeflow-transactions-");
    expect((await csv.text()).split("\n")[0]).toBe("date,description,merchant,amount,kind,category,account,pending,source");
  });

  it("works as before when the Money lock is off, and refuses anyone signed out", async () => {
    expect((await GET(new Request("http://localhost/api/export"))).status).toBe(401);
    await signIn("Omar Open");
    const res = await GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text()).profile.name).toBe("Omar Open");
  });
});
