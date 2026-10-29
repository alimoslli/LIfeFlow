import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, lte, notInArray } from "drizzle-orm";
import { addDaysStr, localDateOf, localToInstant, startOfLocalDay } from "@/lib/dates";
import { truncate } from "@/lib/utils";
import { decryptSecret, encryptSecret } from "../crypto";
import { calendarEvents, connectionRegistry, integrations } from "../db/schema";
import { withUser, type UserScope } from "../db/with-user";

/**
 * Google (Gmail + Google Calendar) for one LifeFlow user.
 *
 * - OAuth 2.0 authorization-code flow with PKCE and a state check; offline
 *   access so the assistant can work later without the user re-signing in.
 * - Tokens are stored AES-GCM encrypted in `integrations` (provider "google").
 * - Talks to Google's REST APIs with fetch (no SDK); `f` is injectable for tests.
 * - Email content returned to the assistant is wrapped as untrusted data.
 */

export type Fetch = typeof fetch;

/** Short-lived cookie holding the OAuth state + PKCE verifier between start and callback. */
export const OAUTH_COOKIE = "bf_g_oauth";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

export class GoogleError extends Error {
  constructor(
    message: string,
    public reauth = false,
  ) {
    super(message);
  }
}

type Creds = { refreshToken: string; accessToken: string; expiresAt: number; scope: string };

export function googleConfig(env: Record<string, string | undefined> = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, appUrl: env.APP_URL?.trim().replace(/\/$/, "") || null } : null;
}

export const redirectUriFor = (origin: string, appUrl: string | null) => `${appUrl ?? origin}/api/integrations/google/callback`;

export function newOAuthState() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function authUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string; loginHint?: string }) {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    ...(o.loginHint && { login_hint: o.loginHint }),
  }).toString();
  return u.toString();
}

/** The id_token comes straight from Google's token endpoint over TLS, so its payload can be read without re-verifying the signature. */
function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string, f: Fetch = fetch, env = process.env) {
  const cfg = googleConfig(env);
  if (!cfg) throw new GoogleError("Google isn't available yet.");
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new GoogleError(`Google sign-in failed (${t.error ?? res.status}).`);
  if (!t.refresh_token) throw new GoogleError("Google didn't grant offline access. Please connect again.");
  const granted = String(t.scope ?? "").split(" ");
  const missing = GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
  if (missing.length) throw new GoogleError("Some permissions weren't granted. Connect again and keep all boxes checked.");
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

export async function saveGoogleConnection(scope: UserScope, creds: Creds, email: string | null) {
  const values = {
    status: "connected" as const,
    displayName: email ?? "Google account",
    externalId: "primary",
    encryptedCredentials: encryptSecret(JSON.stringify(creds)),
    scopes: creds.scope.split(" ").filter(Boolean),
    lastError: null,
  };
  const existing = await getGoogleConnection(scope);
  if (existing) await scope.tx.update(integrations).set(values).where(eq(integrations.id, existing.id));
  else {
    const [row] = await scope.tx
      .insert(integrations)
      .values({ userId: scope.userId, provider: "google", ...values })
      .returning({ id: integrations.id });
    await scope.tx
      .insert(connectionRegistry)
      .values({ userId: scope.userId, provider: "google", integrationId: row.id, externalId: "primary" })
      .onConflictDoNothing();
  }
}

export async function getGoogleConnection(scope: UserScope) {
  const [row] = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "google")));
  return row ?? null;
}

async function accessToken(scope: UserScope, f: Fetch, force = false): Promise<string> {
  const conn = await getGoogleConnection(scope);
  if (!conn?.encryptedCredentials) throw new GoogleError("Google isn't connected. Connect it in Settings, Integrations.", true);
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials)) as Creds;
  if (!force && creds.expiresAt - Date.now() > 60_000) return creds.accessToken;
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("Google isn't available yet.");
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) {
    const revoked = t.error === "invalid_grant";
    // Recorded in its own transaction: the caller's transaction rolls back when we throw.
    await withUser(scope.userId, (s2) =>
      s2.tx
        .update(integrations)
        .set({ status: "error", lastError: revoked ? "Google access was removed. Reconnect Google." : "Couldn't refresh Google access." })
        .where(eq(integrations.id, conn.id)),
    );
    throw new GoogleError(revoked ? "Google access was removed. Reconnect Google in Settings, Integrations." : "Couldn't reach Google right now.", revoked);
  }
  const next: Creds = { ...creds, accessToken: t.access_token, expiresAt: Date.now() + Number(t.expires_in ?? 3600) * 1000 };
  await scope.tx
    .update(integrations)
    .set({ encryptedCredentials: encryptSecret(JSON.stringify(next)), status: "connected", lastError: null })
    .where(eq(integrations.id, conn.id));
  return next.accessToken;
}

/** Authorized JSON request to a Google API, refreshing the token once on 401. */
async function api<T>(scope: UserScope, url: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(scope, f, attempt > 0);
    const res = await f(url, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new GoogleError(`Google returned an error (${res.status}${body?.error?.message ? `: ${truncate(body.error.message, 120)}` : ""}).`);
    return body as T;
  }
  throw new GoogleError("Google rejected the request.", true);
}

// ---------------------------------------------------------------------------
// Gmail

type GmailHeader = { name: string; value: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: GmailHeader[] };
type GmailMessage = { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: GmailPart };

const header = (m: GmailMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const decode = (data?: string) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");

/** Prefers text/plain; falls back to text/html with tags stripped. */
export function messageText(part: GmailPart | undefined): string {
  if (!part) return "";
  const find = (p: GmailPart, type: string): string | null => {
    if (p.mimeType === type && p.body?.data) return decode(p.body.data);
    for (const c of p.parts ?? []) {
      const r = find(c, type);
      if (r) return r;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain;
  const html = find(part, "text/html") ?? "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const summary = (m: GmailMessage) => ({
  id: m.id,
  threadId: m.threadId,
  from: header(m, "From"),
  subject: header(m, "Subject"),
  date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : header(m, "Date"),
  unread: m.labelIds?.includes("UNREAD") ?? false,
  snippet: m.snippet ?? "",
});

/** Gmail search (same syntax as the Gmail search box). */
export async function searchEmail(scope: UserScope, query: string, max = 10, f: Fetch = fetch) {
  const q = new URLSearchParams({ q: query, maxResults: String(Math.min(Math.max(max, 1), 25)) });
  const list = await api<{ messages?: { id: string }[] }>(scope, `${GMAIL}/messages?${q}`, {}, f);
  const out = [];
  for (const { id } of list.messages ?? []) {
    const m = await api<GmailMessage>(
      scope,
      `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      {},
      f,
    );
    out.push(summary(m));
  }
  return out;
}

export async function readEmail(scope: UserScope, id: string, f: Fetch = fetch) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new GoogleError("That doesn't look like a Gmail message id.");
  const m = await api<GmailMessage>(scope, `${GMAIL}/messages/${id}?format=full`, {}, f);
  return { ...summary(m), to: header(m, "To"), cc: header(m, "Cc"), body: truncate(messageText(m.payload), 20_000) };
}

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function parseRecipients(to: string): string[] {
  const list = to
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.match(/<([^>]+)>/)?.[1] ?? x);
  if (!list.length) throw new GoogleError("Add at least one recipient.");
  if (list.length > 10) throw new GoogleError("Up to 10 recipients at a time.");
  for (const a of list) if (!EMAIL.test(a)) throw new GoogleError(`"${truncate(a, 60)}" isn't a valid email address.`);
  return list;
}

/** RFC 2822 message, base64url-encoded for the Gmail API. Header values can't smuggle extra headers. */
export function buildRawEmail(o: { to: string[]; subject: string; body: string; inReplyTo?: string; references?: string }) {
  const lines = [
    `To: ${o.to.join(", ")}`,
    `Subject: ${encodeHeader(clean(o.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(o.inReplyTo ? [`In-Reply-To: ${clean(o.inReplyTo)}`, `References: ${clean(o.references ?? o.inReplyTo)}`] : []),
    "",
    Buffer.from(o.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

async function replyHeaders(scope: UserScope, replyToId: string | undefined, f: Fetch) {
  if (!replyToId) return {};
  const m = await api<GmailMessage>(scope, `${GMAIL}/messages/${replyToId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, {}, f);
  const mid = header(m, "Message-ID");
  return { threadId: m.threadId, inReplyTo: mid || undefined, references: [header(m, "References"), mid].filter(Boolean).join(" ") || undefined };
}

/** Creates a real Gmail draft the user can review in Gmail. Nothing is sent. */
export async function createDraft(scope: UserScope, o: { to: string; subject: string; body: string; replyToId?: string }, f: Fetch = fetch) {
  const to = parseRecipients(o.to);
  const r = await replyHeaders(scope, o.replyToId, f);
  const raw = buildRawEmail({ to, subject: o.subject, body: o.body, inReplyTo: r.inReplyTo, references: r.references });
  const d = await api<{ id: string; message: { id: string; threadId: string } }>(
    scope,
    `${GMAIL}/drafts`,
    { method: "POST", body: JSON.stringify({ message: { raw, ...(r.threadId && { threadId: r.threadId }) } }) },
    f,
  );
  return { draftId: d.id, messageId: d.message?.id, to, subject: o.subject };
}

/** Sends an email. Only ever called after the user pressed Confirm. Returns Gmail's confirmation. */
export async function sendEmail(scope: UserScope, o: { to: string; subject: string; body: string; replyToId?: string }, f: Fetch = fetch) {
  const to = parseRecipients(o.to);
  const r = await replyHeaders(scope, o.replyToId, f);
  const raw = buildRawEmail({ to, subject: o.subject, body: o.body, inReplyTo: r.inReplyTo, references: r.references });
  const sent = await api<{ id: string; threadId: string; labelIds?: string[] }>(
    scope,
    `${GMAIL}/messages/send`,
    { method: "POST", body: JSON.stringify({ raw, ...(r.threadId && { threadId: r.threadId }) }) },
    f,
  );
  if (!sent?.id) throw new GoogleError("Gmail didn't confirm the message was sent.");
  return { sent: true, gmailMessageId: sent.id, to, subject: o.subject };
}

// ---------------------------------------------------------------------------
// Google Calendar

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function eventTimes(e: GEvent, tz: string) {
  if (e.start?.date) {
    const end = e.end?.date ?? addDaysStr(e.start.date, 1);
    return { startsAt: startOfLocalDay(e.start.date, tz), endsAt: startOfLocalDay(end, tz), allDay: true };
  }
  const startsAt = new Date(e.start?.dateTime ?? "");
  const endsAt = new Date(e.end?.dateTime ?? e.start?.dateTime ?? "");
  return { startsAt, endsAt, allDay: false };
}

export async function listGoogleEvents(scope: UserScope, timeMin: Date, timeMax: Date, f: Fetch = fetch) {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      ...(pageToken && { pageToken }),
    });
    const page = await api<{ items?: GEvent[]; nextPageToken?: string }>(scope, `${CAL}/events?${q}`, {}, f);
    out.push(...(page.items ?? []).filter((e) => e.status !== "cancelled"));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out;
}

/**
 * Mirrors the next 60 days (and the past week) of the user's primary Google
 * Calendar into LifeFlow, so it shows in Plan, Today and conflict checks.
 * Google stays the source of truth: changes and deletions there win.
 */
export async function syncGoogleCalendar(scope: UserScope, tz: string, now = new Date(), f: Fetch = fetch) {
  const today = localDateOf(now, tz);
  const from = startOfLocalDay(addDaysStr(today, -7), tz);
  const to = startOfLocalDay(addDaysStr(today, 60), tz);
  const events = (await listGoogleEvents(scope, from, to, f)).filter((e) => e.start && (e.start.date || e.start.dateTime));
  const ids: string[] = [];
  let added = 0;
  let updated = 0;
  for (const e of events) {
    const t = eventTimes(e, tz);
    if (Number.isNaN(t.startsAt.getTime()) || Number.isNaN(t.endsAt.getTime())) continue;
    ids.push(e.id);
    const values = {
      title: truncate(e.summary || "(No title)", 300),
      description: e.description ? truncate(e.description, 5000) : null,
      location: e.location ?? null,
      ...t,
    };
    const [existing] = await scope.tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, scope.userId), eq(calendarEvents.source, "google"), eq(calendarEvents.providerEventId, e.id)));
    if (existing) {
      await scope.tx.update(calendarEvents).set(values).where(eq(calendarEvents.id, existing.id));
      updated++;
    } else {
      await scope.tx.insert(calendarEvents).values({ userId: scope.userId, source: "google", providerEventId: e.id, kind: "personal", ...values });
      added++;
    }
  }
  const stale = await scope.tx
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, scope.userId),
        eq(calendarEvents.source, "google"),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        ...(ids.length ? [notInArray(calendarEvents.providerEventId, ids)] : []),
      ),
    )
    .returning({ id: calendarEvents.id });
  await scope.tx
    .update(integrations)
    .set({ lastSyncedAt: now, lastError: null, status: "connected" })
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "google")));
  return { added, updated, removed: stale.length, total: ids.length };
}

/** Adds an event to the user's Google Calendar (after they confirm), then mirrors it locally. */
export async function addGoogleEvent(
  scope: UserScope,
  tz: string,
  o: { title: string; date: string; startTime?: string; endTime?: string; allDay?: boolean; location?: string; description?: string },
  f: Fetch = fetch,
) {
  const allDay = o.allDay || !o.startTime;
  const body = allDay
    ? { summary: o.title, location: o.location, description: o.description, start: { date: o.date }, end: { date: addDaysStr(o.date, 1) } }
    : {
        summary: o.title,
        location: o.location,
        description: o.description,
        start: { dateTime: localToInstant(o.date, o.startTime, tz).toISOString(), timeZone: tz },
        end: { dateTime: localToInstant(o.date, o.endTime ?? o.startTime, tz).toISOString(), timeZone: tz },
      };
  const created = await api<GEvent & { htmlLink?: string }>(scope, `${CAL}/events`, { method: "POST", body: JSON.stringify(body) }, f);
  if (!created?.id) throw new GoogleError("Google Calendar didn't confirm the event.");
  const t = eventTimes(created, tz);
  await scope.tx
    .insert(calendarEvents)
    .values({ userId: scope.userId, source: "google", providerEventId: created.id, kind: "personal", title: o.title, location: o.location ?? null, ...t });
  return { googleEventId: created.id, htmlLink: created.htmlLink ?? null };
}

/** Disconnects: revokes Google's grant, removes stored tokens and mirrored events. */
export async function disconnectGoogle(scope: UserScope, f: Fetch = fetch) {
  const conn = await getGoogleConnection(scope);
  if (!conn) return;
  try {
    const creds = conn.encryptedCredentials ? (JSON.parse(decryptSecret(conn.encryptedCredentials)) as Creds) : null;
    if (creds) await f(`${REVOKE_URL}?token=${encodeURIComponent(creds.refreshToken)}`, { method: "POST" });
  } catch {
    // Revocation is best effort; local tokens are deleted either way.
  }
  await scope.tx.delete(calendarEvents).where(and(eq(calendarEvents.userId, scope.userId), eq(calendarEvents.source, "google")));
  await scope.tx.delete(integrations).where(eq(integrations.id, conn.id));
}
