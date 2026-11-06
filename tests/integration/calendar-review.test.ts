import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { closeDb } from "@/server/db/client";
import { calendarEvents, courses, pendingActions, trash } from "@/server/db/schema";
import { addGoogleEvent, exchangeCode, saveGoogleConnection, syncGoogleCalendar } from "@/server/integrations/google";
import { providerTimeoutMs } from "@/server/integrations/timeout";
import { saveMicrosoftConnection, syncMicrosoftCalendar } from "@/server/integrations/microsoft";
import { makeToolContext, runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { resolvePendingAction, runLimitMs } from "@/server/jarvis/executor";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { toUiMessages } from "@/server/jarvis/ui-messages";
import { freeSlots, getAgenda, moveAgendaItem, updateEvent } from "@/server/services/calendar";
import { moveToTrash, restoreFromTrash } from "@/server/services/trash";
import { createTask } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const SCOPE =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events";
const fakeGoogle = (events: () => object[]) =>
  (async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return json({ access_token: "at-0", refresh_token: "rt-1", expires_in: 3600, scope: SCOPE, id_token: idToken("ali@example.com") });
    if (url.includes("/calendars/primary/events?")) return json({ items: events() });
    return json({ error: { message: "x" } }, 404);
  }) as typeof fetch;
const NOW = new Date("2026-11-06T15:00:00Z");
type Run = Awaited<ReturnType<typeof makeUser>>["run"];
const seed = (run: Run, rows: Record<string, unknown>[]) =>
  run((s) =>
    s.tx
      .insert(calendarEvents)
      .values(rows.map((r) => ({ userId: s.userId, ...r })) as never)
      .returning(),
  );
const at = (iso: string, hours = 1) => ({ startsAt: new Date(iso), endsAt: new Date(new Date(iso).getTime() + hours * 3_600_000) });
const agendaOf = (run: Run, from: string, to = from) => run((s) => getAgenda(s, TZ, from, to, { include: ["event"] }));

describe("1. a crash after the claim doesn't leave an action running forever", () => {
  async function proposeDelete(u: Awaited<ReturnType<typeof makeUser>>) {
    const session = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" as const };
    const task = await u.run((s) => createTask(s, TZ, { title: "x" }));
    const events: JarvisEvent[] = [];
    await runJarvisTurn({
      user: session,
      text: "do",
      emit: (e) => events.push(e),
      provider: new ScriptedProvider(({ step }) => (step === 0 ? { toolCalls: [{ name: "delete_task", args: { id: task.id } }] } : { text: "ok" })),
    });
    const c = events.find((e) => e.type === "confirmation") as Extract<JarvisEvent, { type: "confirmation" }>;
    return { session, actionId: c.actionId, task };
  }

  it("a stale running action is marked failed with a plain message, never re-run, and answers fast", async () => {
    const u = await makeUser();
    const { session, actionId, task } = await proposeDelete(u);
    await u.run((s) =>
      s.tx
        .update(pendingActions)
        .set({ status: "running", claimedAt: new Date(Date.now() - 10 * 60_000) })
        .where(eq(pendingActions.id, actionId)),
    );
    const ctx = makeToolContext(session, "00000000-0000-0000-0000-000000000000");
    const t0 = Date.now();
    const r = await resolvePendingAction(actionId, "confirm", ctx);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.status).toBe("failed");
    expect(r.result.error).toMatch(/may have gone through/i);
    // It was NOT run again: the task is still there.
    const { getTask } = await import("@/server/services/tasks");
    expect((await u.run((s) => getTask(s, task.id))).title).toBe("x");
    // Cancel afterwards doesn't wait or throw either; it returns the same saved failure.
    expect(await resolvePendingAction(actionId, "cancel", ctx)).toMatchObject({ status: "failed", replayed: true });
  });

  it("claim time is saved, and the chat shows a running action as in progress, not as a Confirm button", async () => {
    const u = await makeUser();
    const { actionId } = await proposeDelete(u);
    const [row] = await u.run((s) =>
      s.tx.update(pendingActions).set({ status: "running", claimedAt: new Date() }).where(eq(pendingActions.id, actionId)).returning(),
    );
    expect(row.claimedAt).toBeInstanceOf(Date);
    const msg = { id: "m1", role: "tool", toolName: "delete_task", toolCallId: row.toolCallId, toolArgs: {}, toolResult: null, content: "" } as never;
    const ui = toUiMessages([msg], [row], []);
    const c = (ui[0] as { confirmations: { status: string; resultText?: string }[] }).confirmations[0];
    expect(c.status).toBe("pending");
    expect(c.resultText).toBe("Working…"); // no Confirm button while it runs
  });
});

describe("2. a sync keeps what the user changed", () => {
  it("Google and Outlook syncs don't reset an event the user marked as an exam, and the course link stays", async () => {
    let title = "CHEM 201 Midterm";
    const f = fakeGoogle(() => [{ id: "g1", summary: title, start: { dateTime: "2026-11-12T15:00:00Z" }, end: { dateTime: "2026-11-12T16:00:00Z" } }]);
    const u = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", f);
    await u.run((s) => saveGoogleConnection(s, creds, email));
    await u.run((s) => syncGoogleCalendar(s, TZ, NOW, f));
    const [row] = await u.run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.userId, s.userId)));
    expect(row.kind).toBe("personal");
    const course = await u.run(
      async (s) =>
        (
          await s.tx
            .insert(courses)
            .values({ userId: s.userId, name: "CHEM 201" } as never)
            .returning()
        )[0],
    );
    await u.run((s) =>
      updateEvent(s, TZ, row.id, { title: row.title, kind: "exam", courseId: course.id, date: "2026-11-12", startTime: "10:00", endTime: "11:00" }),
    );
    title = "CHEM 201 Midterm (room 4)";
    await u.run((s) => syncGoogleCalendar(s, TZ, NOW, f));
    const [after] = await u.run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.userId, s.userId)));
    expect(after).toMatchObject({ kind: "exam", courseId: course.id, title: "CHEM 201 Midterm (room 4)" }); // Google's own fields still win

    const m = await makeUser();
    await m.run((s) =>
      saveMicrosoftConnection(s, { refreshToken: "rt", accessToken: "at", expiresAt: Date.now() + 3_600_000, scope: "Calendars.Read" }, "m@school.edu"),
    );
    const soon = new Date(NOW.getTime() + 24 * 3_600_000).toISOString().replace("Z", "0000");
    const mf = (async () => json({ value: [{ id: "o1", subject: "Quiz", start: { dateTime: soon }, end: { dateTime: soon } }] })) as unknown as typeof fetch;
    await m.run((s) => syncMicrosoftCalendar(s, TZ, NOW, mf));
    const [o] = await m.run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.userId, s.userId)));
    await m.run((s) => s.tx.update(calendarEvents).set({ kind: "exam" }).where(eq(calendarEvents.id, o.id)));
    await m.run((s) => syncMicrosoftCalendar(s, TZ, NOW, mf));
    expect((await m.run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.userId, s.userId))))[0].kind).toBe("exam");
  });
});

describe("3. the merge needs the same end and the same kind", () => {
  it("Outlook Work 9 to 5 and Google Work 9 to 10 stay two events, and free time knows about both", async () => {
    const u = await makeUser();
    await seed(u.run, [
      { title: "Work", source: "outlook", providerEventId: "o1", ...at("2026-11-12T14:00:00Z", 8) },
      { title: "Work", source: "google", providerEventId: "g1", ...at("2026-11-12T14:00:00Z", 1) },
    ]);
    const a = await agendaOf(u.run, "2026-11-12");
    expect(a).toHaveLength(2);
    const free = freeSlots(a, "2026-11-12", TZ);
    expect(free[0].startsAt.toISOString()).toBe("2026-11-12T13:00:00.000Z"); // 8:00 to 9:00 before work
    expect(free.some((s) => s.startsAt < new Date("2026-11-12T22:00:00Z") && s.endsAt > new Date("2026-11-12T16:00:00Z"))).toBe(false); // no slot inside the 9 to 5
  });

  it("a Canvas class doesn't hide a manual exam with the same title and time; unclassified Google copies still merge with a class", async () => {
    const u = await makeUser();
    await seed(u.run, [
      { title: "CHEM 201", kind: "class", source: "canvas", providerEventId: "canvas:1", ...at("2026-11-12T15:00:00Z") },
      { title: "CHEM 201", kind: "exam", source: "manual", ...at("2026-11-12T15:00:00Z") },
      { title: "BIO 101", kind: "class", source: "canvas", providerEventId: "canvas:2", ...at("2026-11-12T18:00:00Z") },
      { title: "BIO 101", source: "google", providerEventId: "g2", ...at("2026-11-12T18:00:00Z") },
    ]);
    const a = await agendaOf(u.run, "2026-11-12");
    expect(
      a
        .filter((x) => x.title === "CHEM 201")
        .map((x) => x.kind)
        .sort(),
    ).toEqual(["class", "exam"]);
    expect(a.filter((x) => x.title === "BIO 101")).toHaveLength(1);
  });
});

describe("4/6. the flight rule", () => {
  it("a Flight Dynamics lecture and exam (course code AE 312) are never merged", async () => {
    const u = await makeUser();
    await seed(u.run, [
      { title: "Flight Dynamics AE 312 lecture", kind: "class", source: "canvas", providerEventId: "canvas:2", ...at("2026-11-12T14:00:00Z") },
      { title: "Flight Dynamics AE 312 exam", kind: "exam", source: "manual", ...at("2026-11-12T19:00:00Z", 2) },
      { title: "Flight Dynamics AE 312", kind: "class", source: "manual", ...at("2026-11-12T20:00:00Z") },
      { title: "Flight Dynamics AE 312", kind: "class", source: "manual", ...at("2026-11-12T22:00:00Z") },
    ]);
    expect(await agendaOf(u.run, "2026-11-12")).toHaveLength(4);
  });

  it("the same flight number more than a day apart is two flights; within a day (time zones) it's one", async () => {
    const u = await makeUser();
    await seed(u.run, [
      // Google 01:30 Cairo on Dec 20 = Dec 19 23:30Z; the inbox saved 01:30 in the user's zone = Dec 20 06:30Z: a different local day.
      { title: "Flight to New York (MS 985)", source: "google", providerEventId: "g9", ...at("2026-12-19T23:30:00Z", 11) },
      { title: "Flight: Flight to New York (MS 985)", source: "manual", ...at("2026-12-20T06:30:00Z") },
      { title: "Flight to Cairo (MS 986)", source: "manual", ...at("2026-12-10T14:00:00Z") },
      { title: "Flight to Cairo (MS 986)", source: "manual", ...at("2026-12-12T14:00:00Z") },
    ]);
    const a = await agendaOf(u.run, "2026-12-09", "2026-12-21");
    expect(a.filter((x) => /new york/i.test(x.title))).toHaveLength(1);
    expect(a.filter((x) => /cairo/i.test(x.title))).toHaveLength(2);
  });
});

describe("5. dragging or deleting a merged event acts on every copy", () => {
  const rows = [
    { title: "Group project sync", source: "google", providerEventId: "g1", ...at("2026-11-10T20:00:00Z") },
    { title: "Group project sync", source: "outlook", providerEventId: "o1", description: "Teams", ...at("2026-11-10T20:00:00Z") },
  ];
  it("drag moves both copies, so it still shows once", async () => {
    const u = await makeUser();
    await seed(u.run, rows);
    const [item] = await agendaOf(u.run, "2026-11-10");
    await u.run((s) => moveAgendaItem(s, TZ, "event", item.id, "2026-11-11"));
    expect(await agendaOf(u.run, "2026-11-10")).toHaveLength(0);
    expect(await agendaOf(u.run, "2026-11-11")).toHaveLength(1);
  });
  it("delete takes every copy to the trash in one entry, and Undo brings them all back", async () => {
    const u = await makeUser();
    await seed(u.run, rows);
    const [item] = await agendaOf(u.run, "2026-11-10");
    const t = await u.run((s) => moveToTrash(s, "event", item.id));
    expect(await agendaOf(u.run, "2026-11-10")).toHaveLength(0);
    expect(await u.run((s) => s.tx.select().from(calendarEvents))).toHaveLength(0);
    await u.run((s) => restoreFromTrash(s, t.trashId));
    expect(await u.run((s) => s.tx.select().from(calendarEvents))).toHaveLength(2);
    expect(await agendaOf(u.run, "2026-11-10")).toHaveLength(1);
  });
});

describe("8. restoring a trashed synced event whose key is taken again", () => {
  it("merges the notes into the live row and says so", async () => {
    const u = await makeUser();
    const [r1] = await seed(u.run, [
      { title: "Advisor", description: "my notes", kind: "exam", source: "google", providerEventId: "gx", ...at("2026-11-12T15:00:00Z") },
    ]);
    const t = await u.run((s) => moveToTrash(s, "event", r1.id));
    await seed(u.run, [{ title: "Advisor", source: "google", providerEventId: "gx", ...at("2026-11-12T15:00:00Z") }]);
    const res = await u.run((s) => restoreFromTrash(s, t.trashId));
    expect(res.note).toMatch(/Google already added this event back/i);
    const rows = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "my notes", kind: "exam" });
    expect(await u.run((s) => s.tx.select().from(trash))).toHaveLength(0);
  });
});

describe("7. migration 0038 keeps what the dropped copy knew and repoints references", () => {
  it("copies kind, notes and place; repoints pending actions, chat tool records and trash; resets app.user_id", async () => {
    const u = await makeUser();
    const course = await u.run(
      async (s) =>
        (
          await s.tx
            .insert(courses)
            .values({ userId: s.userId, name: "CHEM 201" } as never)
            .returning()
        )[0],
    );
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query('DROP INDEX "events_user_source_provider_uq"');
      await client.query("SELECT set_config('app.user_id', $1, true)", [u.user.id]);
      const ins = async (course_id: string | null, kind: string, desc: string | null, loc: string | null, updated: string) =>
        (
          await client.query(
            `INSERT INTO calendar_events (user_id, title, description, location, kind, course_id, starts_at, ends_at, source, provider_event_id, updated_at)
             VALUES ($1, 'CHEM', $2, $3, $4, $5, '2026-11-10T15:00:00Z', '2026-11-10T16:00:00Z', 'google', 'k1', $6) RETURNING id`,
            [u.user.id, desc, loc, kind, course_id, updated],
          )
        ).rows[0].id as string;
      const keep = await ins(course.id, "personal", null, null, "2026-11-01T00:00:00Z");
      const dup = await ins(null, "exam", "my notes", "Room 4", "2026-11-02T00:00:00Z");
      const dup2 = await ins(null, "personal", null, null, "2026-11-03T00:00:00Z");
      const conv = (await client.query(`INSERT INTO conversations (user_id) VALUES ($1) RETURNING id`, [u.user.id])).rows[0].id;
      await client.query(
        `INSERT INTO pending_actions (user_id, conversation_id, tool_name, tool_call_id, args, summary, expires_at, status)
         VALUES ($1, $2, 'delete_event', 'c1', $3, 's', now() + interval '1 hour', 'pending')`,
        [u.user.id, conv, JSON.stringify({ id: dup })],
      );
      await client.query(
        `INSERT INTO messages (user_id, conversation_id, role, tool_name, tool_call_id, tool_args, tool_result) VALUES ($1, $2, 'tool', 'delete_event', 'c1', $3, $4)`,
        [
          u.user.id,
          conv,
          JSON.stringify({ id: dup }),
          JSON.stringify({ ok: true, data: { deleted: dup, also: [dup2, dup], note: `removed ${dup} and ${dup2}` } }),
        ],
      );
      await client.query(`INSERT INTO trash (user_id, kind, label, payload) VALUES ($1, 'course', 'x', $2)`, [
        u.user.id,
        JSON.stringify({ unrelated: [{ eventId: dup }, { eventId: dup2 }] }),
      ]);

      const sqlText = readFileSync("drizzle/0038_calendar_events_unique.sql", "utf8");
      for (const stmt of sqlText.split("--> statement-breakpoint")) await client.query(stmt);
      expect((await client.query("SELECT current_setting('app.user_id', true) AS v")).rows[0].v).toBe(""); // reset at the end, like 0035
      await client.query("SELECT set_config('app.user_id', $1, true)", [u.user.id]);

      const ev = (await client.query("SELECT * FROM calendar_events WHERE provider_event_id = 'k1'")).rows;
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ id: keep, course_id: course.id, kind: "exam", description: "my notes", location: "Room 4" });
      expect((await client.query("SELECT args FROM pending_actions WHERE conversation_id = $1", [conv])).rows[0].args).toEqual({ id: keep });
      const m = (await client.query("SELECT tool_args, tool_result FROM messages WHERE conversation_id = $1", [conv])).rows[0];
      expect(m.tool_args).toEqual({ id: keep });
      expect(m.tool_result.data).toEqual({ deleted: keep, also: [keep, keep], note: `removed ${keep} and ${keep}` }); // every dropped id, not just one per record
      expect((await client.query("SELECT payload FROM trash WHERE user_id = $1", [u.user.id])).rows[0].payload).toEqual({
        unrelated: [{ eventId: keep }, { eventId: keep }],
      });
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      await pool.end();
    }
  });
});

describe("merge: an unclassified copy can't bridge a class and an exam", () => {
  it("Google CHEM 201 (personal) with a Canvas class and a manual exam at the same time leaves the exam visible", async () => {
    const u = await makeUser();
    await seed(u.run, [
      { title: "CHEM 201", kind: "class", source: "canvas", providerEventId: "canvas:1", ...at("2026-11-12T15:00:00Z") },
      { title: "CHEM 201", kind: "exam", source: "manual", ...at("2026-11-12T15:00:00Z") },
      { title: "CHEM 201", source: "google", providerEventId: "g1", ...at("2026-11-12T15:00:00Z") },
    ]);
    const a = await agendaOf(u.run, "2026-11-12");
    expect(a.map((x) => x.kind).sort()).toEqual(["class", "exam"]);
    // Deleting the exam takes only its own group (the exam, and the Google copy if it was grouped with it), never the class.
    const exam = a.find((x) => x.kind === "exam")!;
    await u.run((s) => moveToTrash(s, "event", exam.id));
    const left = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(left.some((r) => r.kind === "exam")).toBe(false);
    expect(left.some((r) => r.kind === "class")).toBe(true); // the class is never taken along
  });
});

describe("provider calls have a time limit, and a slow success beats the lost verdict", () => {
  async function connected(f: typeof fetch) {
    const u = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", f);
    await u.run((s) => saveGoogleConnection(s, creds, email));
    return u;
  }
  async function proposeEmail(u: Awaited<ReturnType<typeof makeUser>>) {
    const session = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" as const };
    const events: JarvisEvent[] = [];
    await runJarvisTurn({
      user: session,
      text: "mail",
      emit: (e) => events.push(e),
      provider: new ScriptedProvider(({ step }) =>
        step === 0 ? { toolCalls: [{ name: "send_email", args: { to: "prof@uni.edu", subject: "Hi", body: "Hello" } }] } : { text: "ok" },
      ),
    });
    const c = events.find((e) => e.type === "confirmation") as Extract<JarvisEvent, { type: "confirmation" }>;
    return { session, actionId: c.actionId };
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("a call that takes longer than the lost limit still finishes: its real result replaces the lost verdict", async () => {
    let sends = 0;
    const base = fakeGoogle(() => []);
    const slow = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/messages/send")) {
        sends++;
        await sleep(900);
        return json({ id: "sent1", threadId: "t1", labelIds: ["SENT"] });
      }
      return base(input, init);
    }) as typeof fetch;
    const u = await connected(slow);
    const { session, actionId } = await proposeEmail(u);
    const prevFetch = globalThis.fetch;
    globalThis.fetch = slow;
    process.env.ACTION_RUN_LIMIT_MS = "300";
    try {
      const ctx = makeToolContext(session, "00000000-0000-0000-0000-000000000000");
      const first = resolvePendingAction(actionId, "confirm", ctx);
      await sleep(100);
      const second = await resolvePendingAction(actionId, "confirm", ctx); // the retry gives up waiting at the limit
      expect(second).toMatchObject({ status: "failed", replayed: true });
      expect(second.result.error).toMatch(/may have gone through/i);
      const r = await first;
      expect(r.status).toBe("executed");
      const [row] = await u.run((s) => s.tx.select().from(pendingActions).where(eq(pendingActions.id, actionId)));
      expect(row).toMatchObject({ status: "executed" }); // the card agrees with the chat
      expect(row.result).toMatchObject({ ok: true });
      expect(sends).toBe(1);
    } finally {
      globalThis.fetch = prevFetch;
      delete process.env.ACTION_RUN_LIMIT_MS;
    }
  });

  it("a Google call that never answers is cut off at the limit with a plain message", async () => {
    const base = fakeGoogle(() => []);
    const hang = (async (input: string | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/messages/send")) return base(input, init);
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as typeof fetch;
    const u = await connected(hang);
    const { session, actionId } = await proposeEmail(u);
    const prevFetch = globalThis.fetch;
    globalThis.fetch = hang;
    process.env.PROVIDER_TIMEOUT_MS = "80";
    try {
      const t0 = Date.now();
      const r = await resolvePendingAction(actionId, "confirm", makeToolContext(session, "00000000-0000-0000-0000-000000000000"));
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(r.status).toBe("failed");
      expect(r.result.error).toMatch(/took too long/i);
    } finally {
      globalThis.fetch = prevFetch;
      delete process.env.PROVIDER_TIMEOUT_MS;
    }
  });
});

describe("a sync cut off while the body downloads never deletes anything", () => {
  const cutOff = () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"items":[{"id":"g1","sum'));
          c.error(new DOMException("The operation timed out.", "TimeoutError"));
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("Google: a body that times out mid-stream fails the sync and every row survives", async () => {
    let broken = false;
    const base = fakeGoogle(() => [
      { id: "g1", summary: "Dentist", start: { dateTime: "2026-11-12T15:00:00Z" }, end: { dateTime: "2026-11-12T16:00:00Z" } },
      { id: "g2", summary: "Lab", start: { dateTime: "2026-11-13T15:00:00Z" }, end: { dateTime: "2026-11-13T16:00:00Z" } },
    ]);
    const f = (async (input: string | URL, init?: RequestInit) =>
      broken && String(input).includes("/calendars/primary/events?") ? cutOff() : base(input, init)) as typeof fetch;
    const u = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", f);
    await u.run((s) => saveGoogleConnection(s, creds, email));
    await u.run((s) => syncGoogleCalendar(s, TZ, NOW, f));
    const before = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(before).toHaveLength(2);
    broken = true;
    await expect(u.run((s) => syncGoogleCalendar(s, TZ, NOW, f))).rejects.toThrow();
    const after = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort()); // same rows, same ids
  });

  it("Outlook: the same", async () => {
    const m = await makeUser();
    await m.run((s) =>
      saveMicrosoftConnection(s, { refreshToken: "rt", accessToken: "at", expiresAt: Date.now() + 3_600_000, scope: "Calendars.Read" }, "m@school.edu"),
    );
    const soon = new Date(NOW.getTime() + 24 * 3_600_000).toISOString().replace("Z", "0000");
    let broken = false;
    const f = (async () =>
      broken ? cutOff() : json({ value: [{ id: "o1", subject: "Quiz", start: { dateTime: soon }, end: { dateTime: soon } }] })) as unknown as typeof fetch;
    await m.run((s) => syncMicrosoftCalendar(s, TZ, NOW, f));
    const before = await m.run((s) => s.tx.select().from(calendarEvents));
    broken = true;
    await expect(m.run((s) => syncMicrosoftCalendar(s, TZ, NOW, f))).rejects.toThrow();
    expect((await m.run((s) => s.tx.select().from(calendarEvents))).map((r) => r.id)).toEqual(before.map((r) => r.id));
  });
});

describe("creating a Google event is idempotent, so a retry after an aborted create makes one event", () => {
  it("the same event asked for twice sends the same Google id; a 409 returns the existing event", async () => {
    const store = new Map<string, Record<string, unknown>>();
    const posts: string[] = [];
    let firstCall = true;
    const base = fakeGoogle(() => []);
    const f = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/calendars/primary/events") && init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        posts.push(b.id);
        if (store.has(b.id)) return json({ error: { message: "exists" } }, 409);
        store.set(b.id, { id: b.id, htmlLink: "https://calendar.google.com/x", ...b });
        if (firstCall) {
          firstCall = false; // Google did it, but the answer never arrives
          return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
        }
        return json(store.get(b.id));
      }
      const m = url.match(/\/calendars\/primary\/events\/([^/?]+)$/);
      if (m) return store.has(m[1]) ? json(store.get(m[1])) : json({ error: {} }, 404);
      return base(input, init);
    }) as typeof fetch;
    const u = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", f);
    await u.run((s) => saveGoogleConnection(s, creds, email));
    const ev = { title: "Study group", date: "2026-11-20", startTime: "14:00", endTime: "15:00" };
    process.env.PROVIDER_TIMEOUT_MS = "80";
    try {
      await expect(u.run((s) => addGoogleEvent(s, TZ, ev, f))).rejects.toThrow(/too long/);
    } finally {
      delete process.env.PROVIDER_TIMEOUT_MS;
    }
    const r = await u.run((s) => addGoogleEvent(s, TZ, ev, f)); // the retry
    expect(store.size).toBe(1); // one event in Google
    expect(posts[0]).toBe(posts[1]);
    expect(posts[0]).toMatch(/^[0-9a-v]{5,1024}$/); // allowed characters for a Google event id
    expect(r.googleEventId).toBe(posts[0]);
    const rows = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(rows).toHaveLength(1);
    // A different event gets a different id.
    await u.run((s) => addGoogleEvent(s, TZ, { ...ev, title: "Other" }, f));
    expect(store.size).toBe(2);
  });
});

describe("timeout overrides are ignored in production", () => {
  it("production uses the defaults whatever the env says; elsewhere a sane override is allowed, junk is not", () => {
    expect(providerTimeoutMs({ NODE_ENV: "production", PROVIDER_TIMEOUT_MS: "1" } as never)).toBe(20_000);
    expect(runLimitMs({ NODE_ENV: "production", ACTION_RUN_LIMIT_MS: "1" } as never)).toBe(90_000);
    expect(providerTimeoutMs({ NODE_ENV: "test", PROVIDER_TIMEOUT_MS: "80" } as never)).toBe(80);
    expect(providerTimeoutMs({ NODE_ENV: "test", PROVIDER_TIMEOUT_MS: "-5" } as never)).toBe(20_000);
    expect(providerTimeoutMs({ NODE_ENV: "test", PROVIDER_TIMEOUT_MS: "abc" } as never)).toBe(20_000);
    expect(runLimitMs({ NODE_ENV: "development", ACTION_RUN_LIMIT_MS: "0" } as never)).toBe(90_000);
    expect(runLimitMs({ NODE_ENV: "test", ACTION_RUN_LIMIT_MS: "300" } as never)).toBe(300);
  });
});

describe("a repeated add only reuses Google's event when it is still the same event", () => {
  // A stand-in Google that honours client ids, answers 409 for a taken id, and lets a test change or remove events.
  function store() {
    const events = new Map<string, Record<string, unknown>>();
    const posts: (string | undefined)[] = [];
    let n = 0;
    const base = fakeGoogle(() => []);
    const f = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/calendars/primary/events") && init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        posts.push(b.id);
        if (b.id && events.has(b.id)) return json({ error: { message: "exists" } }, 409);
        const id = b.id ?? `rnd${++n}`;
        events.set(id, { ...b, id, htmlLink: "https://calendar.google.com/x" });
        return json(events.get(id));
      }
      const m = url.match(/\/calendars\/primary\/events\/([^/?]+)$/);
      if (m) return events.has(m[1]) ? json(events.get(m[1])) : json({ error: { message: "nf" } }, 404);
      return base(input, init);
    }) as typeof fetch;
    return { events, posts, f };
  }
  const gym = { title: "Gym", date: "2026-11-20", startTime: "07:00", endTime: "08:00" };
  async function setup() {
    const g = store();
    const u = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", g.f);
    await u.run((s) => saveGoogleConnection(s, creds, email));
    return { ...g, u };
  }

  it("Gym at 7, moved in Google, added at 7 again: a new event at 7", async () => {
    const { events, u, f } = await setup();
    const first = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    const ev = events.get(first.googleEventId)!;
    ev.start = { dateTime: "2026-11-20T20:00:00Z" }; // moved in Google
    ev.end = { dateTime: "2026-11-20T21:00:00Z" };
    const second = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    expect(second.googleEventId).not.toBe(first.googleEventId);
    expect(events.size).toBe(2);
    const local = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(local).toHaveLength(2);
    expect(local.some((r) => r.startsAt.toISOString() === "2026-11-20T12:00:00.000Z")).toBe(true); // 7:00 New York
  });

  it("a deliberate identical second add returns the existing event", async () => {
    const { events, u, f } = await setup();
    const first = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    const second = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    expect(second.googleEventId).toBe(first.googleEventId);
    expect(events.size).toBe(1);
  });

  it("a renamed or cancelled event, or a lookup that finds nothing (404), gets a fresh create", async () => {
    const { events, u, f } = await setup();
    const first = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    events.get(first.googleEventId)!.summary = "Gym (renamed)";
    const renamed = await u.run((s) => addGoogleEvent(s, TZ, gym, f));
    expect(renamed.googleEventId).not.toBe(first.googleEventId);
    // The lookup after the 409 says 404: a fresh create, not an error.
    const g2 = store();
    const u2 = await makeUser();
    const { creds, email } = await exchangeCode("code", "v", "https://app.test/cb", g2.f);
    await u2.run((s) => saveGoogleConnection(s, creds, email));
    const a = await u2.run((s) => addGoogleEvent(s, TZ, gym, g2.f));
    const vanishing = (async (input: string | URL, init?: RequestInit) => {
      if (/\/events\/lf[0-9a-f]+$/.test(String(input))) return json({ error: { message: "nf" } }, 404);
      return g2.f(input, init);
    }) as typeof fetch;
    const b = await u2.run((s) => addGoogleEvent(s, TZ, gym, vanishing));
    expect(b.googleEventId).not.toBe(a.googleEventId);
    expect(g2.events.size).toBe(2);
    // Cancelled in Google since.
    g2.events.get(b.googleEventId)!.status = "cancelled";
    g2.events.get(a.googleEventId)!.status = "cancelled";
    const c = await u2.run((s) => addGoogleEvent(s, TZ, gym, g2.f));
    expect([a.googleEventId, b.googleEventId]).not.toContain(c.googleEventId);
    expect(g2.events.get(c.googleEventId)!.status).not.toBe("cancelled");
  });

  it("the local copy keeps the title and times Google returned, not the requested ones", async () => {
    const { u, f } = await setup();
    const altering = (async (input: string | URL, init?: RequestInit) => {
      const res = await f(input, init);
      if (init?.method !== "POST") return res;
      const b = await res.json();
      return json({ ...b, summary: "Gym (Google)", start: { dateTime: "2026-11-20T13:00:00Z" }, end: { dateTime: "2026-11-20T14:00:00Z" } });
    }) as typeof fetch;
    await u.run((s) => addGoogleEvent(s, TZ, gym, altering));
    const [row] = await u.run((s) => s.tx.select().from(calendarEvents));
    expect(row.title).toBe("Gym (Google)");
    expect(row.startsAt.toISOString()).toBe("2026-11-20T13:00:00.000Z");
  });
});
