import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import { hqChats, hqMissions } from "../db/schema";
import { rateLimit } from "../rate-limit";
import { deskLink, START_STALL_MS, STARTING, startStalled } from "../hq/desk";
import { chatUrl } from "../hq/team";
import { HqError, logAdmin, normalizeSessionId } from "../hq/validate";
import { getMission, updateMission } from "./hq";

/**
 * Start a desk task from HQ (ADR 0030), so the owner never leaves HQ to start one. HQ fires the owner's own cloud
 * scheduled task "LifeFlow desk task starter" through its API trigger: a token the owner made for that one task, kept in
 * Vercel (HQ_DESK_FIRE_URL, HQ_DESK_FIRE_TOKEN), never the owner's claude.ai login.
 *
 * The owner first reads the exact first prompt on the desk and taps "Start it"; its fingerprint (`pin`) travels with the
 * start. The fire text is only "<mission id> <pin>"; the new session reads the prompt from HQ itself
 * (`scripts/hq.ts desk <id> --pin <pin>`) and refuses if it changed since the owner read it, so nothing an agent writes
 * later, and nothing in the fire text, can change what runs. The run uses the owner's subscription like any chat.
 */
export const FIRE_URL_RE = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]{10,64}\/fire$/;
/** The fire endpoint's beta header (code.claude.com/docs/en/routines, "Trigger a scheduled task"). */
export const FIRE_BETA = "experimental-cc-routine-2026-04-01";
/** At most this many starts from HQ an hour (the endpoint itself allows 30 per task). */
export const STARTS_PER_HOUR = 10;

export type FireConfig = { url: string; token: string };

/** The fire URL and token from the environment, or null when starting from HQ isn't set up (the desk then uses the link). */
export function fireConfig(env: Record<string, string | undefined> = process.env): FireConfig | null {
  const url = env.HQ_DESK_FIRE_URL?.trim() ?? "";
  const token = env.HQ_DESK_FIRE_TOKEN?.trim() ?? "";
  if (!FIRE_URL_RE.test(url) || !/^[A-Za-z0-9_-]{20,400}$/.test(token)) return null;
  return { url, token };
}

export type StartedTask = { sessionId: string; url: string };

/** Owner-only (the caller has checked requireAdmin): starts an open desk task in a new cloud chat and ties it to the task. */
export async function startDeskTask(
  db: Database,
  admin: Admin,
  id: string,
  pin: string,
  opts: { config?: FireConfig | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<StartedTask> {
  const now = opts.now ?? new Date();
  const config = opts.config === undefined ? fireConfig() : opts.config;
  if (!config) throw new HqError("Starting from HQ isn't set up yet. Open the chat with the link instead.");
  const m = await getMission(db, id);
  if (!m || !m.deskPrompt) throw new HqError("That isn't a task on your desk.");
  if (m.status === "done" || m.status === "dropped") throw new HqError("That task is finished.");
  // One chat per task: a task that has one continues there (Open on the desk), never in a second one, unless its start
  // never got going (no word from that chat for 10 minutes).
  if (m.sessionId) {
    const [chat] = await db.select({ liveAt: hqChats.liveAt }).from(hqChats).where(eq(hqChats.id, m.sessionId)).limit(1);
    if (!startStalled(m, chat, now)) throw new HqError("It already has its own chat. Open it from your desk.");
  }
  if (!/^[0-9a-f]{16}$/.test(pin) || deskLink(m).pin !== pin) throw new HqError("This task changed since you opened your desk. Read it again, then start it.");
  const limit = await rateLimit(db, `hq-desk-start:${admin.email.toLowerCase()}`, STARTS_PER_HOUR, 3600);
  if (!limit.allowed) throw new HqError("That's a lot of starts this hour. Try again later, or open the chat with the link.");
  // One start at a time per task (a second tab, a double tap): a 10-minute hold, taken only if none is running.
  const held = await db
    .update(hqMissions)
    .set({ startHoldUntil: new Date(now.getTime() + START_STALL_MS) })
    .where(and(eq(hqMissions.id, m.id), or(isNull(hqMissions.startHoldUntil), lt(hqMissions.startHoldUntil, now))))
    .returning({ id: hqMissions.id });
  if (!held.length) throw new HqError("It's already starting. Give it a minute, then look under Right now.");
  const release = () => db.update(hqMissions).set({ startHoldUntil: null }).where(eq(hqMissions.id, m.id));

  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "anthropic-beta": FIRE_BETA,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      // Only the id and the fingerprint: the new chat reads the task from HQ and runs it only if it is unchanged.
      body: JSON.stringify({ text: `${m.id} ${pin}` }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // A timeout may have started it after all: keep the hold. Anything else never reached Claude: let it be tried again.
    const maybeStarted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    if (!maybeStarted) await release();
    throw new HqError(
      maybeStarted
        ? "Claude was slow to answer. It may have started: look under Right now in a minute."
        : "Claude couldn't be reached just now. Try again, or open the chat with the link.",
    );
  }
  if (!res.ok) {
    await release();
    if (res.status === 401 || res.status === 403) throw new HqError("Claude didn't accept the start key. Make a new token for the desk task starter.");
    if (res.status === 429) throw new HqError("Claude says too many starts this hour. Try again later, or open the chat with the link.");
    throw new HqError("Claude couldn't start the chat just now. Try again, or open the chat with the link.");
  }
  const body = (await res.json().catch(() => null)) as { claude_code_session_id?: unknown } | null;
  let sessionId: string;
  try {
    sessionId = normalizeSessionId(String(body?.claude_code_session_id ?? ""));
  } catch {
    // Claude answered yes, so a chat may exist: keep the hold.
    throw new HqError("Claude started something HQ can't follow. Check claude.ai/code for the new chat.");
  }
  // The owner sets the chat directly (takesMission), so the desk follows the new chat at once; the chat's claim agrees.
  // A task finished or dropped meanwhile is never reopened.
  const cur = await getMission(db, m.id);
  if (cur && cur.status !== "done" && cur.status !== "dropped")
    await updateMission(db, { kind: "owner", email: admin.email }, m.id, { status: "doing", sessionId, progress: STARTING });
  await release();
  await db.transaction((tx) => logAdmin(tx, admin, "hq.desk_started", { missionId: m.id, sessionId }));
  return { sessionId, url: chatUrl(sessionId) };
}
