import { and, eq } from "drizzle-orm";
import { addDaysStr, localToInstant, startOfLocalDay, todayIn } from "@/lib/dates";
import { parseIcs, type IcsTime } from "@/lib/ics";
import { decryptSecret, encryptSecret } from "../crypto";
import { assignments, calendarEvents, connectionRegistry, courses, integrations, type AssignmentKind } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "../services/errors";

/**
 * Canvas (ADR 0019): two ways in, both read-only (we never submit, post or change
 * anything in Canvas), and Canvas text is untrusted data.
 * - The Calendar Feed link every student can copy (Calendar → Calendar Feed). No
 *   school permission needed. Gives assignments with due dates and class events.
 * - A personal access token, where the school allows them. Gives full course lists.
 */
type Creds = { baseUrl: string; token?: string; feedUrl?: string };
type Fetch = typeof fetch;

export function canvasBaseUrl(raw: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (!["https:", "http:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return `https://${u.hostname}`;
  } catch {
    return null;
  }
}

async function get<T>(c: Creds, path: string, f: Fetch, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${c.baseUrl}${path}`;
  for (let page = 0; url && page < maxPages; page++) {
    const res: Response | null = await f(url, { headers: { authorization: `Bearer ${c.token}`, accept: "application/json" } }).catch(() => null);
    if (!res) throw new ServiceError("Couldn't reach Canvas. Check the address and try again.");
    if (res.status === 401) throw new ServiceError("Canvas didn't accept that access token. Make a new one and connect again.");
    if (!res.ok) throw new ServiceError(`Canvas answered with an error (${res.status}).`);
    const body = (await res.json()) as T | T[];
    out.push(...(Array.isArray(body) ? body : [body]));
    url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    if (url && !url.startsWith(c.baseUrl)) url = null; // never follow links off the school's Canvas
  }
  return out;
}

type CanvasCourse = { id: number; name?: string; course_code?: string; workflow_state?: string; access_restricted_by_date?: boolean };
type CanvasAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url?: string;
  submission_types?: string[];
  published?: boolean;
};

export function canvasKind(a: { name: string; submission_types?: string[] }): AssignmentKind {
  const t = a.submission_types ?? [];
  if (/\b(exam|midterm|final)\b/i.test(a.name)) return "exam";
  if (t.includes("online_quiz") || /\bquiz\b/i.test(a.name)) return "quiz";
  if (t.includes("discussion_topic")) return "discussion";
  if (/\blab\b/i.test(a.name)) return "lab";
  if (/\bproject\b/i.test(a.name)) return "project";
  return "assignment";
}

async function getConnection(scope: UserScope) {
  const [row] = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "canvas")));
  return row ?? null;
}

/** Checks the token against Canvas, then stores it encrypted. */
export async function connectCanvas(scope: UserScope, rawUrl: string, token: string, f: Fetch = fetch) {
  const baseUrl = canvasBaseUrl(rawUrl);
  if (!baseUrl) throw new ServiceError("Enter your school's Canvas address, like canvas.myschool.edu.");
  if (token.trim().length < 20) throw new ServiceError("Paste the whole access token from Canvas.");
  const creds = { baseUrl, token: token.trim() };
  const [me] = await get<{ name?: string }>(creds, "/api/v1/users/self", f, 1);
  return { name: me?.name ?? null, host: await saveConnection(scope, creds) };
}

/** The Calendar Feed link, like https://school.instructure.com/feeds/calendars/user_abc123.ics (webcal:// works too). */
export function canvasFeedUrl(raw: string) {
  try {
    const u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      u.port ||
      u.username ||
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      host.endsWith(".local") ||
      host === "localhost"
    )
      return null;
    if (!/^\/feeds\/calendars\/user_[A-Za-z0-9_-]{16,}\.ics$/.test(u.pathname)) return null;
    return `https://${host}${u.pathname}`;
  } catch {
    return null;
  }
}

const MAX_FEED_BYTES = 5_000_000;
async function fetchFeed(url: string, f: Fetch) {
  const res = await f(url, { headers: { accept: "text/calendar" }, redirect: "error" }).catch(() => null);
  if (!res) throw new ServiceError("Couldn't reach Canvas. Check the feed link and try again.");
  if (res.status === 401 || res.status === 404) throw new ServiceError("Canvas didn't recognise that feed link. Copy it again from Calendar → Calendar Feed.");
  if (!res.ok) throw new ServiceError(`Canvas answered with an error (${res.status}).`);
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new ServiceError("That calendar feed is too large to read.");
  if (!text.includes("BEGIN:VCALENDAR")) throw new ServiceError("That link isn't a Canvas calendar feed. Copy it from Calendar → Calendar Feed.");
  return text;
}

/** Checks the feed link works, then stores it encrypted (anyone with the link can read the calendar). */
export async function connectCanvasFeed(scope: UserScope, raw: string, f: Fetch = fetch) {
  const feedUrl = canvasFeedUrl(raw);
  if (!feedUrl) throw new ServiceError("Paste the Calendar Feed link from Canvas. It ends in .ics.");
  await fetchFeed(feedUrl, f);
  return { name: null, host: await saveConnection(scope, { baseUrl: `https://${new URL(feedUrl).hostname}`, feedUrl }) };
}

async function saveConnection(scope: UserScope, creds: Creds) {
  const baseUrl = creds.baseUrl;
  const values = {
    status: "connected" as const,
    displayName: new URL(baseUrl).hostname,
    externalId: baseUrl,
    encryptedCredentials: encryptSecret(JSON.stringify(creds)),
    lastError: null,
  };
  const existing = await getConnection(scope);
  if (existing) await scope.tx.update(integrations).set(values).where(eq(integrations.id, existing.id));
  else {
    const [row] = await scope.tx
      .insert(integrations)
      .values({ userId: scope.userId, provider: "canvas", ...values })
      .returning({ id: integrations.id });
    await scope.tx
      .insert(connectionRegistry)
      .values({ userId: scope.userId, provider: "canvas", integrationId: row.id, externalId: baseUrl })
      .onConflictDoNothing();
  }
  return values.displayName;
}

export async function disconnectCanvas(scope: UserScope) {
  await scope.tx.delete(integrations).where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "canvas")));
}

/** Pulls classes and assignments. Canvas ids keep it idempotent: a changed due date updates, nothing duplicates. */
export async function syncCanvas(scope: UserScope, f: Fetch = fetch, tz = "UTC") {
  const conn = await getConnection(scope);
  if (!conn?.encryptedCredentials) throw new ServiceError("Canvas isn't connected.");
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials)) as Creds;
  const result = creds.feedUrl
    ? await syncFeed(scope, creds as Creds & { feedUrl: string }, f, tz)
    : await syncApi(scope, creds as Creds & { token: string }, f);
  await scope.tx.update(integrations).set({ status: "connected", lastSyncedAt: new Date(), lastError: null }).where(eq(integrations.id, conn.id));
  return result;
}

async function syncApi(scope: UserScope, creds: Creds & { token: string }, f: Fetch) {
  const list = (await get<CanvasCourse>(creds, "/api/v1/courses?enrollment_state=active&per_page=50", f)).filter((c) => c.name && !c.access_restricted_by_date);
  let newCourses = 0;
  let saved = 0;
  for (const c of list) {
    const [existing] = await scope.tx
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.userId, scope.userId), eq(courses.source, "canvas"), eq(courses.providerCourseId, String(c.id))));
    let courseId = existing?.id;
    if (!courseId) {
      const [row] = await scope.tx
        .insert(courses)
        .values({
          userId: scope.userId,
          name: c.name!.slice(0, 200),
          code: c.course_code?.slice(0, 40) ?? null,
          source: "canvas",
          providerCourseId: String(c.id),
          url: `${creds.baseUrl}/courses/${c.id}`,
        })
        .returning({ id: courses.id });
      courseId = row.id;
      newCourses++;
    }
    const work = await get<CanvasAssignment>(creds, `/api/v1/courses/${c.id}/assignments?per_page=100&order_by=due_at`, f);
    for (const a of work.filter((x) => x.published !== false)) {
      const fields = {
        title: a.name.slice(0, 300),
        kind: canvasKind(a),
        dueAt: a.due_at ? new Date(a.due_at) : null,
        dueAllDay: false,
        pointsPossible: a.points_possible != null ? String(a.points_possible) : null,
        url: a.html_url?.startsWith(creds.baseUrl) ? a.html_url : null,
      };
      await scope.tx
        .insert(assignments)
        .values({ userId: scope.userId, courseId, ...fields, source: "canvas", providerAssignmentId: String(a.id), dedupeKey: `canvas:${a.id}` })
        .onConflictDoUpdate({ target: [assignments.userId, assignments.dedupeKey], set: fields });
      saved++;
    }
  }
  return { courses: list.length, newCourses, assignments: saved, events: 0 };
}

const validTz = (z: string | null) => {
  if (!z) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return null;
  }
};
const instant = (t: IcsTime, tz: string) => (t.utc ? new Date(`${t.date}T${t.time}:00Z`) : localToInstant(t.date, t.time ?? null, validTz(t.tzid) ?? tz)); // all-day: due 11:59 PM that day

/**
 * The Calendar Feed: assignments (UID "event-assignment-<id>") become assignments with
 * the same dedupe key as the token sync, so both ways agree; class events
 * ("event-calendar-event-<id>") in the next 120 days become calendar events.
 * Work already due before today isn't added (the feed can't say if it was handed in),
 * but an existing row still gets its due date updated.
 */
async function syncFeed(scope: UserScope, creds: Creds & { feedUrl: string }, f: Fetch, tz: string) {
  const events = parseIcs(await fetchFeed(creds.feedUrl, f));
  const today = todayIn(tz);
  const from = startOfLocalDay(today, tz);
  const until = startOfLocalDay(addDaysStr(today, 120), tz);
  const known = await scope.tx
    .select({ id: courses.id, name: courses.name, code: courses.code, ref: courses.providerCourseId })
    .from(courses)
    .where(eq(courses.userId, scope.userId));
  const seen = new Set<string>();
  let newCourses = 0;
  let saved = 0;
  let added = 0;

  const courseFor = async (ref: string | null, label: string | null) => {
    const name = (label ?? "Canvas").slice(0, 200);
    const hit =
      (ref && known.find((c) => c.ref === ref)) ||
      known.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.code?.toLowerCase() === name.toLowerCase());
    if (hit) {
      seen.add(hit.id);
      return hit.id;
    }
    const [row] = await scope.tx
      .insert(courses)
      .values({ userId: scope.userId, name, source: "canvas", providerCourseId: ref, url: ref ? `${creds.baseUrl}/courses/${ref}` : null })
      .returning({ id: courses.id });
    known.push({ id: row.id, name, code: null, ref });
    seen.add(row.id);
    newCourses++;
    return row.id;
  };

  for (const e of events) {
    if (!e.start) continue;
    const bracket = e.summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    const title = (bracket?.[1] || e.summary).slice(0, 300);
    const label = bracket?.[2]?.trim() || null;
    const ref = e.url?.match(/course_(\d+)/)?.[1] ?? e.url?.match(/\/courses\/(\d+)/)?.[1] ?? null;
    const url = e.url?.startsWith(`${creds.baseUrl}/`) ? e.url : null;
    const at = instant(e.start, tz);
    const assignmentId = e.uid.match(/assignment-(\d+)/)?.[1];

    if (assignmentId) {
      const fields = { title, kind: canvasKind({ name: title }), dueAt: at, dueAllDay: !e.start.time, url };
      const dedupeKey = `canvas:${assignmentId}`;
      if (at < from) {
        await scope.tx
          .update(assignments)
          .set(fields)
          .where(and(eq(assignments.userId, scope.userId), eq(assignments.dedupeKey, dedupeKey)));
        continue;
      }
      const courseId = await courseFor(ref, label);
      await scope.tx
        .insert(assignments)
        .values({ userId: scope.userId, courseId, ...fields, source: "canvas", providerAssignmentId: assignmentId, dedupeKey })
        .onConflictDoUpdate({ target: [assignments.userId, assignments.dedupeKey], set: fields });
      saved++;
    } else if (/calendar-event-\d+/.test(e.uid) && at >= from && at < until) {
      const end = e.end ? instant(e.end, tz) : new Date(at.getTime() + 3600_000);
      const providerEventId = `canvas:${e.uid}`;
      const fields = {
        title,
        startsAt: at,
        endsAt: end > at ? end : new Date(at.getTime() + 3600_000),
        allDay: !e.start.time,
        location: e.location?.slice(0, 300) ?? null,
        kind: "class" as const,
        courseId: label || ref ? await courseFor(ref, label) : null,
      };
      const [existing] = await scope.tx
        .select({ id: calendarEvents.id })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, scope.userId), eq(calendarEvents.source, "canvas"), eq(calendarEvents.providerEventId, providerEventId)));
      if (existing) await scope.tx.update(calendarEvents).set(fields).where(eq(calendarEvents.id, existing.id));
      else {
        await scope.tx.insert(calendarEvents).values({ userId: scope.userId, ...fields, source: "canvas", providerEventId });
        added++;
      }
    }
  }
  return { courses: seen.size, newCourses, assignments: saved, events: added };
}

/** Records a failed sync in its own transaction (the failed one rolls back), so Connected accounts can show it. */
export async function markCanvasError(scope: UserScope, e: unknown) {
  const msg = e instanceof ServiceError ? e.message : "Canvas sync failed.";
  await scope.tx
    .update(integrations)
    .set({ status: "error", lastError: msg })
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "canvas")));
  return msg;
}

export async function canvasConnection(scope: UserScope) {
  const c = await getConnection(scope);
  if (!c) return null;
  const via = c.encryptedCredentials && "feedUrl" in (JSON.parse(decryptSecret(c.encryptedCredentials)) as Creds) ? ("feed" as const) : ("token" as const);
  return { host: c.displayName, status: c.status, lastSyncedAt: c.lastSyncedAt, lastError: c.lastError, via };
}
