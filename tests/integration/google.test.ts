import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { calendarEvents, integrations } from "@/server/db/schema";
import {
  addGoogleEvent,
  authUrl,
  buildRawEmail,
  createDraft,
  disconnectGoogle,
  exchangeCode,
  getGoogleConnection,
  newOAuthState,
  parseRecipients,
  readEmail,
  saveGoogleConnection,
  searchEmail,
  sendEmail,
  syncGoogleCalendar,
} from "@/server/integrations/google";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
});

const SCOPE =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const b64 = (s: string) => Buffer.from(s).toString("base64url");

type Call = { url: string; method: string; body?: string; auth?: string };
/** A tiny stand-in for Google's APIs. */
function fakeGoogle(opts: { refreshFails?: boolean; events?: object[] } = {}) {
  const calls: Call[] = [];
  let tokenN = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : undefined;
    calls.push({ url, method, body, auth: (init?.headers as Record<string, string>)?.authorization });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (body?.includes("grant_type=refresh_token"))
        return opts.refreshFails ? json({ error: "invalid_grant" }, 400) : json({ access_token: `at-${++tokenN}`, expires_in: 3600 });
      return json({ access_token: "at-0", refresh_token: "rt-1", expires_in: 3600, scope: SCOPE, id_token: idToken("Ali@Example.com") });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
    if (url.includes("/messages?")) return json({ messages: [{ id: "msg12345" }] });
    if (url.includes("/messages/msg12345?format=metadata"))
      return json({
        id: "msg12345",
        threadId: "th1",
        snippet: "Midterm moved",
        labelIds: ["UNREAD"],
        internalDate: "1793000000000",
        payload: {
          headers: [
            { name: "From", value: "Prof <prof@uni.edu>" },
            { name: "Subject", value: "Midterm" },
            { name: "Message-ID", value: "<abc@uni.edu>" },
          ],
        },
      });
    if (url.includes("/messages/msg12345?format=full"))
      return json({
        id: "msg12345",
        threadId: "th1",
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "From", value: "prof@uni.edu" },
            { name: "Subject", value: "Midterm" },
          ],
          parts: [
            { mimeType: "text/html", body: { data: b64("<p>HTML</p>") } },
            { mimeType: "text/plain", body: { data: b64("The midterm is now Nov 12.") } },
          ],
        },
      });
    if (url.endsWith("/drafts") && method === "POST") return json({ id: "draft1", message: { id: "m-d", threadId: "th1" } });
    if (url.endsWith("/messages/send") && method === "POST") return json({ id: "sent1", threadId: "th1", labelIds: ["SENT"] });
    if (url.includes("/calendars/primary/events?")) return json({ items: opts.events ?? [] });
    if (url.endsWith("/calendars/primary/events") && method === "POST") {
      const b = JSON.parse(body!);
      return json({ id: "gev-new", htmlLink: "https://calendar.google.com/x", ...b });
    }
    return json({ error: { message: `unhandled ${method} ${url}` } }, 404);
  }) as typeof fetch;
  return { f, calls };
}

async function connectedUser(g = fakeGoogle()) {
  const u = await makeUser("Google User");
  const { creds, email } = await exchangeCode("code", "verifier", "https://app.test/api/integrations/google/callback", g.f);
  await u.run((s) => saveGoogleConnection(s, creds, email));
  return { ...u, g };
}

describe("Google sign-in", () => {
  it("builds a PKCE + state auth URL asking for offline access to only the needed scopes", () => {
    const { state, challenge } = newOAuthState();
    const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://app.test/cb", state, challenge }));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe(state);
    expect(u.searchParams.get("scope")).toBe(SCOPE);
  });

  it("stores tokens encrypted and reads the account email", async () => {
    const { run } = await connectedUser();
    const conn = await run((s) => getGoogleConnection(s));
    expect(conn).toMatchObject({ provider: "google", status: "connected", displayName: "ali@example.com" });
    expect(conn!.encryptedCredentials).toMatch(/^v1\./);
    expect(conn!.encryptedCredentials).not.toContain("rt-1");
  });
});

describe("Gmail", () => {
  it("searches and reads email, preferring plain text", async () => {
    const { run, g } = await connectedUser();
    const found = await run((s) => searchEmail(s, "from:prof", 5, g.f));
    expect(found[0]).toMatchObject({ id: "msg12345", from: "Prof <prof@uni.edu>", subject: "Midterm", unread: true });
    const m = await run((s) => readEmail(s, "msg12345", g.f));
    expect(m.body).toBe("The midterm is now Nov 12.");
    expect(g.calls.every((c) => !c.url.includes("googleapis.com/gmail") || c.auth === "Bearer at-0")).toBe(true);
  });

  it("builds safe messages: valid recipients only, no header injection", () => {
    expect(() => parseRecipients("not-an-email")).toThrow(/valid email/);
    expect(parseRecipients("Prof <prof@uni.edu>, a@b.co")).toEqual(["prof@uni.edu", "a@b.co"]);
    const raw = Buffer.from(buildRawEmail({ to: ["a@b.co"], subject: "Hi\r\nBcc: evil@x.com", body: "Hello" }), "base64url").toString("utf8");
    expect(raw).not.toMatch(/^Bcc:/m);
    expect(raw).toContain("Subject: Hi Bcc: evil@x.com");
  });

  it("drafts a reply in the same thread; sending reports Gmail's confirmation", async () => {
    const { run, g } = await connectedUser();
    const d = await run((s) => createDraft(s, { to: "prof@uni.edu", subject: "Re: Midterm", body: "Thanks!", replyToId: "msg12345" }, g.f));
    expect(d.draftId).toBe("draft1");
    const draftCall = g.calls.find((c) => c.url.endsWith("/drafts"))!;
    const sent = JSON.parse(draftCall.body!);
    expect(sent.message.threadId).toBe("th1");
    expect(Buffer.from(sent.message.raw, "base64url").toString()).toContain("In-Reply-To: <abc@uni.edu>");
    expect(await run((s) => sendEmail(s, { to: "prof@uni.edu", subject: "Hi", body: "Hello" }, g.f))).toMatchObject({ sent: true, gmailMessageId: "sent1" });
  });

  it("the assistant can't send without the user's confirmation", async () => {
    const { user } = await connectedUser();
    const realFetch = globalThis.fetch;
    const hits: string[] = [];
    globalThis.fetch = (async (u: string | URL) => (hits.push(String(u)), new Response("{}"))) as typeof fetch;
    try {
      const events: JarvisEvent[] = [];
      const session = { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" as const };
      await runJarvisTurn({
        user: session,
        text: "email my professor",
        emit: (e) => events.push(e),
        provider: new ScriptedProvider(({ step }) =>
          step === 0 ? { toolCalls: [{ name: "send_email", args: { to: "prof@uni.edu", subject: "Hi", body: "Hello" } }] } : { text: "Press Confirm." },
        ),
      });
      expect(events.find((e) => e.type === "confirmation")).toMatchObject({ summary: 'Send email to prof@uni.edu: "Hi"?' });
      expect(hits.filter((h) => h.includes("gmail"))).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("token refresh", () => {
  it("refreshes an expired access token and marks the connection when Google access was removed", async () => {
    const good = await connectedUser();
    await good.run((s) => s.tx.update(integrations).set({ encryptedCredentials: null }).where(eq(integrations.userId, s.userId)));
    await expect(good.run((s) => searchEmail(s, "x", 1, good.g.f))).rejects.toThrow(/isn't connected/);

    const g = fakeGoogle({ refreshFails: true });
    const u = await makeUser();
    await u.run((s) => saveGoogleConnection(s, { refreshToken: "rt", accessToken: "old", expiresAt: Date.now() - 1000, scope: SCOPE }, "x@y.z"));
    await expect(u.run((s) => searchEmail(s, "x", 1, g.f))).rejects.toThrow(/Reconnect/);
    const conn = await u.run((s) => getGoogleConnection(s));
    expect(conn).toMatchObject({ status: "error" });
  });
});

describe("Google Calendar", () => {
  const ev = (id: string, title: string, start: string, end: string) => ({ id, summary: title, start: { dateTime: start }, end: { dateTime: end } });
  it("mirrors events (insert, update, remove) and adds events to Google", async () => {
    const now = new Date("2026-10-28T15:00:00Z");
    const g1 = fakeGoogle({
      events: [
        ev("e1", "Dentist", "2026-10-29T15:00:00Z", "2026-10-29T16:00:00Z"),
        { id: "e2", summary: "Trip", start: { date: "2026-11-02" }, end: { date: "2026-11-04" } },
      ],
    });
    const { run } = await connectedUser(g1);
    expect(await run((s) => syncGoogleCalendar(s, TZ, now, g1.f))).toMatchObject({ added: 2, updated: 0, removed: 0 });
    const g2 = fakeGoogle({ events: [ev("e1", "Dentist (moved)", "2026-10-30T15:00:00Z", "2026-10-30T16:00:00Z")] });
    expect(await run((s) => syncGoogleCalendar(s, TZ, now, g2.f))).toMatchObject({ added: 0, updated: 1, removed: 1 });
    const rows = await run((s) =>
      s.tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, s.userId), eq(calendarEvents.source, "google"))),
    );
    expect(rows.map((r) => r.title)).toEqual(["Dentist (moved)"]);

    const added = await run((s) => addGoogleEvent(s, TZ, { title: "Study group", date: "2026-11-01", startTime: "14:00", endTime: "15:30" }, g2.f));
    expect(added.googleEventId).toBe("gev-new");
    const post = JSON.parse(g2.calls.find((c) => c.method === "POST" && c.url.endsWith("/events"))!.body!);
    expect(post.start.timeZone).toBe(TZ);
  });

  it("disconnect revokes Google's grant and removes tokens and mirrored events", async () => {
    const g = fakeGoogle({ events: [ev("e1", "Dentist", "2026-10-29T15:00:00Z", "2026-10-29T16:00:00Z")] });
    const { run } = await connectedUser(g);
    await run((s) => syncGoogleCalendar(s, TZ, new Date("2026-10-28T15:00:00Z"), g.f));
    await run((s) => disconnectGoogle(s, g.f));
    expect(g.calls.some((c) => c.url.includes("/revoke?token=rt-1"))).toBe(true);
    expect(await run((s) => getGoogleConnection(s))).toBeNull();
    expect(await run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.source, "google")))).toHaveLength(0);
  });
});
