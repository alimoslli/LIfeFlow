import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents, inboxItems, transactions } from "@/server/db/schema";
import { saveGoogleConnection } from "@/server/integrations/google";
import { processDocument } from "@/server/services/inbox";
import { DAILY_LOOK, FIRST_LOOK, GAVE_UP, WAIT_TRIES, emailFilingOn, fileFromGmail } from "@/server/services/inbox/gmail";
import { READ_FAILED } from "@/server/services/inbox";
import { NOT_READ_YET, PlainReason } from "@/server/services/inbox/extract";
import type { Extraction } from "@/server/services/inbox/extract";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createAssignment, createCourse } from "@/server/services/school";
import { dayClockData } from "@/server/services/day-clock";
import { collectSnapshot } from "@/server/briefing/collect";
import { skyInsights } from "@/server/services/sky-insights";
import { makeUser, TZ } from "../helpers";

// Owner via the COO, 2026-11-12: "Even the Gmail, I don't even notice that it's connected because there's nothing on that."
// Filing is on with the connection, the first look reaches back two weeks, and what it finds lands on the sky, marked as from
// email, with Undo. Nothing here calls Gmail or a model: fetch and the extraction are fakes.

afterAll(closeDb);
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
  process.env.OPENAI_API_KEY ||= "test";
});

const SCOPE = "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const PASSED = "mx.google.com; dkim=pass header.i=@ups.com header.d=ups.com; spf=pass smtp.mailfrom=track@ups.com; dmarc=pass header.from=ups.com";
const NOW = localToInstant("2026-11-17", "08:00", TZ);
const base: Extraction = { type: "other", summary: "x", bill: null, receipt: null, school: null, travel: null, pay: null };

/** A Gmail stand-in with one message per id; every URL asked for is kept. */
function fakeGmail(ids: string[], fail: Record<string, number> = {}) {
  const asked: string[] = [];
  const f = (async (u: string | URL) => {
    const url = String(u);
    asked.push(url);
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("oauth2")) return json({ access_token: "at", expires_in: 3600 });
    if (url.includes("/messages?")) return json({ messages: ids.map((id) => ({ id })) });
    const id = url.match(/messages\/([^?]+)/)?.[1] ?? "x";
    // the full read fails for these (the search's metadata look still works)
    if (fail[id] && url.includes("format=full")) return json({ error: { status: "FAIL", message: "no" } }, fail[id]);
    return json({
      id,
      threadId: "t",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Authentication-Results", value: PASSED },
          { name: "From", value: "UPS <track@ups.com>" },
          { name: "Subject", value: "Your package is on its way" },
        ],
        body: { data: b64("Your desk lamp arrives Thursday, November 19.") },
      },
    });
  }) as typeof fetch;
  return { f, asked };
}

const connect = (run: Awaited<ReturnType<typeof makeUser>>["run"]) =>
  run((s) => saveGoogleConnection(s, { refreshToken: "rt", accessToken: "at", expiresAt: Date.now() + 3_600_000, scope: SCOPE }, "a@b.c"));

describe("Gmail is on with the connection", () => {
  it("needs no second switch, and stays off once turned off", () => {
    expect(emailFilingOn(undefined, "gmail")).toBe(true);
    expect(emailFilingOn({}, "gmail")).toBe(true);
    expect(emailFilingOn({ gmailFiling: false }, "gmail")).toBe(false);
  });

  it("looks back 30 days for up to 50 emails the first time, then only at new mail", async () => {
    // owner via the COO, 2026-11-12: "do more than 25", then 50, keeping the 30 days back
    expect(FIRST_LOOK).toEqual({ days: 30, max: 50 });
    const { run } = await makeUser("First Look");
    await connect(run);
    const extract = (async () => base) as never;
    const first = fakeGmail(["18c2a1b0f3d4e5a1"]);
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: first.f, extract }));
    const list = (asked: string[]) => new URL(asked.find((u) => u.includes("/messages?"))!).searchParams;
    expect(list(first.asked).get("q")).toContain(`newer_than:${FIRST_LOOK.days}d`);
    expect(list(first.asked).get("maxResults")).toBe(String(FIRST_LOOK.max));
    const later = fakeGmail(["18c2a1b0f3d4e5a2"]);
    await run((s) => fileFromGmail(s, TZ, "2026-11-18", { fetch: later.f, extract }));
    expect(list(later.asked).get("q")).toContain(`newer_than:${DAILY_LOOK.days}d`);
    expect(list(later.asked).get("maxResults")).toBe(String(DAILY_LOOK.max));
    // receipts, deliveries and bookings are asked for too
    expect(list(later.asked).get("q")).toMatch(/receipt.*delivery.*reservation/);
  });

  it("an email the monthly limit refused is kept and read again on the next run, never dropped", async () => {
    const { user, run } = await makeUser("Refused Read");
    await connect(run);
    const id = "18c2a1b0f3d4e5b7";
    const refused = (async () => {
      throw new PlainReason(`${NOT_READ_YET} yet: this month's skyling allowance is used up. It opens up again on December 1.`);
    }) as never;
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: fakeGmail([id]).f, extract: refused }));
    const rows = () =>
      run((s) =>
        s.tx
          .select({ status: inboxItems.status, reason: inboxItems.reason })
          .from(inboxItems)
          .where(and(eq(inboxItems.userId, user.id), eq(inboxItems.externalId, `gmail:${id}`))),
      );
    // kept, with the plain reason, so it shows in the inbox and isn't lost
    expect(await rows()).toEqual([{ status: "failed", reason: expect.stringContaining(NOT_READ_YET) }]);
    // the next run's search no longer finds it (it's older than two days), and it is still read
    const extract = (async () => ({
      ...base,
      type: "delivery",
      summary: "Desk lamp",
      delivery: { item: "Desk lamp", carrier: "UPS", expected_date: "2026-11-19" },
    })) as never;
    const r = await run((s) => fileFromGmail(s, TZ, "2026-11-18", { fetch: fakeGmail([]).f, extract }));
    expect(r).toMatchObject({ checked: 1, filed: 1 });
    expect(await rows()).toEqual([{ status: "filed", reason: null }]);
  });

  // COO review, 2026-11-12: a Google error halfway through used to lose the waiting emails after it
  it("a Google error halfway through keeps every waiting email; only one deleted from Gmail stops waiting, with why", async () => {
    const { user, run } = await makeUser("Halfway Error");
    await connect(run);
    const [busy, gone, fine, fresh] = ["18c2a1b0f3d4e5c1", "18c2a1b0f3d4e5c2", "18c2a1b0f3d4e5c3", "18c2a1b0f3d4e5c4"];
    const refused = (async () => {
      throw new PlainReason(`${NOT_READ_YET} yet: this month's skyling allowance is used up. It opens up again on December 1.`);
    }) as never;
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: fakeGmail([busy, gone, fine]).f, extract: refused }));
    const rows = () =>
      run(async (s) =>
        Object.fromEntries(
          (
            await s.tx
              .select({ id: inboxItems.externalId, status: inboxItems.status, reason: inboxItems.reason })
              .from(inboxItems)
              .where(eq(inboxItems.userId, user.id))
          ).map((r) => [r.id!.slice(6), `${r.status}: ${r.reason ?? ""}`]),
        ),
      );
    expect(Object.keys(await rows()).sort()).toEqual([busy, gone, fine].sort());
    const extract = (async () => ({
      ...base,
      type: "delivery",
      summary: "Desk lamp",
      delivery: { item: "Desk lamp", carrier: "UPS", expected_date: "2026-11-19" },
    })) as never;
    // Google is busy for one, the next was deleted, a new one can't be read either; the rest still go through
    const r = await run((s) => fileFromGmail(s, TZ, "2026-11-18", { fetch: fakeGmail([fresh], { [busy]: 429, [gone]: 404, [fresh]: 500 }).f, extract }));
    expect(r).toMatchObject({ checked: 1, filed: 1 });
    const after = await rows();
    expect(after[busy]).toMatch(new RegExp(`^failed: ${NOT_READ_YET}`));
    expect(after[gone]).toBe("failed: It isn't in Gmail anymore, so it wasn't read.");
    expect(after[fine]).toBe("filed: ");
    expect(after[fresh]).toMatch(new RegExp(`^failed: ${NOT_READ_YET}`));
    // and the next look reads what waited
    const last = await run((s) => fileFromGmail(s, TZ, "2026-11-19", { fetch: fakeGmail([]).f, extract }));
    expect(last).toMatchObject({ checked: 2, filed: 2 });
    expect((await rows())[gone]).toBe("failed: It isn't in Gmail anymore, so it wasn't read.");
  });

  // COO re-review, 2026-11-12: a 403 that never clears used to wait forever and could fill every look
  it("an email Gmail keeps refusing stops waiting after a few tries, with a fixed reason", async () => {
    const { user, run } = await makeUser("Never Hands Over");
    await connect(run);
    const stuck = "18c2a1b0f3d4e5d1";
    const extract = (async () => base) as never;
    const reason = () =>
      run(
        async (s) =>
          (
            await s.tx
              .select({ reason: inboxItems.reason })
              .from(inboxItems)
              .where(eq(inboxItems.externalId, `gmail:${stuck}`))
          )[0]?.reason,
      );
    // each look that's refused is one try; the last one gives up
    for (let day = 0; day < WAIT_TRIES - 1; day++) {
      await run((s) => fileFromGmail(s, TZ, `2026-11-${17 + day}`, { fetch: fakeGmail(day ? [] : [stuck], { [stuck]: 403 }).f, extract }));
      expect(await reason()).toMatch(new RegExp(`^${NOT_READ_YET}`));
    }
    await run((s) => fileFromGmail(s, TZ, `2026-11-${17 + WAIT_TRIES}`, { fetch: fakeGmail([], { [stuck]: 403 }).f, extract }));
    expect(await reason()).toBe(GAVE_UP);
    // and it isn't asked for again
    const later = fakeGmail([], { [stuck]: 403 });
    await run((s) => fileFromGmail(s, TZ, "2026-11-24", { fetch: later.f, extract }));
    expect(later.asked.some((u) => u.includes(stuck))).toBe(false);
    expect(await reason()).toBe(GAVE_UP);
    void user;
  });

  it("one look reads at most its limit, waiting ones first and oldest first; the rest wait, none dropped", async () => {
    const { run } = await makeUser("Full Look");
    await connect(run);
    const id = (n: number) => `18c2a1b0f3d4${String(n).padStart(4, "0")}`;
    const refused = (async () => {
      throw new PlainReason(`${NOT_READ_YET} yet: this month's skyling allowance is used up. It opens up again on December 1.`);
    }) as never;
    // the first look: 50 found, all refused by the monthly limit, so 50 wait
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: fakeGmail(Array.from({ length: FIRST_LOOK.max }, (_, i) => id(i))).f, extract: refused }));
    // the next look finds 10 new ones too: it reads 10 (its limit), the waiting ones first, and the new ones wait
    const next = fakeGmail(Array.from({ length: DAILY_LOOK.max }, (_, i) => id(100 + i)));
    const r = await run((s) => fileFromGmail(s, TZ, "2026-11-18", { fetch: next.f, extract: (async () => base) as never }));
    expect(r.checked).toBe(DAILY_LOOK.max);
    const read = next.asked.filter((u) => u.includes("format=full")).map((u) => u.match(/messages\/([^?]+)/)![1]);
    // the ones that waited go first (saved together, so in no set order among themselves), never a new one
    expect(read).toHaveLength(DAILY_LOOK.max);
    expect(read.every((r) => Number(r.slice(-4)) < 100)).toBe(true);
    const waiting = await run((s) =>
      s.tx
        .select({ id: inboxItems.externalId })
        .from(inboxItems)
        .where(and(eq(inboxItems.status, "failed"), eq(inboxItems.userId, s.userId))),
    );
    expect(waiting.map((w) => w.id)).toEqual(expect.arrayContaining(Array.from({ length: DAILY_LOOK.max }, (_, i) => `gmail:${id(100 + i)}`)));
    expect(waiting).toHaveLength(FIRST_LOOK.max - DAILY_LOOK.max + DAILY_LOOK.max);
  });

  it("a read that fails with the provider's own words keeps fixed words instead", async () => {
    const { user, run } = await makeUser("Raw Error");
    await connect(run);
    const id = "18c2a1b0f3d4e5e1";
    const raw = (async () => {
      throw new Error("400 Invalid 'input[0].content': sk-proj-abc123 request_id=req_9f8e");
    }) as never;
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: fakeGmail([id]).f, extract: raw }));
    const [row] = await run((s) => s.tx.select({ reason: inboxItems.reason }).from(inboxItems).where(eq(inboxItems.userId, user.id)));
    expect(row.reason).toBe(READ_FAILED);
  });
});

describe("what it finds lands on the sky, from your email", () => {
  it("a delivery is on its day, marked from email, and Undo-able", async () => {
    const { user, run } = await makeUser("Package Day");
    await connect(run);
    const extract = (async () => ({
      ...base,
      type: "delivery",
      summary: "A desk lamp arrives Thursday.",
      delivery: { item: "desk lamp", carrier: "UPS", expected_date: "2026-11-19" },
    })) as never;
    const { f } = fakeGmail(["18c2a1b0f3d4e5b1"]);
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: f, extract }));
    const [ev] = await run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.userId, user.id)));
    expect(ev).toMatchObject({ title: "Package: desk lamp", allDay: true, source: "email", description: "By UPS" });
    const [row] = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.userId, user.id)));
    expect(row).toMatchObject({ status: "filed", externalId: "gmail:18c2a1b0f3d4e5b1" });
    expect(row.filed[0]).toMatchObject({ kind: "event", id: ev.id, label: "Package: desk lamp, expected Thu, Nov 19" });
    const clock = await run((s) => dayClockData(s, TZ, NOW));
    expect(clock.items.find((i) => i.title === "Package: desk lamp")?.source).toBe("From your email");
    // and the sky says what it found
    const sky = await run(async (s) => skyInsights(s, await collectSnapshot(s, user, new Date()), { moneyLocked: false }));
    expect(sky.find((i) => i.kind === "from_email")).toMatchObject({
      headline: "Package: desk lamp, expected Thu, Nov 19 (from your email)",
      weather: "clear",
    });
  });

  it("an exam from email is marked from email; one added by hand stays from your classes", async () => {
    const { user, run } = await makeUser("Exam Mail");
    await run(async (s) => {
      const c = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Quiz 3", kind: "quiz", dueDate: "2026-11-18", dueTime: "09:00" });
      const extract = (async () => ({
        ...base,
        type: "exam",
        summary: "Exam 2 is on Nov 20.",
        school: { course: "BIO 101", title: "Exam 2", due_date: "2026-11-20", due_time: "10:00", old_due_date: null, moved: false },
      })) as never;
      await processDocument(
        s,
        TZ,
        "2026-11-17",
        { channel: "email", from: "prof@university.edu", subject: "Exam 2", text: "Exam 2 is on Nov 20.", files: [], authenticated: true },
        extract,
      );
    });
    const clock = await run((s) => dayClockData(s, TZ, NOW));
    expect(clock.items.find((i) => i.title === "Exam 2")?.source).toBe("From your email");
    expect(clock.items.find((i) => i.title === "Quiz 3")?.source).toBe("From your classes");
    void user;
  });

  it("a receipt paid another way sits on the line at its printed time; never a time it doesn't print", async () => {
    const { user, run } = await makeUser("Receipt Time");
    await run(async (s) => {
      await createManualAccount(s, { name: "Cash", type: "depository", subtype: "cash", currentBalanceCents: 5000 });
      for (const [merchant, total, time] of [
        ["Corner Deli", 9.5, "12:41"],
        ["Farmers market", 14, null],
      ] as const) {
        const extract = (async () => ({
          ...base,
          type: "receipt",
          summary: "x",
          receipt: { merchant, total_usd: total, date: "2026-11-16", time, payment_last4: null },
        })) as never;
        await processDocument(s, TZ, "2026-11-17", { channel: "upload", from: null, subject: merchant, text: "receipt", files: [] }, extract);
      }
    });
    const rows = await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)));
    expect(Object.fromEntries(rows.map((t) => [t.merchantName, t.authorizedAt?.toISOString() ?? null]))).toEqual({
      "Corner Deli": localToInstant("2026-11-16", "12:41", TZ).toISOString(),
      "Farmers market": null,
    });
  });

  it("a bill from email is left out of the sky while the Money lock is on", async () => {
    const { user, run } = await makeUser("Bill Mail");
    await connect(run);
    const extract = (async () => ({
      ...base,
      type: "bill",
      summary: "Verizon bill.",
      bill: { payee: "Verizon", amount_usd: 85, due_date: "2026-11-21", repeats: "monthly", account_ref: null },
    })) as never;
    const { f } = fakeGmail(["18c2a1b0f3d4e5c1"]);
    await run((s) => fileFromGmail(s, TZ, "2026-11-17", { fetch: f, extract }));
    const sky = (locked: boolean) => run(async (s) => skyInsights(s, await collectSnapshot(s, user, new Date()), { moneyLocked: locked }));
    expect((await sky(false)).find((i) => i.kind === "from_email")).toMatchObject({ money: true });
    expect((await sky(true)).some((i) => i.kind === "from_email")).toBe(false);
  });
});
