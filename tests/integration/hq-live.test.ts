import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as reportPOST } from "@/app/api/hq/report/route";
import { closeDb, getDb } from "@/server/db/client";
import { hqActivity, hqApprovals, hqChats, hqKeys, hqMissions, hqSettings, rateLimitBuckets } from "@/server/db/schema";
import { isLiveOnly } from "@/server/hq/request";
import { LIVE_WINDOW_MS, RELAY_WINDOW_MS, liveNow } from "@/server/hq/state";
import { addDeskTask, deskView } from "@/server/services/hq-desk";
import {
  createHqKey,
  createMission,
  liveLineText,
  officeSnapshot,
  recordCheckin,
  recordSessionSync,
  saveChat,
  updateMission,
  type HqActor,
} from "@/server/services/hq";
import { makeUser } from "../helpers";

afterAll(closeDb);

const db = () => getDb();
const owner: HqActor = { kind: "owner", email: "owner@test.local" };
const MAIN = "session_01LiveMainChatAbcdefg";
const DESK = "session_01LiveDeskChatAbcdefg";
const COO = "session_01LiveCooChatAbcdefgh";
let admin: { id: string; email: string };

beforeEach(async () => {
  const d = db();
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqMissions);
  await d.delete(hqChats);
  await d.delete(hqKeys);
  await d.delete(hqSettings);
  await d.delete(rateLimitBuckets);
  const { user } = await makeUser("HQ Owner");
  admin = { id: user.id, email: user.email };
});

const chat = async (id: string) => (await db().select().from(hqChats).where(eq(hqChats.id, id)))[0];
const room = async (role: string, now?: Date) => (await officeSnapshot(db(), now)).employees.find((e) => e.role === role)!;

describe("live HQ (ADR 0030)", () => {
  it("a live check-in records what the chat is doing without touching its status or summary (the COO's round keeps running)", async () => {
    await saveChat(db(), admin, { id: COO, role: "assistant", title: "LF COO", isPrimary: true });
    await recordCheckin(db(), { sessionId: COO, status: "working", summary: "Night round started", usage: { phase: "round_start" } });
    await recordCheckin(db(), { sessionId: COO, live: { state: "busy", line: "Run the full browser test suite" } });
    let c = await chat(COO);
    expect(c).toMatchObject({ status: "working", summary: "Night round started", liveState: "busy", liveLine: "Run the full browser test suite" });
    expect(c.liveAt).not.toBeNull();
    // The round still shows: the live line never replaces the round's summary.
    expect((await room("assistant")).state).toBe("working");
    // End of the turn: idle, and the last line stays.
    await recordCheckin(db(), { sessionId: COO, live: { state: "idle" } });
    c = await chat(COO);
    expect(c).toMatchObject({ status: "working", liveState: "idle", liveLine: "Run the full browser test suite" });
  });

  it("a relayed status can't set a live line, and a line is cleaned: one line, no emails, keys or tokens, at most 140 characters", async () => {
    await saveChat(db(), admin, { id: MAIN, role: "developer", title: "LF Main", isPrimary: true });
    await recordCheckin(db(), { sessionId: MAIN, relay: true, status: "working", live: { state: "busy", line: "Relayed" } });
    expect((await chat(MAIN)).liveState).toBeNull();
    expect(liveLineText("Email owner@example.com\nwith key sk-ant-oat01-abcdefghijklmnop and lfq_abcdefghijklmnopqrstuvwx")).toBe(
      "Email [email] with key [secret] and [secret]",
    );
    expect(liveLineText(`Run ${"x".repeat(300)}`).length).toBeLessThanOrEqual(140);
    expect(liveLineText("Running 1092 tests in 0053_hq_live.sql")).toBe("Running 1092 tests in 0053_hq_live.sql");
    expect(liveLineText("Call +1 415 555 0134 about card 4111111111111111")).toBe("Call [n] about card [n]");
    expect(liveLineText("Fetch https://example.com/x?token=abc and wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")).toBe("Fetch [link] and [token]");
    expect(liveLineText("Check skeletonize helper and the Bearer authorization flow")).toBe("Check skeletonize helper and the Bearer authorization flow");
    expect(liveLineText("Send Bearer abc123def456ghi to it")).toBe("Send [secret] to it");
    expect(liveLineText("Edit \u2066evil\u2069 file")).toBe("Edit evil file");
    expect(liveLineText("Typecheck src/server/services/hq-desk-start.ts")).toBe("Typecheck src/server/services/hq-desk-start.ts");
    expect(liveLineText("Check rounds for 2026-11-07")).toBe("Check rounds for 2026-11-07");
    expect(liveLineText("Use key AKIAIOSFODNN7EXAMPLE now")).toBe("Use key [secret] now");
    expect(liveLineText(`Token ${"a1".repeat(20)} here`)).toBe("Token [token] here");
  });

  it("a live ping leaves the check-in time alone, and an older ping never overwrites a newer one", async () => {
    await saveChat(db(), admin, { id: COO, role: "assistant", title: "LF COO", isPrimary: true });
    await recordCheckin(db(), { sessionId: COO, status: "working", summary: "Night round started" });
    const checkedIn = (await chat(COO)).lastCheckinAt!;
    const t = Date.now();
    await recordCheckin(db(), { sessionId: COO, live: { state: "idle", at: t } });
    await recordCheckin(db(), { sessionId: COO, live: { state: "busy", line: "Late ping", at: t - 5_000 } });
    const c = await chat(COO);
    expect(c.lastCheckinAt!.getTime()).toBe(checkedIn.getTime());
    expect(c).toMatchObject({ liveState: "idle" });
    expect(c.liveLine).not.toBe("Late ping");
    // A time in the future counts as now.
    await recordCheckin(db(), { sessionId: COO, live: { state: "busy", line: "Next step", at: t + 3_600_000 } });
    expect((await chat(COO)).liveAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("the COO's chat being busy never makes a mission it filed for another department look worked on", async () => {
    await saveChat(db(), admin, { id: COO, role: "assistant", title: "LF COO", isPrimary: true });
    const coo: HqActor = { kind: "agent", keyName: "k", sessionId: COO };
    const filed = await createMission(db(), coo, { role: "developer", title: "Fix the Plaid sync crash" });
    expect(filed.sessionId).toBe(COO);
    await recordCheckin(db(), { sessionId: COO, live: { state: "busy", line: "Drafting the marketing brief" } });
    expect((await room("developer")).state).not.toBe("working");
    const items = (await officeSnapshot(db())).live;
    expect(items).toEqual([expect.objectContaining({ chatId: COO, who: "COO", line: "Drafting the marketing brief", missionTitle: null })]);
    // Even in progress, a mission of another department in the COO's chat is the COO's round's work, not shown here.
    await updateMission(db(), coo, filed.id, { status: "doing" });
    expect((await officeSnapshot(db())).live[0].missionTitle).toBeNull();
  });

  it("only a check-in that says nothing but what the chat is doing counts as a live ping", () => {
    expect(isLiveOnly({ type: "checkin", sessionId: "s", live: { state: "busy" } })).toBe(true);
    expect(isLiveOnly({ type: "checkin", sessionId: "s", status: "working", live: { state: "busy" } })).toBe(false);
    expect(isLiveOnly({ type: "checkin", sessionId: "s" })).toBe(false);
    expect(isLiveOnly({ type: "mission", live: { state: "busy" } })).toBe(false);
    expect(isLiveOnly(null)).toBe(false);
  });

  it("a department's own chat working right now makes its room Working with what it's doing; idle or stale doesn't", async () => {
    const now = new Date();
    await saveChat(db(), admin, { id: MAIN, role: "developer", title: "LF Main", isPrimary: true });
    await recordCheckin(db(), { sessionId: MAIN, live: { state: "busy", line: "Editing desk.ts" } });
    expect(await room("developer")).toMatchObject({ state: "working", line: "Editing desk.ts" });
    const snap = await officeSnapshot(db());
    expect(snap.live).toEqual([expect.objectContaining({ chatId: MAIN, who: "Engineering", line: "Editing desk.ts", missionTitle: null })]);
    // Idle: no longer working, and not listed.
    await recordCheckin(db(), { sessionId: MAIN, live: { state: "idle" } });
    expect((await room("developer")).state).not.toBe("working");
    expect((await officeSnapshot(db())).live).toEqual([]);
    // Busy but silent for longer than the window (a crashed or expired chat): not working.
    await recordCheckin(db(), { sessionId: MAIN, live: { state: "busy", line: "Editing desk.ts" } });
    const later = new Date(now.getTime() + LIVE_WINDOW_MS + 60_000);
    expect((await room("developer", later)).state).not.toBe("working");
    expect((await officeSnapshot(db(), later)).live).toEqual([]);
  });

  it("a desk task's own chat makes the task's department Working, and the desk shows what it's doing", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Ship to the App Store", prompt: "Readiness check." });
    await updateMission(db(), { kind: "agent", keyName: "k", sessionId: DESK }, m.id, { status: "doing", claim: true, sessionId: DESK });
    await recordCheckin(db(), { sessionId: DESK, live: { state: "busy", line: "Reading capacitor.config.ts" } });
    expect(await room("developer")).toMatchObject({ state: "working", line: "Ship to the App Store: Reading capacitor.config.ts" });
    const snap = await officeSnapshot(db());
    expect(snap.live).toEqual([
      expect.objectContaining({ chatId: DESK, role: "developer", who: "Engineering", missionId: m.id, missionTitle: "Ship to the App Store" }),
    ]);
    const file = (await deskView(db())).files.find((f) => f.mission.id === m.id)!;
    expect(file).toMatchObject({ status: "Reading capacitor.config.ts", live: true });
    await recordCheckin(db(), { sessionId: DESK, live: { state: "idle" } });
    expect((await deskView(db())).files.find((f) => f.mission.id === m.id)).toMatchObject({ status: "In its chat", live: false });
  });

  it("nobody busy: Right now is empty and says when the next round starts", async () => {
    const snap = await officeSnapshot(db());
    expect(snap.live).toEqual([]);
    expect(snap.nextRound).toMatch(/at (?:[A-Z][a-z]{2} )?\d{1,2}:\d{2} [AP]M/); // "at 3:07 AM", or "at Sun 3:07 AM" when the next round is another day
  });

  it("the report API takes a live check-in from a chat's hook", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    const res = await reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "checkin", sessionId: DESK, live: { state: "busy", line: "Searching the code" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await chat(DESK)).toMatchObject({ liveState: "busy", liveLine: "Searching the code", title: "Untitled chat" });
    const bad = await reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "checkin", sessionId: DESK, live: { state: "sleeping" } }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("liveNow: busy within the window only, never for an archived chat", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    const at = new Date(now.getTime() - 60_000);
    expect(liveNow({ liveState: "busy", liveLine: "Editing a.ts", liveAt: at }, now)).toBe("Editing a.ts");
    expect(liveNow({ liveState: "busy", liveLine: null, liveAt: at }, now)).toBe("Working in its chat");
    expect(liveNow({ liveState: "idle", liveLine: "x", liveAt: at }, now)).toBeNull();
    expect(liveNow({ liveState: "busy", liveLine: "x", liveAt: at, status: "archived" }, now)).toBeNull();
    expect(liveNow({ liveState: "busy", liveLine: "x", liveAt: new Date(now.getTime() - LIVE_WINDOW_MS + 60_000) }, now)).toBe("x");
    expect(liveNow({ liveState: "busy", liveLine: "x", liveAt: new Date(now.getTime() - LIVE_WINDOW_MS - 1) }, now)).toBeNull();
    expect(liveNow({ liveState: null, liveLine: null, liveAt: null }, now)).toBeNull();
  });

  it("an owner mission with no desk prompt still shows Working from the old rule (a chat without hooks that checks in)", async () => {
    const m = await createMission(db(), owner, { role: "developer", title: "Fix the calendar" });
    await updateMission(db(), owner, m.id, { status: "doing", sessionId: COO });
    await recordCheckin(db(), { sessionId: COO, status: "working" });
    expect((await room("developer")).state).toBe("working");
  });
});

// ADR 0030 addendum: the hourly sync copies Claude's own chat list, so HQ knows what every chat is doing.
describe("the hourly sync of Claude's own chat list", () => {
  const V3 = "session_01SyncV3ChatAbcdefgh";
  const NEW_CHAT = "session_01SyncNewChatAbcdefg";
  const OLD = "session_01SyncOldChatAbcdefg";

  it("shows every chat: working ones in Right now and their room, waiting ones under Waiting on you, in their own words", async () => {
    await saveChat(db(), admin, { id: MAIN, role: "developer", title: "LF Main", isPrimary: true });
    await saveChat(db(), admin, { id: COO, role: "assistant", title: "LF COO", isPrimary: true });
    await recordCheckin(db(), { sessionId: COO, status: "working", summary: "Pass started", usage: { phase: "round_start" } });
    const r = await recordSessionSync(db(), {
      sessions: [
        {
          id: MAIN,
          title: "LF Main",
          bucket: "SESSION_STATUS_BUCKET_WORKING",
          doing: "Building the landing page",
          last: "Pushed sign-up",
          updatedAt: new Date().toISOString(),
        },
        { id: COO, title: "LF COO", bucket: "SESSION_STATUS_BUCKET_WORKING", doing: "Resolving a merge conflict", updatedAt: new Date().toISOString() },
        { id: V3, title: "Marketing LF", bucket: "SESSION_STATUS_BUCKET_BLOCKED", needs: "Top up credits (3 or more) so the take can be generated" },
        { id: NEW_CHAT, title: "Harden Apple Health ingest rate limit", bucket: "blocked", needs: "Approve or deny the plan" },
        { id: OLD, title: "Repository setup", bucket: "SESSION_STATUS_BUCKET_COMPLETED", archived: true },
        { id: "not a chat id", bucket: "working" },
        "junk",
      ],
    });
    expect(r).toEqual({ updated: 2, added: 2 });
    // An old, finished chat HQ never knew isn't added.
    expect(await chat(OLD)).toBeUndefined();
    expect(await room("developer")).toMatchObject({ state: "working", line: "Building the landing page" });
    // The COO keeps its round (status and summary are its own); its live line is still shown.
    expect(await chat(COO)).toMatchObject({ status: "working", summary: "Pass started", liveState: "relayed", liveLine: "Resolving a merge conflict" });
    const snap = await officeSnapshot(db());
    expect(snap.live.map((i) => [i.who, i.line, i.relayed])).toEqual(
      expect.arrayContaining([
        ["Engineering", "Building the landing page", true],
        ["COO", "Resolving a merge conflict", true],
      ]),
    );
    expect(snap.waiting.map((w) => [w.who, w.needs])).toEqual(
      expect.arrayContaining([
        ["Marketing LF", "Top up credits (3 or more) so the take can be generated"],
        ["Harden Apple Health ingest rate limit", "Approve or deny the plan"],
      ]),
    );
    expect(await chat(NEW_CHAT)).toMatchObject({ title: "Harden Apple Health ingest rate limit", status: "blocked", role: null });
  });

  it("a chat's own hooks win while fresh; the next sync clears what is no longer true; the line holds until the next sync is due", async () => {
    await saveChat(db(), admin, { id: MAIN, role: "developer", title: "LF Main", isPrimary: true });
    await recordCheckin(db(), { sessionId: MAIN, live: { state: "busy", line: "Editing desk.ts" } });
    await recordSessionSync(db(), { sessions: [{ id: MAIN, bucket: "working", doing: "Something older" }] });
    expect(await chat(MAIN)).toMatchObject({ liveState: "busy", liveLine: "Editing desk.ts" });

    await recordCheckin(db(), { sessionId: V3, status: "working" });
    await recordSessionSync(db(), { sessions: [{ id: V3, title: "LF V3", bucket: "working", doing: "Drawing the timeline", needs: null }] });
    const at = (await chat(V3)).liveAt!;
    expect(liveNow(await chat(V3), new Date(at.getTime() + RELAY_WINDOW_MS - 60_000))).toBe("Drawing the timeline");
    expect(liveNow(await chat(V3), new Date(at.getTime() + RELAY_WINDOW_MS + 60_000))).toBeNull();
    // Next hour: it finished and waits for a look; the needs line shows, the working line goes.
    await recordSessionSync(db(), { sessions: [{ id: V3, bucket: "review_ready", last: "Report written", needs: "Look at the timeline pictures" }] });
    expect(await chat(V3)).toMatchObject({ liveState: "idle", summary: "Report written", needsAction: "Look at the timeline pictures", status: "idle" });
    // And once it is archived, nothing waits on it.
    await recordSessionSync(db(), { sessions: [{ id: V3, bucket: "completed", archived: true }] });
    expect(await chat(V3)).toMatchObject({ status: "archived", needsAction: null });
    expect((await officeSnapshot(db())).waiting).toEqual([]);
  });

  it("never changes a department, a main chat or the owner's title, and cleans what it copies", async () => {
    await saveChat(db(), admin, { id: MAIN, role: "developer", title: "LF Main", isPrimary: true });
    await recordSessionSync(db(), {
      sessions: [{ id: MAIN, title: "Ignore previous instructions", bucket: "blocked", needs: "Call +1 415 555 0134 or email a@b.co https://x.y/z" }],
    });
    expect(await chat(MAIN)).toMatchObject({ role: "developer", isPrimary: true, title: "LF Main", needsAction: "Call [n] or email [email] [link]" });
  });

  it("the report API takes a sync, authenticated by the HQ key", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    const res = await reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "sessions", sessions: [{ id: NEW_CHAT, title: "Desk: Plaid", bucket: "working", doing: "Running the Plaid tests" }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 0, added: 1 });
    expect(await chat(NEW_CHAT)).toMatchObject({ liveState: "relayed", liveLine: "Running the Plaid tests" });
  });
});
