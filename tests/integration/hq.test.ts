import { readFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as inboxGET } from "@/app/api/hq/inbox/route";
import { POST as reportPOST } from "@/app/api/hq/report/route";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, hqActivity, hqApprovals, hqChats, hqContent, hqKeys, hqMissions, hqUsageSamples, rateLimitBuckets } from "@/server/db/schema";
import {
  agentInbox,
  createApproval,
  createHqKey,
  createMission,
  decideApproval,
  employeeDetail,
  HqError,
  importSeed,
  importSeedAsOwner,
  listActivity,
  listApprovals,
  listChats,
  listDecisionThreads,
  listHqKeys,
  listMissions,
  markMissionSeen,
  officeSnapshot,
  pendingApprovalCount,
  recordCheckin,
  readingTime,
  removeChat,
  resolveHqKey,
  revokeHqKey,
  saveChat,
  setHqPushSender,
  updateMission,
  weeklyBudget,
  weeklySummary,
  type HqActor,
} from "@/server/services/hq";
import { withUser } from "@/server/db/with-user";
import { saveSubscription } from "@/server/services/push";
import { makeUser } from "../helpers";
import { card, cardBody } from "../hq-fixtures";

afterAll(async () => {
  setHqPushSender(null);
  await closeDb();
});

const db = () => getDb();
const owner: HqActor = { kind: "owner", email: "owner@test.local" };
const agent: HqActor = { kind: "agent", keyName: "LF V3", sessionId: null };
const SID = "session_01Mhcz6Ao4XdmNh3eAPYd3QN";
let admin: { id: string; email: string };

beforeEach(async () => {
  const d = db();
  await d.delete(hqContent);
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqMissions);
  await d.delete(hqChats);
  await d.delete(hqUsageSamples);
  await d.delete(hqKeys);
  await d.delete(adminActions);
  setHqPushSender(null);
  const { user } = await makeUser("HQ Owner");
  admin = { id: user.id, email: user.email };
});

const texts = async () => (await listActivity(db(), { limit: 100 })).map((a) => a.text);

describe("missions", () => {
  it("runs the lifecycle and logs plain lines", async () => {
    const m = await createMission(db(), owner, { role: "developer", title: "  Fix   search ", detail: "Details\nline two", priority: "high" });
    expect(m).toMatchObject({ title: "Fix search", status: "todo", source: "owner", priority: "high" });
    const doing = await updateMission(db(), owner, m.id, { status: "doing" });
    expect(doing.startedAt).not.toBeNull();
    const startedAt = doing.startedAt;
    const back = await updateMission(db(), owner, m.id, { status: "todo" });
    expect(back.startedAt).toEqual(startedAt);
    await updateMission(db(), owner, m.id, { status: "doing" });
    const done = await updateMission(db(), owner, m.id, { status: "done" });
    expect(done.doneAt).not.toBeNull();
    expect(done.seenAt).toBeNull();
    await markMissionSeen(db(), m.id);
    expect((await listMissions(db()))[0].seenAt).not.toBeNull();
    const reopened = await updateMission(db(), owner, m.id, { status: "doing" });
    expect(reopened.doneAt).toBeNull();
    const finished = await updateMission(db(), owner, m.id, { status: "done" });
    expect(finished.seenAt).toBeNull();
    const t = await texts();
    expect(t).toEqual(expect.arrayContaining(["Added: Fix search", "Started: Fix search", "Finished: Fix search"]));
  });

  it("blocked needs a reason and leaving it clears the reason", async () => {
    const m = await createMission(db(), agent, { role: "marketing", title: "Reel" });
    expect(m.source).toBe("agent");
    await expect(updateMission(db(), agent, m.id, { status: "blocked" })).rejects.toThrow("Say what it's blocked on.");
    const b = await updateMission(db(), agent, m.id, { status: "blocked", blockedReason: "No credits" });
    expect(b.blockedReason).toBe("No credits");
    expect(await texts()).toContain("Blocked: Reel (No credits)");
    const open = await updateMission(db(), agent, m.id, { status: "doing" });
    expect(open.blockedReason).toBeNull();
  });

  it("validates input", async () => {
    const bad = (i: object) => expect(createMission(db(), owner, { role: "developer", title: "x", ...i } as never)).rejects.toThrow(HqError);
    await bad({ title: "   " });
    await bad({ title: "x".repeat(141) });
    await bad({ detail: "x".repeat(4001) });
    await bad({ role: "ceo" });
    await bad({ dueOn: "2026-02-30" });
    await bad({ links: [{ label: "a", url: "javascript:alert(1)" }] });
    await bad({ links: Array.from({ length: 11 }, () => ({ label: "a", url: "https://a.b" })) });
    const ok = await createMission(db(), owner, { role: "developer", title: "ok", dueOn: "2026-12-01", links: [{ label: "x", url: "/admin/hq" }] });
    expect(ok.dueOn).toBe("2026-12-01");
  });
});

describe("approvals", () => {
  it("creates, decides once, and writes activity and admin_actions", async () => {
    const a = await createApproval(db(), agent, await card({ role: "designer", kind: "design", title: "Goals A" }));
    expect(a.status).toBe("pending");
    expect(await pendingApprovalCount(db())).toBe(1);
    const y = await decideApproval(db(), admin, a.id, "approved", "  go ahead ");
    expect(y).toMatchObject({ status: "approved", decisionNote: "go ahead" });
    expect(y.decidedAt).not.toBeNull();
    await expect(decideApproval(db(), admin, a.id, "declined")).rejects.toThrow(HqError);
    const b = await createApproval(db(), agent, await card({ role: "developer", kind: "feature", title: "B" }));
    const c = await createApproval(db(), agent, await card({ role: "developer", kind: "feature", title: "C" }));
    await decideApproval(db(), admin, b.id, "declined");
    await decideApproval(db(), admin, c.id, "changes", "smaller");
    const t = await texts();
    expect(t).toEqual(expect.arrayContaining(["Asked for your yes: Goals A", "You said yes: Goals A", "You said no: B", "You asked for changes: C"]));
    const acts = await db().select().from(adminActions).where(eq(adminActions.actorUserId, admin.id));
    expect(acts.map((r) => r.action)).toEqual(Array(3).fill("hq.approval_decided"));
    expect((await listApprovals(db(), { status: ["pending"] })).length).toBe(0);
    expect((await listApprovals(db()))[0].title).toBe("C");
  });

  it("rejects an approval linked to a missing mission", async () => {
    await expect(
      createApproval(db(), agent, await card({ role: "developer", kind: "other", title: "x", missionId: "00000000-0000-4000-8000-000000000000" })),
    ).rejects.toThrow(HqError);
  });

  it("pushes the owner's phone for an agent request, never fails the request, and stays quiet for the owner", async () => {
    const { user } = await makeUser("Phone");
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = user.email;
    try {
      await withUser(
        user.id,
        (sc) => saveSubscription(sc, { endpoint: `https://push.example.test/${user.id}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } }),
        db(),
      );
      const sent: { title: string; body: string; url: string }[] = [];
      setHqPushSender(async () => async (_s, msg) => {
        sent.push(msg);
        return { ok: true, gone: false };
      });
      await createApproval(db(), agent, await card({ role: "designer", kind: "design", title: "Pick one" }));
      expect(sent).toEqual([expect.objectContaining({ title: "Product & Design needs your yes", body: "Pick one", url: "/admin/work#approvals" })]);
      await createApproval(db(), owner, await card({ role: "designer", kind: "design", title: "Mine" }));
      expect(sent).toHaveLength(1);
      setHqPushSender(async () => {
        throw new Error("boom");
      });
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(createApproval(db(), agent, await card({ role: "designer", kind: "design", title: "Third" }))).resolves.toMatchObject({ title: "Third" });
      err.mockRestore();
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });
});

describe("check-ins", () => {
  it("upserts, normalises cse_, samples usage, and does not spam activity", async () => {
    await recordCheckin(db(), {
      sessionId: "cse_01Mhcz6Ao4XdmNh3eAPYd3QN",
      title: "LF V3",
      branch: "b",
      commit: "abc1234",
      status: "working",
      summary: "doing it",
    });
    await recordCheckin(db(), { sessionId: SID, status: "working" });
    await recordCheckin(db(), {
      sessionId: SID,
      status: "idle",
      usage: { fiveHourPct: 120, sevenDayPct: -5, sevenDayResetsAt: "2026-11-10T00:00:00Z", phase: "round_start" },
    });
    const [chat] = await listChats(db());
    expect(chat).toMatchObject({ id: SID, title: "LF V3", role: null, branch: "b", lastCommit: "abc1234", status: "idle", summary: "doing it" });
    expect(chat.url).toContain(SID);
    expect(chat.lastCheckinAt).not.toBeNull();
    const [s] = await db().select().from(hqUsageSamples);
    expect(s).toMatchObject({ fiveHourPct: 100, sevenDayPct: 0, phase: "round_start" });
    expect(await texts()).toEqual([]);
    await recordCheckin(db(), { sessionId: SID, status: "blocked", needsAction: "Approve the deploy" });
    await recordCheckin(db(), { sessionId: SID, status: "blocked", needsAction: "Approve the deploy" });
    expect(await texts()).toEqual(["LF V3 is waiting: Approve the deploy"]);
    expect(await db().select().from(hqUsageSamples)).toHaveLength(1);
    await expect(recordCheckin(db(), { sessionId: "nope" })).rejects.toThrow(HqError);
    await recordCheckin(db(), { sessionId: "session_0000000000AAA" });
    expect((await listChats(db())).find((c) => c.id === "session_0000000000AAA")?.title).toBe("Untitled chat");
  });

  it("a relayed check-in updates status and summary only: no new chat, no rename, no fake activity", async () => {
    const OTHER = "session_01Mhcz6BYyF8TLLXwBiWcWyk";
    await expect(recordCheckin(db(), { sessionId: OTHER, relay: true, status: "working" })).rejects.toThrow(/Unknown chat/);
    expect(await listChats(db())).toHaveLength(0);

    await saveChat(db(), admin, { id: SID, role: "developer", title: "LF Dev", isPrimary: true, branch: "feature/x" });
    const old = new Date(Date.now() - 10 * 86_400_000);
    await db().update(hqChats).set({ lastCheckinAt: old }).where(eq(hqChats.id, SID));
    await createMission(db(), owner, { role: "developer", title: "Big thing" });
    const [m] = await listMissions(db(), { role: "developer" });
    await updateMission(db(), owner, m.id, { status: "doing" });

    await recordCheckin(db(), { sessionId: SID, relay: true, title: "Hijacked", branch: "evil", status: "working", summary: "Reported by the Chief of Staff" });
    const [chat] = await listChats(db());
    expect(chat).toMatchObject({ title: "LF Dev", branch: "feature/x", status: "working", summary: "Reported by the Chief of Staff" });
    expect(chat.lastCheckinAt?.getTime()).toBe(old.getTime());
    const dev = (await officeSnapshot(db())).employees.find((e) => e.role === "developer");
    expect(dev?.state).not.toBe("working");

    // An older activeAt is ignored; a future one is clamped to now; a recent real one shows working.
    await recordCheckin(db(), { sessionId: SID, relay: true, activeAt: new Date(old.getTime() - 86_400_000).toISOString() });
    expect((await listChats(db()))[0].lastCheckinAt?.getTime()).toBe(old.getTime());
    const before = Date.now();
    await recordCheckin(db(), { sessionId: SID, relay: true, activeAt: new Date(Date.now() + 3_600_000).toISOString() });
    const at = (await listChats(db()))[0].lastCheckinAt!.getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now());
    await recordCheckin(db(), { sessionId: SID, relay: true, activeAt: new Date(Date.now() - 60_000).toISOString() });
    const dev2 = (await officeSnapshot(db())).employees.find((e) => e.role === "developer");
    expect(dev2?.state).toBe("working");
  });

  it("the agent inbox leaves the owner's email and edit time out of the controls", async () => {
    const { saveControls } = await import("@/server/services/hq-marketing");
    const { getControls: current } = await import("@/server/services/hq-marketing");
    const flipped = !(await current(db())).autonomous;
    await saveControls(db(), admin, { autonomous: flipped });
    const inbox = await agentInbox(db(), {});
    expect(inbox.controls.autonomous).toBe(flipped);
    expect(Object.keys(inbox.controls)).not.toContain("updatedByEmail");
    expect(Object.keys(inbox.controls)).not.toContain("updatedAt");
    expect(JSON.stringify(inbox)).not.toContain(admin.email);
    // The owner's own pages still show who changed what.
    const { getControls } = await import("@/server/services/hq-marketing");
    expect((await getControls(db())).updatedByEmail).toBe(admin.email);
  });

  it("saves and removes chats, one primary per role, with admin_actions", async () => {
    await saveChat(db(), admin, { id: SID, role: "designer", title: "LF V3", isPrimary: true });
    await saveChat(db(), admin, { id: "session_0000000000BBB", role: "designer", title: "Other", isPrimary: true });
    const chats = await listChats(db());
    expect(chats.filter((c) => c.isPrimary).map((c) => c.title)).toEqual(["Other"]);
    expect(await texts()).toContain("Chat linked: Other");
    await removeChat(db(), admin, "session_0000000000BBB");
    expect(await listChats(db())).toHaveLength(1);
    await expect(removeChat(db(), admin, "session_0000000000BBB")).rejects.toThrow(HqError);
    const acts = await db().select().from(adminActions).where(eq(adminActions.actorUserId, admin.id));
    expect(acts.map((r) => r.action).sort()).toEqual(["hq.chat_removed", "hq.chat_saved", "hq.chat_saved"]);
  });
});

describe("keys", () => {
  it("stores only a hash, resolves, revokes, and caps at 5", async () => {
    const { id, token } = await createHqKey(db(), admin, "LF V3");
    expect(token).toMatch(/^lfq_/);
    const [row] = await db().select().from(hqKeys);
    expect(row.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(await texts())).not.toContain(token);
    expect(JSON.stringify(await db().select().from(adminActions))).not.toContain(token);
    expect(await resolveHqKey(db(), token)).toEqual({ id, name: "LF V3" });
    expect((await listHqKeys(db()))[0].lastUsedAt).not.toBeNull();
    expect(await resolveHqKey(db(), "lfq_wrong")).toBeNull();
    expect(await resolveHqKey(db(), "lfh_" + token.slice(4))).toBeNull();
    expect(await resolveHqKey(db(), "lfq_" + "x".repeat(100))).toBeNull();
    await revokeHqKey(db(), admin, id);
    expect(await resolveHqKey(db(), token)).toBeNull();
    await expect(revokeHqKey(db(), admin, id)).rejects.toThrow(HqError);
    for (let i = 0; i < 5; i++) await createHqKey(db(), admin, `k${i}`);
    await expect(createHqKey(db(), admin, "sixth")).rejects.toThrow(/5 active/);
    expect(await texts()).toEqual(expect.arrayContaining(["HQ key created: LF V3", "HQ key revoked: LF V3"]));
  });
});

describe("import seed", () => {
  const seed = JSON.parse(readFileSync("docs/hq/seed.json", "utf8"));
  it("is idempotent and loads the real items", async () => {
    expect(await importSeed(db(), owner, seed)).toEqual({ chats: 4, missions: 6, approvals: 6 });
    expect(await importSeed(db(), owner, seed)).toEqual({ chats: 0, missions: 0, approvals: 0 });
    expect((await listMissions(db(), { status: ["blocked"] }))[0]).toMatchObject({ role: "marketing", source: "import" });
    // Old requests have no decision card: they wait to be rewritten and are not counted as needing a yes.
    expect(await pendingApprovalCount(db())).toBe(0);
    expect((await listDecisionThreads(db())).rewriting).toHaveLength(6);
    expect(await listChats(db())).toHaveLength(4);
    await expect(importSeed(db(), owner, { missions: [{ role: "x", title: "t" }] })).rejects.toThrow(HqError);
  });
});

describe("office snapshot, detail, summary", () => {
  it("is honest with no data", async () => {
    const s = await officeSnapshot(db());
    expect(s.employees.map((e) => e.role)).toEqual(["assistant", "developer", "designer", "researcher", "marketing", "qa", "support"]);
    expect(s.employees.map((e) => e.state)).toEqual(["offline", "offline", "offline", "offline", "offline", "sleeping", "sleeping"]);
    expect(s.counts).toEqual({ working: 0, done: 0, waiting: 0, asleep: 2, blocked: 0, offline: 5 });
    expect(s.budget).toMatchObject({ weekPct: null, roundsPct: null, target: 40, ceiling: 50 });
  });

  it("builds cards from real rows; the Chief of Staff's state comes from its chat", async () => {
    await saveChat(db(), admin, { id: SID, role: "developer", title: "LF Main", isPrimary: true });
    await recordCheckin(db(), { sessionId: SID, status: "working" });
    const m = await createMission(db(), owner, { role: "developer", title: "Do the thing", priority: "high" });
    await updateMission(db(), owner, m.id, { status: "doing" });
    await createMission(db(), owner, { role: "developer", title: "Later", priority: "low" });
    const a = await createApproval(db(), agent, await card({ role: "designer", kind: "design", title: "Pick" }));
    const s = await officeSnapshot(db());
    const by = Object.fromEntries(s.employees.map((e) => [e.role, e]));
    expect(by.developer).toMatchObject({ state: "working", line: "Do the thing" });
    expect(by.developer.currentMission?.title).toBe("Do the thing");
    expect(by.developer.primaryChat?.title).toBe("LF Main");
    expect(by.developer.asOf).not.toBeNull();
    expect(by.designer).toMatchObject({ state: "offline", asOf: null });
    expect(by.assistant).toMatchObject({ state: "offline" }); // no chat of its own yet: never "working" from app logic
    expect(s.founder.pendingApprovals).toBe(1);
    expect(s.approvals.map((x) => x.id)).toEqual([a.id]);
    expect(s.weekMissions.map((x) => x.title)).toEqual(["Do the thing", "Later"]);
    expect(s.counts.working).toBe(1);
    await decideApproval(db(), admin, a.id, "approved");
    const after = await officeSnapshot(db());
    expect(after.employees.find((e) => e.role === "assistant")?.state).toBe("offline");

    const d = await employeeDetail(db(), "developer");
    expect(d.current.map((x) => x.title)).toEqual(["Do the thing"]);
    expect(d.pending.map((x) => x.title)).toEqual(["Later"]);
    expect(d.chats).toHaveLength(1);
    expect(d.jobs.length).toBeGreaterThan(0);
    await updateMission(db(), owner, m.id, { status: "done" });
    const d2 = await employeeDetail(db(), "developer");
    expect(d2.done.map((x) => x.title)).toEqual(["Do the thing"]);
    expect((await officeSnapshot(db())).doneThisWeek).toBe(1);
    await expect(employeeDetail(db(), "ceo" as never)).rejects.toThrow(HqError);
  });

  it("counts work done for an employee in another chat (the night round) as working, but never hides needs-you", async () => {
    const AGENTS = "session_01Mhcz6BYyF8TLLXwBiWcWyk";
    await saveChat(db(), admin, { id: SID, role: "developer", title: "LF Main", isPrimary: true }); // never checked in
    await saveChat(db(), admin, { id: AGENTS, role: "researcher", title: "LF V3 — Agents", isPrimary: true });
    const m = await createMission(db(), owner, { role: "developer", title: "Forgiving transaction search" });
    await updateMission(db(), owner, m.id, { status: "doing", sessionId: AGENTS });
    let dev = (await officeSnapshot(db())).employees.find((e) => e.role === "developer")!;
    expect(dev.state).toBe("offline"); // the agents chat hasn't checked in yet: no claim of work
    await recordCheckin(db(), { sessionId: AGENTS, status: "working" });
    dev = (await officeSnapshot(db())).employees.find((e) => e.role === "developer")!;
    expect(dev).toMatchObject({ state: "working", line: "Forgiving transaction search (in LF V3 — Agents)" });
    expect(dev.asOf).not.toBeNull();
    await createApproval(db(), agent, await card({ role: "developer", kind: "deploy", title: "Ship it" }));
    dev = (await officeSnapshot(db())).employees.find((e) => e.role === "developer")!;
    expect(dev.state).toBe("needs_you");
    await db()
      .update(hqChats)
      .set({ lastCheckinAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(hqChats.id, AGENTS));
    await db().delete(hqApprovals);
    dev = (await officeSnapshot(db())).employees.find((e) => e.role === "developer")!;
    expect(dev.state).toBe("offline"); // an hour-old check-in is not "working"
  });

  it("measures the budget from real samples", async () => {
    const now = new Date();
    expect(await weeklyBudget(db(), now)).toMatchObject({ weekPct: null, roundsPct: null });
    await recordCheckin(db(), { sessionId: SID, usage: { sevenDayPct: 20, phase: "round_start", sevenDayResetsAt: "2026-11-10T00:00:00Z" } });
    await recordCheckin(db(), { sessionId: SID, usage: { sevenDayPct: 27, phase: "round_end" } });
    const b = await weeklyBudget(db(), new Date(Date.now() + 1000));
    expect(b).toMatchObject({ weekPct: 27, roundsPct: 7 });
    expect(b.resetsAt).toBeNull();
    expect((await weeklyBudget(db(), new Date(Date.now() + 8 * 24 * 3600_000))).weekPct).toBeNull();
  });

  it("writes the weekly summary from the numbers", async () => {
    const empty = await weeklySummary(db());
    expect(empty.headline).toEqual(["Nothing finished this week yet.", "Usage isn't measured yet."]);
    const m1 = await createMission(db(), owner, { role: "developer", title: "A", dueOn: "2020-01-01" });
    const m2 = await createMission(db(), owner, { role: "developer", title: "B" });
    const m3 = await createMission(db(), owner, { role: "marketing", title: "C", dueOn: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) });
    await updateMission(db(), owner, m1.id, { status: "done" });
    await updateMission(db(), owner, m2.id, { status: "blocked", blockedReason: "x" });
    await createApproval(db(), agent, await card({ role: "developer", kind: "other", title: "P" }));
    const w = await weeklySummary(db());
    expect(w).toMatchObject({ approvalsPending: 1, started: 0 });
    expect(w.done.map((x) => x.id)).toEqual([m1.id]);
    expect(w.blocked.map((x) => x.id)).toEqual([m2.id]);
    expect(w.dueSoon.map((x) => x.id)).toEqual([m3.id]);
    expect(w.overdue).toEqual([]);
    expect(w.headline).toEqual(expect.arrayContaining(["1 mission finished this week.", "1 thing is waiting for your yes.", "1 mission is blocked: B."]));
  });
});

describe("agent inbox", () => {
  it("lists open missions and recent decisions, filtered by role", async () => {
    const m = await createMission(db(), owner, { role: "designer", title: "D" });
    await createMission(db(), owner, { role: "developer", title: "X" });
    const done = await createMission(db(), owner, { role: "designer", title: "Done" });
    await updateMission(db(), owner, done.id, { status: "done" });
    const a = await createApproval(db(), agent, await card({ role: "designer", kind: "design", title: "Q" }));
    await decideApproval(db(), admin, a.id, "approved");
    const r = await agentInbox(db(), { role: "designer" });
    expect(r.missions.map((x) => x.id)).toEqual([m.id]);
    expect(r.decisions.map((x) => x.id)).toEqual([a.id]);
    expect((await agentInbox(db(), { role: "designer", since: new Date(Date.now() + 60_000) })).decisions).toEqual([]);
    expect((await agentInbox(db(), {})).missions).toHaveLength(2);
  });
});

describe("HQ API", () => {
  const post = (body: unknown, key?: string, raw?: string) =>
    reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: raw ?? JSON.stringify(body),
      }),
    );
  const get = (qs: string, key?: string) =>
    inboxGET(new Request(`https://lifeflow.test/api/hq/inbox${qs}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }));

  it("refuses a missing, wrong or revoked key with the same message", async () => {
    const { id, token } = await createHqKey(db(), admin, "k");
    const a = await post({ type: "checkin", sessionId: SID });
    const b = await post({ type: "checkin", sessionId: SID }, "lfq_wrong");
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
    await revokeHqKey(db(), admin, id);
    expect((await post({ type: "checkin", sessionId: SID }, token)).status).toBe(401);
    expect((await get("", token)).status).toBe(401);
    expect((await get("")).status).toBe(401);
  });

  it("rejects oversize and bad bodies", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    expect((await post(null, token, JSON.stringify({ type: "activity", role: "developer", text: "x".repeat(70_000) }))).status).toBe(413);
    expect((await post(null, token, "{nope")).status).toBe(400);
    expect((await post({ type: "wat" }, token)).status).toBe(400);
    const r = await post({ type: "mission", role: "developer", title: "" }, token);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/title/);
    expect(
      (await post({ type: "approval", role: "developer", kind: "other", title: "t", summary: "s", links: [{ label: "x", url: "javascript:1" }] }, token))
        .status,
    ).toBe(400);
  });

  it("creates missions and approvals, checks in, and serves the inbox", async () => {
    const { token } = await createHqKey(db(), admin, "LF V3");
    const m = await post({ type: "mission", role: "designer", title: "Concept", priority: "high" }, token);
    expect(m.status).toBe(200);
    const { id } = await m.json();
    const u = await post({ type: "mission", id, status: "doing", progress: "Sketching" }, token);
    expect((await u.json()).id).toBe(id);
    const ap = await post({ ...(await cardBody({ title: "Pick" })), links: [{ label: "x", url: "https://claude.ai/a" }] }, token);
    expect(ap.status).toBe(200);
    expect((await ap.json()).id).toBeTruthy();
    expect((await post({ type: "checkin", sessionId: SID, status: "working", usage: { sevenDayPct: 12 } }, token)).status).toBe(200);
    expect((await post({ type: "activity", role: "designer", text: "Drew six concepts" }, token)).status).toBe(200);
    expect((await post({ type: "import", seed: { chats: [], missions: [], approvals: [] } }, token)).status).toBe(200);
    expect((await listMissions(db()))[0]).toMatchObject({ status: "doing", progress: "Sketching", source: "agent" });
    expect(await texts()).toContain("Drew six concepts");
    const inbox = await get("?role=designer", token);
    expect(inbox.status).toBe(200);
    const j = await inbox.json();
    expect(j.missions).toHaveLength(1);
    expect(j.decisions).toEqual([]);
    expect((await get("?role=ceo", token)).status).toBe(400);
    expect((await get("?since=nope", token)).status).toBe(400);
  });
});

describe("review fixes", () => {
  const post = (body: unknown, key?: string, headers: Record<string, string> = {}, raw?: string) =>
    reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
        body: raw ?? JSON.stringify(body),
      }),
    );
  const buckets = async (prefix: string) =>
    (
      await db()
        .select()
        .from(rateLimitBuckets)
        .where(like(rateLimitBuckets.key, `${prefix}%`))
    ).map((b) => b.key);

  it("refuses a malformed bearer before any rate-limit bucket exists, then limits by IP and by key", async () => {
    await db().delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "hq%"));
    for (let i = 0; i < 5; i++) expect((await post({ type: "checkin", sessionId: SID }, `lfq_made_up_${i}`, { "x-real-ip": "9.9.9.9" })).status).toBe(401);
    expect(await buckets("hq")).toEqual([]);
    const wrongShape = await post({ type: "checkin", sessionId: SID }, `lfq_${"a".repeat(31)}`, { "x-real-ip": "9.9.9.9" });
    expect(wrongShape.status).toBe(401);
    expect(await buckets("hq")).toEqual([]);
    // Right shape, wrong key: counted by IP only (bounded), never by the made-up value.
    expect((await post({ type: "checkin", sessionId: SID }, `lfq_${"b".repeat(32)}`, { "x-real-ip": "9.9.9.9" })).status).toBe(401);
    expect(await buckets("hq")).toEqual(["hq-ip:9.9.9.9"]);
    const { id, token } = await createHqKey(db(), admin, "k");
    expect((await post({ type: "checkin", sessionId: SID }, token, { "x-real-ip": "9.9.9.9" })).status).toBe(200);
    expect((await buckets("hq")).sort()).toEqual([`hq-ip:9.9.9.9`, `hq:${id}`].sort());
  });

  it("an agent's import never maps chats; the owner's import does, and keeps one main chat per role", async () => {
    const seed = JSON.parse(readFileSync("docs/hq/seed.json", "utf8"));
    await importSeed(db(), { kind: "agent", keyName: "k", sessionId: null }, seed);
    const afterAgent = await listChats(db());
    expect(afterAgent).toHaveLength(4);
    expect(afterAgent.every((c) => c.role === null && !c.isPrimary)).toBe(true);
    await db().delete(hqChats);
    await importSeedAsOwner(db(), admin, seed);
    const mapped = (await listChats(db())).filter((c) => c.role);
    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.some((c) => c.isPrimary)).toBe(true);
    expect((await db().select().from(adminActions).where(eq(adminActions.action, "hq.seed_imported"))).length).toBe(1);
  });

  it("setting a main chat clears the role's other main chat", async () => {
    const A = "session_01AAAAAAAAAAAAAAAAAAAAAAAA";
    const B = "session_01BBBBBBBBBBBBBBBBBBBBBBBB";
    await saveChat(db(), admin, { id: A, role: "developer", title: "A", isPrimary: true });
    await saveChat(db(), admin, { id: B, role: "developer", title: "B", isPrimary: true });
    const chats = await listChats(db());
    expect(chats.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([B]);
    // An owner import of a new primary chat for the same role also clears it.
    await importSeed(db(), owner, { chats: [{ id: "session_01CCCCCCCCCCCCCCCCCCCCCCCC", title: "C", role: "developer", isPrimary: true }] });
    expect((await listChats(db())).filter((c) => c.isPrimary).map((c) => c.id)).toEqual(["session_01CCCCCCCCCCCCCCCCCCCCCCCC"]);
  });

  it("always lists every mapped chat, plus the newest unmapped ones (max 50)", async () => {
    const t0 = Date.parse("2026-01-01T00:00:00Z");
    const id = (n: number) => `session_01${String(n).padStart(24, "0")}`;
    await db()
      .insert(hqChats)
      .values([
        { id: id(1), title: "mapped 1", role: "developer", createdAt: new Date(t0) },
        { id: id(2), title: "mapped 2", role: "designer", createdAt: new Date(t0 + 1) },
        ...Array.from({ length: 260 }, (_, i) => ({ id: id(100 + i), title: `new ${i}`, role: null, createdAt: new Date(t0 + 1000 + i) })),
      ]);
    const chats = await listChats(db());
    expect(chats).toHaveLength(52);
    expect(chats.slice(0, 2).map((c) => c.title)).toEqual(["mapped 1", "mapped 2"]);
    expect(chats[2].title).toBe("new 259");
    expect((await officeSnapshot(db())).employees.find((e) => e.role === "developer")?.primaryChat?.title).toBe("mapped 1");
  });

  it("counts a finished employee as done, not working", async () => {
    await saveChat(db(), admin, { id: SID, role: "designer", title: "LF V3", isPrimary: true });
    await recordCheckin(db(), { sessionId: SID, status: "idle" });
    const m = await createMission(db(), owner, { role: "designer", title: "Concepts" });
    await updateMission(db(), owner, m.id, { status: "done" });
    const s = await officeSnapshot(db());
    expect(s.employees.find((e) => e.role === "designer")?.state).toBe("done");
    expect(s.counts).toMatchObject({ working: 0, done: 1 });
  });

  it("shows no weekly figure once the meter's week has reset, and dates a reading by when it was read", async () => {
    const now = new Date();
    const readAt = new Date(now.getTime() - 2 * 3600_000);
    await recordCheckin(db(), {
      sessionId: SID,
      usage: { sevenDayPct: 40, sevenDayResetsAt: new Date(now.getTime() + 3 * 86400_000).toISOString(), readAt: readAt.toISOString() },
    });
    let b = await weeklyBudget(db(), now);
    expect(b.weekPct).toBe(40);
    expect(Math.abs(b.asOf!.getTime() - readAt.getTime())).toBeLessThan(1000);
    // Last week's reading: the reset time has passed.
    b = await weeklyBudget(db(), new Date(now.getTime() + 4 * 86400_000));
    expect(b).toMatchObject({ weekPct: null, roundsPct: null });
    // A reading dated in the future or over 6 h old is stored as "now".
    expect(readingTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(now);
    expect(readingTime(new Date(now.getTime() - 7 * 3600_000).toISOString(), now)).toBe(now);
    expect(readingTime("nope", now)).toBe(now);
    expect(readingTime(readAt.toISOString(), now).getTime()).toBe(readAt.getTime());
  });

  it("uses the owner's time zone for overdue and due soon", async () => {
    const { user } = await makeUser("Owner TZ"); // America/New_York
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = user.email;
    try {
      // 02:00 UTC on Nov 7 is still the evening of Nov 6 in New York.
      const now = new Date("2026-11-07T02:00:00Z");
      await createMission(db(), owner, { role: "developer", title: "Due today", dueOn: "2026-11-06" });
      await createMission(db(), owner, { role: "developer", title: "Due yesterday", dueOn: "2026-11-05" });
      const w = await weeklySummary(db(), now);
      expect(w.overdue.map((m) => m.title)).toEqual(["Due yesterday"]);
      expect(w.dueSoon.map((m) => m.title)).toEqual(["Due today"]);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("validates mission chat ids and records the calling chat on an agent's mission", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    const bad = await post({ type: "mission", role: "developer", title: "T", sessionId: "not a chat" }, token);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/chat id/);
    await expect(updateMission(db(), owner, (await createMission(db(), owner, { role: "developer", title: "U" })).id, { sessionId: "nope" })).rejects.toThrow(
      HqError,
    );
    const ok = await post({ type: "mission", role: "developer", title: "Mine", sessionId: `cse_${SID.slice(8)}` }, token);
    expect(ok.status).toBe(200);
    expect((await listMissions(db())).find((m) => m.title === "Mine")?.sessionId).toBe(SID);
    const direct = await createMission(db(), { kind: "agent", keyName: "k", sessionId: SID }, { role: "developer", title: "From actor" });
    expect(direct.sessionId).toBe(SID);
  });

  it("caps the body by bytes and by content-length before reading", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    expect((await post(null, token, { "content-length": "64001" }, "{}")).status).toBe(413);
    // 40,000 two-byte characters are under 64,000 characters but over 64,000 bytes.
    const multi = JSON.stringify({ type: "activity", role: "developer", text: "é".repeat(40_000) });
    expect((await post(null, token, {}, multi)).status).toBe(413);
  });
});
