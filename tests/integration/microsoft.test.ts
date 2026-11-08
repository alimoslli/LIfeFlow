import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { calendarEvents, connectionRegistry, integrations } from "@/server/db/schema";
import {
  disconnectMicrosoft,
  exchangeMsCode,
  getMicrosoftConnection,
  msAuthUrl,
  msEventTimes,
  newMsOAuthState,
  saveMicrosoftConnection,
  syncMicrosoftCalendar,
} from "@/server/integrations/microsoft";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.MICROSOFT_CLIENT_ID = "ms-client";
  process.env.MICROSOFT_CLIENT_SECRET = "ms-secret";
});

const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A small stand-in for Microsoft's token endpoint and Graph calendarView. */
function fakeMicrosoft(pages: object[][]) {
  const calls: { url: string; auth?: string; prefer?: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const h = new Headers(init?.headers);
    calls.push({ url, auth: h.get("authorization") ?? undefined, prefer: h.get("prefer") ?? undefined });
    if (url.includes("/oauth2/v2.0/token"))
      return json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600, scope: "openid email profile offline_access User.Read Calendars.Read" });
    if (url.includes("/me/calendarView")) {
      const page = url.includes("skip=1") ? 1 : 0;
      return json({
        value: pages[page] ?? [],
        ...(page === 0 && pages.length > 1 ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?skip=1" } : {}),
      });
    }
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

const creds = { refreshToken: "rt-1", accessToken: "at-1", expiresAt: Date.now() + 3_600_000, scope: "Calendars.Read" };

describe("Microsoft Teams and Outlook", () => {
  it("asks only for read-only calendar access, with PKCE and state", () => {
    const { state, challenge } = newMsOAuthState();
    const u = new URL(msAuthUrl({ clientId: "ms-client", tenant: "common", redirectUri: "https://x.test/cb", state, challenge }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(u.searchParams.get("scope")).toBe("openid email profile offline_access User.Read Calendars.Read");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(state);
  });

  it("exchanges the code, needs calendar access, and explains when a school must approve", async () => {
    const ok = (async () =>
      json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
        scope: "Calendars.Read User.Read",
        id_token: idToken({ preferred_username: "Maya@School.edu" }),
      })) as typeof fetch;
    const r = await exchangeMsCode("code", "verifier", "https://x.test/cb", ok);
    expect(r.email).toBe("maya@school.edu");
    expect(r.creds.refreshToken).toBe("r");

    const noCal = (async () => json({ access_token: "a", refresh_token: "r", scope: "User.Read" })) as typeof fetch;
    await expect(exchangeMsCode("code", "v", "https://x.test/cb", noCal)).rejects.toThrow(/Calendar access/);

    const admin = (async () =>
      json({ error: "invalid_grant", error_description: "AADSTS65001: The user or administrator has not consented" }, 400)) as typeof fetch;
    await expect(exchangeMsCode("code", "v", "https://x.test/cb", admin)).rejects.toThrow("admin_consent");
  });

  it("reads Graph times as UTC and all-day events as whole local days", () => {
    expect(msEventTimes({ id: "1", start: { dateTime: "2026-11-03T15:00:00.0000000" }, end: { dateTime: "2026-11-03T16:00:00.0000000" } }, TZ)).toMatchObject({
      startsAt: new Date("2026-11-03T15:00:00.000Z"),
      endsAt: new Date("2026-11-03T16:00:00.000Z"),
      allDay: false,
    });
    const allDay = msEventTimes(
      { id: "2", isAllDay: true, start: { dateTime: "2026-11-04T00:00:00.0000000" }, end: { dateTime: "2026-11-05T00:00:00.0000000" } },
      TZ,
    );
    expect(allDay.allDay).toBe(true);
    expect(allDay.endsAt.getTime() - allDay.startsAt.getTime()).toBe(86_400_000);
  });

  it("mirrors the calendar with Teams join links, follows pages, removes deleted events, then disconnects cleanly", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, creds, "maya@school.edu"));
    const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().replace("Z", "0000");
    const teams = {
      id: "m1",
      subject: "Group project sync",
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" },
      start: { dateTime: soon(24) },
      end: { dateTime: soon(25) },
    };
    const lecture = { id: "m2", subject: "BIO 101", location: { displayName: "Hall 204" }, start: { dateTime: soon(48) }, end: { dateTime: soon(49) } };
    const cancelled = { id: "m3", subject: "Cancelled", isCancelled: true, start: { dateTime: soon(30) }, end: { dateTime: soon(31) } };
    const { f, calls } = fakeMicrosoft([[teams, cancelled], [lecture]]);
    const r = await u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), f));
    expect(r).toMatchObject({ added: 2, total: 2 });
    expect(calls.find((c) => c.url.includes("calendarView"))?.prefer).toBe('outlook.timezone="UTC"');

    const rows = await u.run(({ tx, userId }) =>
      tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.source, "outlook"))),
    );
    const meeting = rows.find((e) => e.providerEventId === "m1")!;
    expect(meeting.location).toBe("Microsoft Teams");
    expect(meeting.description).toContain("https://teams.microsoft.com/l/meetup-join/abc");
    expect(rows.find((e) => e.providerEventId === "m2")?.location).toBe("Hall 204");

    // The lecture was deleted in Outlook: the next sync removes it here too.
    const again = fakeMicrosoft([[teams]]);
    const r2 = await u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), again.f));
    expect(r2).toMatchObject({ updated: 1, removed: 1, total: 1 });

    await u.run((s) => disconnectMicrosoft(s));
    expect(await u.run((s) => getMicrosoftConnection(s))).toBeNull();
    const left = await u.run(({ tx, userId }) =>
      tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.source, "outlook"))),
    );
    expect(left).toHaveLength(0);
    const reg = await u.run(({ tx, userId }) =>
      tx
        .select()
        .from(connectionRegistry)
        .where(and(eq(connectionRegistry.userId, userId), eq(connectionRegistry.provider, "outlook"))),
    );
    expect(reg).toHaveLength(0);
  });

  it("refreshes an expired token, keeping Microsoft's rotated refresh token", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() - 1000 }, null));
    const { f, calls } = fakeMicrosoft([[]]);
    await u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), f));
    expect(calls[0].url).toContain("/oauth2/v2.0/token");
    expect(calls.find((c) => c.url.includes("calendarView"))?.auth).toBe("Bearer at-2");
    const conn = await u.run(({ tx, userId }) =>
      tx
        .select()
        .from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "outlook"))),
    );
    expect(conn[0].status).toBe("connected");
  });
  it("when Microsoft says the person must sign in again, the connection shows Reconnect", async () => {
    for (const error of ["invalid_grant", "interaction_required", "consent_required"]) {
      const u = await makeUser();
      await u.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() - 1000 }, null));
      const f = (async () => json({ error, error_description: "AADSTS50173" }, 400)) as typeof fetch;
      await expect(u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), f))).rejects.toMatchObject({
        reauth: true,
        message: expect.stringMatching(/Reconnect/),
      });
      const [conn] = await u.run(({ tx, userId }) =>
        tx
          .select()
          .from(integrations)
          .where(and(eq(integrations.userId, userId), eq(integrations.provider, "outlook"))),
      );
      expect(conn).toMatchObject({ status: "error", lastError: expect.stringMatching(/Reconnect/) });
    }
  });

  it("a temporary Microsoft problem on refresh does not ask the person to reconnect", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() - 1000 }, null));
    const f = (async () => json({ error: "temporarily_unavailable" }, 503)) as typeof fetch;
    await expect(u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), f))).rejects.toMatchObject({ reauth: false });
  });

  it("retries once with a fresh token when Graph answers 401", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, creds, null));
    let graphCalls = 0;
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return json({ access_token: "at-fresh", refresh_token: "rt-3", expires_in: 3600, scope: "Calendars.Read" });
      calls.push(new Headers(init?.headers).get("authorization") ?? "");
      return graphCalls++ === 0 ? json({ error: { code: "InvalidAuthenticationToken" } }, 401) : json({ value: [] });
    }) as typeof fetch;
    await u.run((s) => syncMicrosoftCalendar(s, TZ, new Date(), f));
    expect(calls).toEqual(["Bearer at-1", "Bearer at-fresh"]);
  });
});
