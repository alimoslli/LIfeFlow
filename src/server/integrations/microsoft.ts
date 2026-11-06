import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, lte, notInArray } from "drizzle-orm";
import { addDaysStr, localDateOf, startOfLocalDay } from "@/lib/dates";
import { truncate } from "@/lib/utils";
import { decryptSecret, encryptSecret } from "../crypto";
import { calendarEvents, connectionRegistry, integrations } from "../db/schema";
import { withUser, type UserScope } from "../db/with-user";
import { upsertProviderEvent } from "./calendar-upsert";
import { fetchWithTimeout, ProviderTimeout, readJson } from "./timeout";

/**
 * Microsoft 365 (Outlook calendar, which holds Teams meetings) for one LifeFlow user.
 *
 * - OAuth 2.0 authorization-code flow with PKCE and a state check, through the "common"
 *   endpoint so school, work and personal Microsoft accounts all work. Read-only calendar
 *   scope only: school admins rarely need to approve it, and LifeFlow can't change anything.
 * - Tokens are stored AES-GCM encrypted in `integrations` (provider "outlook").
 * - Mirrors the calendar into LifeFlow (source "outlook"). Teams meetings keep their join link.
 * - Talks to Microsoft Graph with fetch (no SDK); `f` is injectable for tests.
 */

export type Fetch = typeof fetch;

export const MS_OAUTH_COOKIE = "bf_ms_oauth";
export const MICROSOFT_SCOPES = ["openid", "email", "profile", "offline_access", "User.Read", "Calendars.Read"];

const GRAPH = "https://graph.microsoft.com/v1.0";
const authBase = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

export class MicrosoftError extends Error {
  constructor(
    message: string,
    public reauth = false,
  ) {
    super(message);
  }
}

type Creds = { refreshToken: string; accessToken: string; expiresAt: number; scope: string };

export function microsoftConfig(env: Record<string, string | undefined> = process.env) {
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenant: env.MICROSOFT_TENANT?.trim() || "common", appUrl: env.APP_URL?.trim().replace(/\/$/, "") || null };
}

export const msRedirectUriFor = (origin: string, appUrl: string | null) => `${appUrl ?? origin}/api/integrations/microsoft/callback`;

export function newMsOAuthState() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function msAuthUrl(o: { clientId: string; tenant: string; redirectUri: string; state: string; challenge: string; loginHint?: string }) {
  const u = new URL(`${authBase(o.tenant)}/authorize`);
  u.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(o.loginHint && { login_hint: o.loginHint }),
  }).toString();
  return u.toString();
}

/** The id_token comes straight from Microsoft's token endpoint over TLS, so its payload can be read without re-verifying. */
function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const p = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
    const e = p.email ?? p.preferred_username;
    return typeof e === "string" ? e.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function timed(f: Fetch, url: string, init: RequestInit) {
  try {
    return await fetchWithTimeout(f, url, init);
  } catch (e) {
    if (e instanceof ProviderTimeout) throw new MicrosoftError("Microsoft took too long to answer. Try again in a minute.");
    throw e;
  }
}

async function tokenRequest(params: Record<string, string>, f: Fetch, env = process.env) {
  const cfg = microsoftConfig(env);
  if (!cfg) throw new MicrosoftError("Microsoft isn't available yet.");
  const res = await timed(f, `${authBase(cfg.tenant)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: MICROSOFT_SCOPES.join(" "), ...params }),
  });
  const t = await res.json().catch(() => ({}));
  return { ok: res.ok, t };
}

export async function exchangeMsCode(code: string, verifier: string, redirectUri: string, f: Fetch = fetch, env = process.env) {
  const { ok, t } = await tokenRequest({ code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }, f, env);
  if (!ok || !t.access_token) {
    // AADSTS65001/90094: the school or workplace requires an admin to approve apps.
    const needsAdmin = /AADSTS(65001|90094|90095)/.test(String(t.error_description ?? ""));
    throw new MicrosoftError(needsAdmin ? "admin_consent" : `Microsoft sign-in failed (${t.error ?? "unknown"}).`);
  }
  if (!t.refresh_token) throw new MicrosoftError("Microsoft didn't grant offline access. Please connect again.");
  const granted = String(t.scope ?? "").toLowerCase();
  if (!granted.includes("calendars.read")) throw new MicrosoftError("Calendar access wasn't granted. Connect again and allow calendar access.");
  return {
    creds: {
      refreshToken: t.refresh_token as string,
      accessToken: t.access_token as string,
      expiresAt: Date.now() + Number(t.expires_in ?? 3600) * 1000,
      scope: String(t.scope ?? ""),
    },
    email: emailFromIdToken(t.id_token),
  };
}

export async function getMicrosoftConnection(scope: UserScope) {
  const [row] = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "outlook")));
  return row ?? null;
}

export async function saveMicrosoftConnection(scope: UserScope, creds: Creds, email: string | null) {
  const values = {
    status: "connected" as const,
    displayName: email ?? "Microsoft account",
    externalId: "me",
    encryptedCredentials: encryptSecret(JSON.stringify(creds)),
    scopes: creds.scope.split(" ").filter(Boolean),
    lastError: null,
  };
  const existing = await getMicrosoftConnection(scope);
  if (existing) await scope.tx.update(integrations).set(values).where(eq(integrations.id, existing.id));
  else {
    const [row] = await scope.tx
      .insert(integrations)
      .values({ userId: scope.userId, provider: "outlook", ...values })
      .returning({ id: integrations.id });
    await scope.tx
      .insert(connectionRegistry)
      .values({ userId: scope.userId, provider: "outlook", integrationId: row.id, externalId: "me" })
      .onConflictDoNothing();
  }
}

async function accessToken(scope: UserScope, f: Fetch, force = false): Promise<string> {
  const conn = await getMicrosoftConnection(scope);
  if (!conn?.encryptedCredentials) throw new MicrosoftError("Microsoft isn't connected. Connect it in Settings, Connected accounts.", true);
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials)) as Creds;
  if (!force && creds.expiresAt - Date.now() > 60_000) return creds.accessToken;
  const { ok, t } = await tokenRequest({ refresh_token: creds.refreshToken, grant_type: "refresh_token" }, f);
  if (!ok || !t.access_token) {
    const revoked = t.error === "invalid_grant";
    // Recorded in its own transaction: the caller's transaction rolls back when we throw.
    await withUser(scope.userId, (s2) =>
      s2.tx
        .update(integrations)
        .set({ status: "error", lastError: revoked ? "Microsoft access was removed. Reconnect Microsoft." : "Couldn't refresh Microsoft access." })
        .where(eq(integrations.id, conn.id)),
    );
    throw new MicrosoftError(
      revoked ? "Microsoft access was removed. Reconnect it in Settings, Connected accounts." : "Couldn't reach Microsoft right now.",
      revoked,
    );
  }
  // Microsoft rotates refresh tokens: keep the new one when it sends one.
  const next: Creds = {
    ...creds,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + Number(t.expires_in ?? 3600) * 1000,
  };
  await scope.tx
    .update(integrations)
    .set({ encryptedCredentials: encryptSecret(JSON.stringify(next)), status: "connected", lastError: null })
    .where(eq(integrations.id, conn.id));
  return next.accessToken;
}

/** Authorized GET to Microsoft Graph, refreshing the token once on 401. */
async function graph<T>(scope: UserScope, url: string, headers: Record<string, string>, f: Fetch): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(scope, f, attempt > 0);
    const res = await timed(f, url, { headers: { ...headers, authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) continue;
    const body = await readJson(res, (m) => new MicrosoftError(m));
    if (!res.ok) throw new MicrosoftError(`Microsoft returned an error (${res.status}${body?.error?.code ? `: ${truncate(body.error.code, 80)}` : ""}).`);
    return body as T;
  }
  throw new MicrosoftError("Microsoft rejected the request.", true);
}

// ---------------------------------------------------------------------------
// Calendar (Outlook + Teams meetings)

export type MsEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
};

/** Graph times are "YYYY-MM-DDTHH:mm:ss.0000000" in the zone we asked for (UTC). */
function graphInstant(t: { dateTime?: string } | undefined) {
  const s = (t?.dateTime ?? "").replace(/(\.\d{3})\d*$/, "$1");
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
}

/** Start, end and all-day for an event. All-day events cover whole local days in the user's zone. */
export function msEventTimes(e: MsEvent, tz: string) {
  if (e.isAllDay) {
    // All-day events start and end at midnight in the event's own zone; the date part is the day.
    const startDay = (e.start?.dateTime ?? "").slice(0, 10);
    const endDay = (e.end?.dateTime ?? "").slice(0, 10) || addDaysStr(startDay, 1);
    return { startsAt: startOfLocalDay(startDay, tz), endsAt: startOfLocalDay(endDay, tz), allDay: true };
  }
  return { startsAt: graphInstant(e.start), endsAt: graphInstant(e.end ?? e.start), allDay: false };
}

const isTeams = (e: MsEvent) => !!e.isOnlineMeeting && (e.onlineMeetingProvider ?? "teamsForBusiness").toLowerCase().includes("teams");

export async function listMicrosoftEvents(scope: UserScope, from: Date, to: Date, f: Fetch = fetch) {
  const out: MsEvent[] = [];
  const select = "id,subject,bodyPreview,isAllDay,isCancelled,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,location,start,end";
  let url: string | undefined =
    `${GRAPH}/me/calendarView?` +
    new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $select: select, $top: "100", $orderby: "start/dateTime" });
  const headers = { prefer: 'outlook.timezone="UTC"' };
  while (url && out.length < 2000) {
    const page: { value?: MsEvent[]; "@odata.nextLink"?: string } = await graph(scope, url, headers, f);
    out.push(...(page.value ?? []).filter((e) => !e.isCancelled));
    url = page["@odata.nextLink"];
  }
  return out;
}

/**
 * Mirrors the past week and next 60 days of the user's Microsoft calendar into LifeFlow, so
 * classes, meetings and Teams calls show in Plan, Today and conflict checks. Microsoft stays the
 * source of truth: changes and deletions there win.
 */
export async function syncMicrosoftCalendar(scope: UserScope, tz: string, now = new Date(), f: Fetch = fetch) {
  const today = localDateOf(now, tz);
  const from = startOfLocalDay(addDaysStr(today, -7), tz);
  const to = startOfLocalDay(addDaysStr(today, 60), tz);
  const events = await listMicrosoftEvents(scope, from, to, f);
  const ids: string[] = [];
  let added = 0;
  let updated = 0;
  for (const e of events) {
    const t = msEventTimes(e, tz);
    if (Number.isNaN(t.startsAt.getTime()) || Number.isNaN(t.endsAt.getTime())) continue;
    ids.push(e.id);
    const teams = isTeams(e);
    const join = e.onlineMeeting?.joinUrl && /^https:\/\//.test(e.onlineMeeting.joinUrl) ? e.onlineMeeting.joinUrl : null;
    const notes = [join ? `Join the Teams meeting: ${join}` : null, e.bodyPreview?.trim() || null].filter(Boolean).join("\n\n");
    const values = {
      title: truncate(e.subject || (teams ? "Teams meeting" : "(No title)"), 300),
      description: notes ? truncate(notes, 5000) : null,
      location: e.location?.displayName?.trim() || (teams ? "Microsoft Teams" : null),
      ...t,
    };
    const r = await upsertProviderEvent(scope, "outlook", e.id, values);
    if (r.added) added++;
    else updated++;
  }
  const stale = await scope.tx
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, scope.userId),
        eq(calendarEvents.source, "outlook"),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        ...(ids.length ? [notInArray(calendarEvents.providerEventId, ids)] : []),
      ),
    )
    .returning({ id: calendarEvents.id });
  await scope.tx
    .update(integrations)
    .set({ lastSyncedAt: now, lastError: null, status: "connected" })
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "outlook")));
  return { added, updated, removed: stale.length, total: ids.length };
}

/** Disconnects: removes stored tokens and mirrored events. (Microsoft has no token-revoke endpoint for this flow;
 * the user can also remove LifeFlow at account.microsoft.com or myapps.microsoft.com.) */
export async function disconnectMicrosoft(scope: UserScope) {
  const conn = await getMicrosoftConnection(scope);
  if (!conn) return;
  await scope.tx.delete(calendarEvents).where(and(eq(calendarEvents.userId, scope.userId), eq(calendarEvents.source, "outlook")));
  await scope.tx.delete(integrations).where(eq(integrations.id, conn.id));
}
