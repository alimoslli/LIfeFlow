import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../crypto";
import { assignments, connectionRegistry, courses, integrations, type AssignmentKind } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "../services/errors";

/**
 * Canvas (ADR 0019): the student's school Canvas address plus a personal access
 * token they create in Canvas. Read-only: we never submit, post or change anything
 * in Canvas. Course and assignment text from Canvas is untrusted data.
 */
type Creds = { baseUrl: string; token: string };
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

export function canvasKind(a: Pick<CanvasAssignment, "name" | "submission_types">): AssignmentKind {
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
  return { name: me?.name ?? null, host: values.displayName };
}

export async function disconnectCanvas(scope: UserScope) {
  await scope.tx.delete(integrations).where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "canvas")));
}

/** Pulls active courses and their assignments. Canvas ids keep it idempotent: a changed due date updates, nothing duplicates. */
export async function syncCanvas(scope: UserScope, f: Fetch = fetch) {
  const conn = await getConnection(scope);
  if (!conn?.encryptedCredentials) throw new ServiceError("Canvas isn't connected.");
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials)) as Creds;
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
  await scope.tx.update(integrations).set({ status: "connected", lastSyncedAt: new Date(), lastError: null }).where(eq(integrations.id, conn.id));
  return { courses: list.length, newCourses, assignments: saved };
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
  return c ? { host: c.displayName, status: c.status, lastSyncedAt: c.lastSyncedAt, lastError: c.lastError } : null;
}
