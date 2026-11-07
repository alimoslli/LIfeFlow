import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents, gmailMessages, integrations } from "@/server/db/schema";
import { addGoogleEvent, exchangeCode, saveGoogleConnection, syncGoogleCalendar, syncGoogleEmail } from "@/server/integrations/google";
import { saveMicrosoftConnection, syncMicrosoftCalendar } from "@/server/integrations/microsoft";
import { connectCanvasFeed, syncCanvas } from "@/server/integrations/canvas";
import { makeToolContext, runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { resolvePendingAction } from "@/server/jarvis/executor";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { getAgenda } from "@/server/services/calendar";
import { mergeCrossSource, normalizeTitle } from "@/server/services/calendar-merge";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SCOPE =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events";

/** A tiny stand-in for Google: token, a calendar list that can change, event create, Gmail list/send. */
function fakeGoogle(opts: { events?: () => object[]; delayMs?: number } = {}) {
  const calls: { url: string; method: string }[] = [];
  let created = 0;
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (opts.delayMs) await sleep(opts.delayMs);
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return json({ access_token: "at-0", refresh_token: "rt-1", expires_in: 3600, scope: SCOPE, id_token: idToken("ali@example.com") });
    if (url.includes("/calendars/primary/events?")) return json({ items: opts.events?.() ?? [] });
    if (url.endsWith("/calendars/primary/events") && method === "POST") {
      const b = JSON.parse(String(init!.body));
      return json({ ...b, id: `gnew${++created}`, htmlLink: "https://calendar.google.com/x" }); // (a stand-in: it chooses its own ids)
    }
    if (url.endsWith("/messages/send") && method === "POST") return json({ id: "sent1", threadId: "th1", labelIds: ["SENT"] });
    if (url.includes("/messages?")) return json({ messages: [{ id: "m1" }] });
    if (url.includes("/messages/m1?format=metadata"))
      return json({
        id: "m1",
        threadId: "t1",
        snippet: "hi",
        internalDate: "1793000000000",
        payload: {
          headers: [
            { name: "From", value: "a@b.edu" },
            { name: "Subject", value: "Hi" },
          ],
        },
      });
    return json({ error: { message: `unhandled ${method} ${url}` } }, 404);
  }) as typeof fetch;
  return { f, calls };
}

async function connectedUser(g = fakeGoogle()) {
  const u = await makeUser("Google User");
  const { creds, email } = await exchangeCode("code", "verifier", "https://app.test/cb", g.f);
  await u.run((s) => saveGoogleConnection(s, creds, email));
  return u;
}

const gEv = (id: string, title: string, start: string, end: string, extra: object = {}) => ({
  id,
  summary: title,
  start: { dateTime: start },
  end: { dateTime: end },
  ...extra,
});
const NOW = new Date("2026-11-06T15:00:00Z");
const rowsOf = (run: Awaited<ReturnType<typeof makeUser>>["run"], source: string) =>
  run((s) =>
    s.tx
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, s.userId), eq(calendarEvents.source, source as "google"))),
  );

describe("D1: two syncs at once keep one row per event", () => {
  it("Google: 41 events synced by two syncs at once are 41 rows, and stay 41", async () => {
    const events = Array.from({ length: 41 }, (_, i) =>
      gEv(`e${i}`, `Event ${i}`, `2026-11-${String(10 + (i % 15)).padStart(2, "0")}T15:00:00Z`, `2026-11-${String(10 + (i % 15)).padStart(2, "0")}T16:00:00Z`),
    );
    const g = fakeGoogle({ events: () => events, delayMs: 5 });
    const { run } = await connectedUser(g);
    const [a, b] = await Promise.all([run((s) => syncGoogleCalendar(s, TZ, NOW, g.f)), run((s) => syncGoogleCalendar(s, TZ, NOW, g.f))]);
    expect(a.added + b.added).toBe(41);
    expect(await rowsOf(run, "google")).toHaveLength(41);
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    expect(await rowsOf(run, "google")).toHaveLength(41);
  });

  it("Outlook: two syncs at once are one row per event", async () => {
    const u = await makeUser();
    await u.run((s) =>
      saveMicrosoftConnection(s, { refreshToken: "rt", accessToken: "at", expiresAt: Date.now() + 3_600_000, scope: "Calendars.Read" }, "m@school.edu"),
    );
    const soon = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString().replace("Z", "0000");
    const value = Array.from({ length: 12 }, (_, i) => ({
      id: `o${i}`,
      subject: `Meeting ${i}`,
      start: { dateTime: soon(24 + i) },
      end: { dateTime: soon(25 + i) },
    }));
    const f = (async () => {
      await sleep(5);
      return json({ value });
    }) as unknown as typeof fetch;
    await Promise.all([u.run((s) => syncMicrosoftCalendar(s, TZ, NOW, f)), u.run((s) => syncMicrosoftCalendar(s, TZ, NOW, f))]);
    expect(await rowsOf(u.run, "outlook")).toHaveLength(12);
  });

  it("Canvas feed: two syncs at once are one row per class event", async () => {
    const u = await makeUser();
    const FEED = "https://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics";
    const today = todayIn(TZ);
    const d = addDaysStr(today, 2).replace(/-/g, "");
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      ...[1, 2, 3].flatMap((n) => [
        "BEGIN:VEVENT",
        `UID:event-calendar-event-${n}`,
        `DTSTART:${d}T1${n}0000Z`,
        `DTEND:${d}T1${n}3000Z`,
        `SUMMARY:Review ${n} [BIO 202]`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    const f = (async (url: string) => {
      await sleep(5);
      return url === FEED ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    await u.run((s) => connectCanvasFeed(s, FEED, f));
    await Promise.all([u.run((s) => syncCanvas(s, f, TZ)), u.run((s) => syncCanvas(s, f, TZ))]);
    expect(await rowsOf(u.run, "canvas")).toHaveLength(3);
  });

  it("the migration collapses existing duplicates, keeps the fullest row and moves inbox links", async () => {
    const u = await makeUser();
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      // Everything happens in one transaction that is rolled back, so other tests never see the dropped index.
      await client.query("BEGIN");
      await client.query('DROP INDEX "events_user_source_provider_uq"');
      await client.query("SELECT set_config('app.user_id', $1, true)", [u.user.id]);
      const ins = async (source: string, pid: string | null, title: string, desc: string | null, updated: string) =>
        (
          await client.query(
            `INSERT INTO calendar_events (user_id, title, description, starts_at, ends_at, source, provider_event_id, updated_at)
             VALUES ($1, $2, $3, '2026-11-10T15:00:00Z', '2026-11-10T16:00:00Z', $4, $5, $6) RETURNING id`,
            [u.user.id, title, desc, source, pid, updated],
          )
        ).rows[0].id as string;
      // 41 events twice (the audit's scenario), the newest copy is the one with no description.
      const ids: string[] = [];
      for (let i = 0; i < 41; i++) {
        ids.push(await ins("google", `e${i}`, `Event ${i}`, "Full notes", "2026-11-01T10:00:00Z"));
        await ins("google", `e${i}`, `Event ${i}`, null, "2026-11-02T10:00:00Z");
      }
      const hand = await ins("manual", null, "Dentist", null, "2026-11-01T10:00:00Z");
      const dupOfFirst = (await client.query("SELECT id FROM calendar_events WHERE provider_event_id = 'e0' AND description IS NULL")).rows[0].id as string;
      await client.query(`INSERT INTO inbox_items (user_id, channel, filed) VALUES ($1, 'email', $2)`, [
        u.user.id,
        JSON.stringify([
          { kind: "task", id: "t1", label: "x" },
          { kind: "event", id: dupOfFirst, label: "Event 0" },
        ]),
      ]);
      const before = (await client.query("SELECT count(*)::int AS n FROM calendar_events")).rows[0].n;
      expect(before).toBe(83);

      const sqlText = readFileSync("drizzle/0038_calendar_events_unique.sql", "utf8");
      for (const stmt of sqlText.split("--> statement-breakpoint")) await client.query(stmt);
      await client.query("SELECT set_config('app.user_id', $1, true)", [u.user.id]); // the migration resets it; look again as this person

      const after = (await client.query("SELECT count(*)::int AS n FROM calendar_events")).rows[0].n;
      expect(before - after).toBe(41); // 41 extra copies removed
      expect(after).toBe(42); // 41 Google events + the hand-made one (null ids are untouched)
      const kept = (await client.query("SELECT id, description FROM calendar_events WHERE provider_event_id = 'e0'")).rows;
      expect(kept).toEqual([{ id: ids[0], description: "Full notes" }]);
      expect((await client.query("SELECT id FROM calendar_events WHERE id = $1", [hand])).rowCount).toBe(1);
      const filed = (await client.query("SELECT filed FROM inbox_items WHERE user_id = $1", [u.user.id])).rows[0].filed;
      expect(filed).toEqual([
        { kind: "task", id: "t1", label: "x" },
        { kind: "event", id: ids[0], label: "Event 0" },
      ]);
      // The index is back: a duplicate is now refused.
      await client.query("SAVEPOINT s");
      await expect(ins("google", "e0", "again", null, "2026-11-03T10:00:00Z")).rejects.toThrow(/events_user_source_provider_uq/);
      await client.query("ROLLBACK TO SAVEPOINT s");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      await pool.end();
    }
  });
});

describe("D2: an event the assistant adds while a sync runs is one row", () => {
  it("add and sync at once leave one row for Google's id", async () => {
    // The sync already sees the new event (gnew1) while the assistant's create call is still finishing.
    const g = fakeGoogle({ events: () => [gEv("gnew1", "Advisor meeting", "2026-11-12T15:00:00Z", "2026-11-12T16:00:00Z")], delayMs: 5 });
    const { run } = await connectedUser(g);
    await Promise.all([
      run((s) => syncGoogleCalendar(s, TZ, NOW, g.f)),
      run((s) => addGoogleEvent(s, TZ, { title: "Advisor meeting", date: "2026-11-12", startTime: "10:00", endTime: "11:00" }, g.f)),
    ]);
    expect(await rowsOf(run, "google")).toHaveLength(1);
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    expect(await rowsOf(run, "google")).toHaveLength(1);
  });

  it("a sync that ran first and then the assistant's save also leaves one row, keeping the synced details", async () => {
    const g = fakeGoogle({
      events: () => [gEv("gnew1", "Advisor meeting", "2026-11-12T15:00:00Z", "2026-11-12T16:00:00Z", { description: "Bring transcript" })],
    });
    const { run } = await connectedUser(g);
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    await run((s) => addGoogleEvent(s, TZ, { title: "Advisor meeting", date: "2026-11-12", startTime: "10:00", endTime: "11:00" }, g.f));
    const rows = await rowsOf(run, "google");
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Bring transcript");
  });
});

describe("D3: confirming twice runs the action once", () => {
  async function propose(user: Awaited<ReturnType<typeof makeUser>>["user"], tool: string, args: object) {
    const events: JarvisEvent[] = [];
    const session = { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" as const };
    await runJarvisTurn({
      user: session,
      text: "do it",
      emit: (e) => events.push(e),
      provider: new ScriptedProvider(({ step }) => (step === 0 ? { toolCalls: [{ name: tool, args }] } : { text: "Press Confirm." })),
    });
    const c = events.find((e) => e.type === "confirmation") as Extract<JarvisEvent, { type: "confirmation" }>;
    const conv = (events.find((e) => "conversationId" in e) as { conversationId?: string } | undefined)?.conversationId;
    return { session, actionId: c.actionId, conv };
  }

  it("a double Confirm sends one email and the second call gets the first result", async () => {
    const g = fakeGoogle({ delayMs: 40 });
    const { user } = await connectedUser(g);
    const realFetch = globalThis.fetch;
    globalThis.fetch = g.f;
    try {
      const { session, actionId } = await propose(user, "send_email", { to: "prof@uni.edu", subject: "Hi", body: "Hello" });
      const ctx = makeToolContext(session, "00000000-0000-0000-0000-000000000000");
      const [a, b] = await Promise.all([resolvePendingAction(actionId, "confirm", ctx), resolvePendingAction(actionId, "confirm", ctx)]);
      expect(a.status).toBe("executed");
      expect(b.status).toBe("executed");
      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      expect(b.result).toEqual(a.result);
      expect(g.calls.filter((c) => c.url.endsWith("/messages/send"))).toHaveLength(1);
      // A later third press (a retry) is also answered from the saved result.
      const c = await resolvePendingAction(actionId, "confirm", ctx);
      expect(c).toMatchObject({ status: "executed", replayed: true });
      expect(g.calls.filter((x) => x.url.endsWith("/messages/send"))).toHaveLength(1);
      // Cancel after the fact doesn't undo or re-run it either.
      expect(await resolvePendingAction(actionId, "cancel", ctx)).toMatchObject({ status: "executed", replayed: true });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("a double Confirm adds the Google event once", async () => {
    const g = fakeGoogle({ delayMs: 40 });
    const u = await connectedUser(g);
    const realFetch = globalThis.fetch;
    globalThis.fetch = g.f;
    try {
      const { session, actionId } = await propose(u.user, "add_google_calendar_event", {
        title: "Study group",
        date: "2026-11-20",
        startTime: "14:00",
        endTime: "15:00",
      });
      const ctx = makeToolContext(session, "00000000-0000-0000-0000-000000000000");
      await Promise.all([resolvePendingAction(actionId, "confirm", ctx), resolvePendingAction(actionId, "confirm", ctx)]);
      expect(g.calls.filter((c) => c.method === "POST" && c.url.endsWith("/calendars/primary/events"))).toHaveLength(1);
      expect(await rowsOf(u.run, "google")).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("D4/D5: the same event from different places shows once", () => {
  const seed = (
    run: Awaited<ReturnType<typeof makeUser>>["run"],
    rows: { source: string; title: string; start: string; end?: string; description?: string; location?: string; pid?: string; courseId?: string }[],
  ) =>
    run((s) =>
      s.tx.insert(calendarEvents).values(
        rows.map((r, i) => ({
          userId: s.userId,
          source: r.source as "google",
          providerEventId: r.pid ?? (r.source === "manual" ? null : `p${i}`),
          title: r.title,
          description: r.description ?? null,
          location: r.location ?? null,
          startsAt: new Date(r.start),
          endsAt: new Date(r.end ?? new Date(new Date(r.start).getTime() + 3_600_000)),
        })),
      ),
    );

  it("Google plus Outlook with the same start and title show once, richer row first, both sources named; no row is deleted", async () => {
    const { run } = await makeUser();
    await seed(run, [
      { source: "google", title: "Group project sync", start: "2026-11-10T20:00:00Z" },
      {
        source: "outlook",
        title: "Group Project Sync",
        start: "2026-11-10T20:00:00Z",
        description: "Join the Teams meeting: https://teams.example/x",
        location: "Microsoft Teams",
      },
      { source: "google", title: "Standup", start: "2026-11-10T14:00:00Z", pid: "s1" },
      { source: "google", title: "Standup", start: "2026-11-10T14:00:00Z", pid: "s2" },
    ]);
    const agenda = await run((s) => getAgenda(s, TZ, "2026-11-10", "2026-11-10", { include: ["event"] }));
    const sync = agenda.filter((a) => a.title.toLowerCase() === "group project sync");
    expect(sync).toHaveLength(1);
    expect(sync[0].title).toBe("Group Project Sync"); // the Outlook copy is richer
    expect(sync[0].sources).toEqual(["outlook", "google"]);
    expect(sync[0].subtitle).toContain("Microsoft Teams");
    expect(sync[0].subtitle).toContain("On Outlook + Google");
    // Two events from one source are never merged.
    expect(agenda.filter((a) => a.title === "Standup")).toHaveLength(2);
    // Different start: two events.
    await seed(run, [
      { source: "google", title: "Lab", start: "2026-11-11T14:00:00Z", pid: "l1" },
      { source: "outlook", title: "Lab", start: "2026-11-11T18:00:00Z", pid: "l2" },
    ]);
    expect((await run((s) => getAgenda(s, TZ, "2026-11-11", "2026-11-11", { include: ["event"] }))).filter((a) => a.title === "Lab")).toHaveLength(2);
    // Nothing was deleted.
    expect(await run((s) => s.tx.select().from(calendarEvents))).toHaveLength(6);
  });

  it("Canvas plus Google class shows once", async () => {
    const { run } = await makeUser();
    await seed(run, [
      { source: "canvas", title: "BIO 202 Lecture", start: "2026-11-10T15:00:00Z", pid: "canvas:x" },
      { source: "google", title: "BIO 202 lecture", start: "2026-11-10T15:02:00Z" },
    ]);
    const agenda = await run((s) => getAgenda(s, TZ, "2026-11-10", "2026-11-10", { include: ["event"] }));
    expect(agenda).toHaveLength(1);
    expect(agenda[0].sources).toHaveLength(2);
  });

  it("a flight on Dec 10 (Google's copy, the inbox copy and a schedule-change copy) shows once", async () => {
    const { run } = await makeUser();
    await seed(run, [
      { source: "google", title: "Flight to Cairo (MS 986)", start: "2026-12-10T13:15:00Z", location: "JFK" },
      { source: "manual", title: "Flight: Flight to Cairo (MS 986)", start: "2026-12-10T14:05:00Z", description: "Confirmation ABC123" },
      { source: "manual", title: "Flight: Flight to Cairo (MS 986)", start: "2026-12-10T14:05:00Z", description: "Confirmation ABC123" },
      { source: "manual", title: "Flight: Flight to Lisbon (TP 204)", start: "2026-12-10T09:00:00Z" },
    ]);
    const agenda = await run((s) => getAgenda(s, TZ, "2026-12-10", "2026-12-10", { include: ["event"] }));
    expect(agenda.filter((a) => /cairo/i.test(a.title))).toHaveLength(1);
    expect(agenda).toHaveLength(2); // the other flight is a different flight
    expect(await run((s) => s.tx.select().from(calendarEvents))).toHaveLength(4);
  });

  it("normalises titles and never merges unrelated classes that only share a code shape", () => {
    expect(normalizeTitle("Flight: Flight to Cairo (MS 986)")).toBe(normalizeTitle("flight to cairo  ms-986"));
    const mk = (id: string, title: string, source: string) => ({
      id,
      title,
      source,
      startsAt: new Date("2026-11-10T15:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
      kind: "personal",
      courseId: null,
      recurrence: null,
      description: null,
      location: null,
      updatedAt: new Date("2026-11-01T00:00:00Z"),
    });
    expect(mergeCrossSource([mk("a", "CS 101", "google"), mk("b", "BIO 202", "outlook")])).toHaveLength(2);
  });
});

describe("D13 to D17: paths that must stay unduplicated", () => {
  it("D15: re-syncs with recurring instances, a moved event, an edited title and a cancelled instance keep one row per id", async () => {
    let list: object[] = [
      gEv("r_20261109", "Weekly review", "2026-11-09T15:00:00Z", "2026-11-09T16:00:00Z"),
      gEv("r_20261116", "Weekly review", "2026-11-16T15:00:00Z", "2026-11-16T16:00:00Z"),
      gEv("r_20261123", "Weekly review", "2026-11-23T15:00:00Z", "2026-11-23T16:00:00Z"),
      gEv("solo", "Dentist", "2026-11-12T15:00:00Z", "2026-11-12T16:00:00Z"),
    ];
    const g = fakeGoogle({ events: () => list });
    const { run } = await connectedUser(g);
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    list = [
      gEv("r_20261109", "Weekly review", "2026-11-09T15:00:00Z", "2026-11-09T16:00:00Z"),
      gEv("r_20261116", "Weekly review (moved)", "2026-11-17T15:00:00Z", "2026-11-17T16:00:00Z"),
      gEv("solo", "Dentist (renamed)", "2026-11-13T15:00:00Z", "2026-11-13T16:00:00Z"), // r_20261123 cancelled
    ];
    expect(await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f))).toMatchObject({ added: 0, updated: 3, removed: 1 });
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    const rows = await rowsOf(run, "google");
    expect(rows.map((r) => r.providerEventId).sort()).toEqual(["r_20261109", "r_20261116", "solo"]);
    expect(rows.find((r) => r.providerEventId === "solo")!.title).toBe("Dentist (renamed)");
    // The agenda shows the three, no more.
    expect(await run((s) => getAgenda(s, TZ, "2026-11-08", "2026-11-30", { include: ["event"] }))).toHaveLength(3);
  });

  it("D16: reconnecting, or connecting again, keeps one connection row and one row per event", async () => {
    const g = fakeGoogle({ events: () => [gEv("e1", "Dentist", "2026-11-12T15:00:00Z", "2026-11-12T16:00:00Z")] });
    const { run } = await connectedUser(g);
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    const { creds, email } = await exchangeCode("code2", "verifier", "https://app.test/cb", g.f);
    await run((s) => saveGoogleConnection(s, creds, email));
    await run((s) => saveGoogleConnection(s, creds, "other@example.com"));
    await run((s) => syncGoogleCalendar(s, TZ, NOW, g.f));
    expect(
      await run((s) =>
        s.tx
          .select()
          .from(integrations)
          .where(and(eq(integrations.userId, s.userId), eq(integrations.provider, "google"))),
      ),
    ).toHaveLength(1);
    expect(await rowsOf(run, "google")).toHaveLength(1);
  });

  it("D13: two Gmail syncs at once index each message once", async () => {
    const g = fakeGoogle({ delayMs: 5 });
    const { run } = await connectedUser(g);
    await Promise.all([run((s) => syncGoogleEmail(s, g.f)), run((s) => syncGoogleEmail(s, g.f))]);
    await run((s) => syncGoogleEmail(s, g.f));
    expect(await run((s) => s.tx.select().from(gmailMessages).where(eq(gmailMessages.userId, s.userId)))).toHaveLength(1);
  });

  it("the same event id under two different sources, or two users, is allowed", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const row = (s: { userId: string }, source: "google" | "outlook") => ({
      userId: s.userId,
      source,
      providerEventId: "same",
      title: "X",
      startsAt: new Date("2026-11-10T15:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
    });
    await a.run((s) => s.tx.insert(calendarEvents).values([row(s, "google"), row(s, "outlook")]));
    await b.run((s) => s.tx.insert(calendarEvents).values(row(s, "google")));
    await expect(a.run((s) => s.tx.insert(calendarEvents).values(row(s, "google")))).rejects.toThrow();
  });
});
