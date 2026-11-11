import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { closeDb, getDb } from "@/server/db/client";
import { attachments, inboxSenders, integrations, syncJobs, transactions, users } from "@/server/db/schema";
import { encryptSecret } from "@/server/crypto";
import { createSession, setMoneyUnlockedAt, type SessionUser } from "@/server/auth/sessions";
import { exportBusy, exportChunks, exportStream, openSnapshot } from "@/server/services/data-export";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createHabit, checkHabit } from "@/server/services/habits";
import { createMemory } from "@/server/services/memory";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
import { makeUser } from "../helpers";

// The route reads the signed-in user and the session cookie; everything else (database, money lock, streaming) is real.
const h = vi.hoisted(() => ({ user: null as SessionUser | null, token: "" }));
vi.mock("@/server/auth/current-user", () => ({ getSessionUser: async () => h.user, getAccountUser: async () => h.user }));
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

  it("streams the transactions CSV in full: all 5,001 rows arrive, same columns, newest first", async () => {
    const { run } = await signIn("Cora Csv");
    const TOTAL = 5001;
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 });
      await s.tx.insert(transactions).values(
        Array.from({ length: TOTAL }, (_, i) => ({
          userId: s.userId,
          accountId: acct.id,
          date: `2026-0${1 + (i % 9)}-1${i % 9}`,
          description: `Row ${i}`,
          amountCents: -(100 + i),
          kind: "expense" as const,
        })),
      );
    });
    const res = await GET(new Request("http://localhost/api/export?format=transactions.csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("lifeflow-transactions-");
    const lines = (await res.text()).split("\n");
    expect(lines[0]).toBe("date,description,merchant,amount,kind,category,account,pending,source");
    expect(lines).toHaveLength(TOTAL + 1);
    expect(new Set(lines.slice(1).map((l) => l.split(",")[1])).size).toBe(TOTAL);
    const dates = lines.slice(1).map((l) => l.split(",")[0]);
    expect(dates).toEqual([...dates].sort().reverse());
  }, 60_000);

  it("pages the CSV by (date, created, id): 4,500 rows sharing one date and one insert time arrive once each, none missing", async () => {
    const { run } = await signIn("Dale Ties");
    const TOTAL = 4500;
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 });
      // One statement: every row gets the same created_at too.
      await s.tx.insert(transactions).values(
        Array.from({ length: TOTAL }, (_, i) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-05-05",
          description: `Tie ${i}`,
          amountCents: -100,
          kind: "expense" as const,
        })),
      );
    });
    const res = await GET(new Request("http://localhost/api/export?format=transactions.csv"));
    const lines = (await res.text()).split("\n").slice(1);
    expect(lines).toHaveLength(TOTAL);
    expect(new Set(lines.map((l) => l.split(",")[1]))).toEqual(new Set(Array.from({ length: TOTAL }, (_, i) => `Tie ${i}`)));
  }, 60_000);

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

  it("reads one snapshot: a bank sync during a long download neither drops a re-posted transaction nor adds one without its account (R5)", async () => {
    const { run, user } = await makeUser("Rita Snapshot");
    const TOTAL = 1_200;
    const ids = await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100_000 });
      const rows = await s.tx
        .insert(transactions)
        .values(
          Array.from({ length: TOTAL }, (_, i) => ({
            userId: s.userId,
            accountId: acct.id,
            date: "2026-10-01",
            description: `COFFEE #${i}`,
            amountCents: -(100 + i),
            kind: "expense" as const,
          })),
        )
        .returning({ id: transactions.id });
      return rows.map((r) => r.id).sort();
    });
    const lastId = ids[ids.length - 1];
    const REPOSTED = "00000000-0000-4000-8000-000000000001"; // sorts before every batch already read
    const LATE = "ffffffff-ffff-4fff-bfff-ffffffffffff"; // sorts after every batch

    let text = "";
    let synced = false;
    for await (const chunk of exportChunks(user.id, profileOf(user), 100)) {
      text += chunk;
      // Part of the transactions are in the file: the bank re-posts the last one under a new id, and adds a new account with a transaction.
      if (!synced && text.includes(`"transactions":[{`)) {
        synced = true;
        await run(async (s) => {
          const [old] = await s.tx.delete(transactions).where(eq(transactions.id, lastId)).returning();
          await s.tx.insert(transactions).values({ ...old, id: REPOSTED });
          const card = await createManualAccount(s, { name: "New card", type: "credit", subtype: "credit card", currentBalanceCents: 0 });
          await s.tx
            .insert(transactions)
            .values({ id: LATE, userId: s.userId, accountId: card.id, date: "2026-10-02", description: "LATE", amountCents: -500, kind: "expense" });
        });
      }
    }
    expect(synced).toBe(true);
    const data = JSON.parse(text) as { accounts: { id: string }[]; transactions: { id: string; accountId: string }[] };
    // Everything as it was when the download started: nothing missing, nothing added.
    expect(data.transactions.map((t) => t.id).sort()).toEqual(ids);
    expect(data.accounts).toHaveLength(1);
    const accounts = new Set(data.accounts.map((a) => a.id));
    expect(data.transactions.every((t) => accounts.has(t.accountId))).toBe(true);

    // The next download has the sync.
    const after = JSON.parse(await readAll(exportStream(user.id, profileOf(user)))) as typeof data;
    expect(after.transactions.map((t) => t.id)).toEqual(expect.arrayContaining([REPOSTED, LATE]));
    expect(after.transactions.map((t) => t.id)).not.toContain(lastId);
    expect(after.accounts).toHaveLength(2);
  });

  it("lets its database connection go when the download is cancelled or stops being read (R5)", async () => {
    const { run, user } = await makeUser("Cal Cancel");
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100_000 });
      await s.tx.insert(transactions).values(
        Array.from({ length: 300 }, (_, i) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-10-01",
          description: `T${i}`,
          amountCents: -100,
          kind: "expense" as const,
        })),
      );
    });
    const pool = (globalThis as unknown as { __bfPool: Pool }).__bfPool;
    const inUse = () => pool.totalCount - pool.idleCount;
    const readUntilRows = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const dec = new TextDecoder();
      let text = "";
      while (!text.includes(`"transactions":[{`)) text += dec.decode((await reader.read()).value);
    };

    // Cancelled mid-download (the browser closed the tab): the snapshot ends and the connection is back in the pool.
    const cancelled = exportStream(user.id, profileOf(user), 100).getReader();
    await readUntilRows(cancelled);
    expect(inUse()).toBe(1);
    await cancelled.cancel();
    expect(inUse()).toBe(0);

    // Nobody reads it any more: the connection is let go after the idle time, and the download fails rather than looking complete.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const stalled = exportStream(user.id, profileOf(user), 100, 50).getReader();
    await readUntilRows(stalled);
    await new Promise((r) => setTimeout(r, 200));
    expect(inUse()).toBe(0);
    await expect(
      (async () => {
        for (;;) if ((await stalled.read()).done) return;
      })(),
    ).rejects.toThrow();
    errors.mockRestore();
  });

  it("ends a download after its total time, reads under a statement timeout, and allows one open download per user (F2)", async () => {
    const { run, user } = await makeUser("Dee Deadline");
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100_000 });
      await s.tx.insert(transactions).values(
        Array.from({ length: 300 }, (_, i) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-10-01",
          description: `T${i}`,
          amountCents: -100,
          kind: "expense" as const,
        })),
      );
    });
    const pool = (globalThis as unknown as { __bfPool: Pool }).__bfPool;
    const inUse = () => pool.totalCount - pool.idleCount;
    const readUntilRows = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const dec = new TextDecoder();
      let text = "";
      while (!text.includes(`"transactions":[{`)) text += dec.decode((await reader.read()).value);
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // Every read runs under a 15 s statement timeout.
    const snap = openSnapshot(user.id, 60_000, 60_000);
    expect(await snap.read((s) => s.tx.execute(sql`show statement_timeout`))).toMatchObject({ rows: [{ statement_timeout: "15s" }] });
    await snap.close();

    // A slow reader that keeps reading still ends at the total deadline, and the download fails.
    const slow = exportStream(user.id, profileOf(user), 100, 60_000, 150).getReader();
    await readUntilRows(slow);
    expect(inUse()).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(inUse()).toBe(0);
    await expect(
      (async () => {
        for (;;) if ((await slow.read()).done) return;
      })(),
    ).rejects.toThrow();

    // One open download per user: a second one waits to be asked again, and the first is unharmed.
    const first = exportStream(user.id, profileOf(user), 100).getReader();
    await readUntilRows(first);
    expect(exportBusy(user.id)).toBe(true);
    await expect(exportChunks(user.id, profileOf(user)).next()).rejects.toThrow(/already/);
    await first.cancel();
    expect(exportBusy(user.id)).toBe(false);
    expect(JSON.parse(await readAll(exportStream(user.id, profileOf(user)))).transactions).toHaveLength(300);
    errors.mockRestore();
  });

  it("answers a second download for the same user with a plain 429 while one is open (F2)", async () => {
    const { user } = await signIn("Una Uno");
    const first = exportStream(user.id, profileOf(user), 100).getReader();
    await first.read();
    await first.read();
    const res = await GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(429);
    await first.cancel();
    expect((await GET(new Request("http://localhost/api/export"))).status).toBe(200);
  });

  it("works as before when the Money lock is off, and refuses anyone signed out", async () => {
    expect((await GET(new Request("http://localhost/api/export"))).status).toBe(401);
    await signIn("Omar Open");
    const res = await GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text()).profile.name).toBe("Omar Open");
  });
});
