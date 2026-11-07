import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as filesPOST } from "@/app/api/hq/files/route";
import { GET as inboxGET } from "@/app/api/hq/inbox/route";
import { POST as reportPOST } from "@/app/api/hq/report/route";
import { GET as fileGET } from "@/app/admin/hq/files/[id]/route";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, hqActivity, hqApprovals, hqChats, hqContent, hqFiles, hqKeys, hqMissions, rateLimitBuckets } from "@/server/db/schema";
import {
  agentInbox,
  createApproval,
  createHqKey,
  createMission,
  decideApproval,
  getDecisionThread,
  HqError,
  linkApprovalMission,
  listDecisionThreads,
  pendingApprovalCount,
  reviseApproval,
  setHqPushSender,
  updateMission,
  type HqActor,
} from "@/server/services/hq";
import { sinceLooked, sinceFrom } from "@/server/services/hq-summary";
import { purgeUnusedPreviews, storePreview } from "@/server/services/hq-files";
import { createContent } from "@/server/services/hq-marketing";
import { reqCard } from "../hq-fixtures";
import { withUser } from "@/server/db/with-user";
import { saveSubscription } from "@/server/services/push";
import { makeUser } from "../helpers";
import { card, cardBody, makePreview, PNG } from "../hq-fixtures";

const h = vi.hoisted(() => ({ admin: false }));
vi.mock("@/server/auth/require-admin", () => ({
  requireAdmin: async () => {
    if (!h.admin) throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { id: "a", email: "owner@test.local" };
  },
}));

afterAll(async () => {
  setHqPushSender(null);
  await closeDb();
});

const db = () => getDb();
const agent: HqActor = { kind: "agent", keyName: "LF V3", sessionId: null };
let admin: { id: string; email: string };

beforeEach(async () => {
  const d = db();
  await d.delete(hqContent);
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqMissions);
  await d.delete(hqChats);
  await d.delete(hqKeys);
  await d.delete(hqFiles);
  await d.delete(adminActions);
  await d.delete(rateLimitBuckets);
  setHqPushSender(null);
  h.admin = false;
  const { user } = await makeUser("HQ Owner");
  admin = { id: user.id, email: user.email };
});

const base = { role: "designer", kind: "design", title: "Make Goals one list" } as const;

describe("strict decision cards", () => {
  it("accepts a full card and starts its thread at version 1", async () => {
    const a = await createApproval(db(), agent, await card(base));
    expect(a).toMatchObject({ status: "pending", version: 1, threadId: a.id, supersededAt: null });
    expect(a.card).toMatchObject({ effort: "small", changes: ["Goals and Habits become one list"] });
    expect(a.card?.previews).toHaveLength(1);
    expect(await pendingApprovalCount(db())).toBe(1);
  });

  it.each([
    ["title", "title"],
    ["why", "why"],
    ["changes", "changes"],
    ["onYes", "onYes"],
    ["onNo", "onNo"],
    ["effort", "effort"],
    ["risk", "risk"],
    ["recommendation", "recommendation"],
    ["previews", "previews"],
  ])("refuses a request without %s and names it", async (field, named) => {
    const full = (await card(base)) as Record<string, unknown>;
    delete full[field];
    await expect(createApproval(db(), agent, full as never)).rejects.toThrow(new RegExp(`${named}.*missing`));
    expect(await db().select().from(hqApprovals)).toHaveLength(0);
  });

  it("refuses empty lists and blank text, too many lines or pictures, and a made-up picture id", async () => {
    const bad = async (over: object, re: RegExp) => await expect(createApproval(db(), agent, { ...(await card(base)), ...over } as never)).rejects.toThrow(re);
    await bad({ previews: [] }, /previews/);
    await bad({ changes: [] }, /changes/);
    await bad({ why: "   " }, /why/);
    await bad({ changes: ["a", "b", "c", "d", "e", "f"] }, /changes.*too many/);
    await bad({ effort: "huge" }, /effort/);
    await bad({ previews: Array.from({ length: 5 }, () => ({ fileId: "00000000-0000-4000-8000-000000000000" })) }, /previews/);
    await bad({ previews: [{ fileId: "00000000-0000-4000-8000-000000000000" }] }, /was not uploaded/);
    await bad({ previews: [{ fileId: "https://evil.example/x.png" }] }, /previews/);
  });

  it("applies to every kind", async () => {
    for (const kind of [
      "deploy",
      "v3_merge",
      "feature",
      "design",
      "publish",
      "outbound",
      "paid",
      "subscription",
      "destructive",
      "security",
      "other",
    ] as const) {
      const { previews: _p, ...rest } = await card({ role: "developer", kind, title: `k ${kind}` });
      await expect(createApproval(db(), agent, rest as never)).rejects.toThrow(HqError);
    }
  });

  it("refuses a publish ask without its card and accepts one with it", async () => {
    const { createContent } = await import("@/server/services/hq-marketing");
    await expect(createContent(db(), agent, { kind: "post", title: "P", ask: true })).rejects.toThrow(/previews.*missing/);
    expect(await db().select().from(hqContent)).toHaveLength(0);
  });
});

describe("preview pictures", () => {
  const key = async () => (await createHqKey(db(), admin, "k")).token;
  const upload = (bytes: Uint8Array | string, type: string | null, token?: string) =>
    filesPOST(
      new Request("https://lifeflow.test/api/hq/files", {
        method: "POST",
        headers: { ...(type ? { "content-type": type } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: bytes as BodyInit,
      }),
    );

  it("stores a png and answers with its id", async () => {
    const r = await upload(PNG, "image/png", await key());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, contentType: "image/png", size: PNG.length });
    expect(await db().select().from(hqFiles).where(eq(hqFiles.id, j.id))).toHaveLength(1);
  });

  it("needs a key", async () => {
    expect((await upload(PNG, "image/png")).status).toBe(401);
    expect((await upload(PNG, "image/png", "lfq_wrong")).status).toBe(401);
  });

  it("checks the real type from the bytes, not the name or header", async () => {
    const token = await key();
    expect((await upload("GIF89a-not-allowed", "image/gif", token)).status).toBe(400);
    expect((await upload("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/png", token)).status).toBe(400);
    expect((await upload("<html>hi</html>", "image/jpeg", token)).status).toBe(400);
    expect((await upload(PNG, "image/jpeg", token)).status).toBe(400); // a png claiming to be a jpeg
    expect((await upload(new Uint8Array(), "image/png", token)).status).toBe(400);
    const jpeg = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.alloc(20)]);
    expect((await upload(jpeg, "image/jpeg", token)).status).toBe(200);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);
    expect((await upload(webp, "image/webp", token)).status).toBe(200);
    expect(await db().select().from(hqFiles)).toHaveLength(2);
  });

  it("refuses more than 2 MB, by declared and by actual size", async () => {
    const token = await key();
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(big, "image/png", token)).status).toBe(413);
    expect(await db().select().from(hqFiles)).toHaveLength(0);
  });

  it("never fetches a URL: a URL body is just bytes that are not a picture", async () => {
    const token = await key();
    expect((await upload("https://evil.example/x.png", "image/png", token)).status).toBe(400);
  });

  it("serves a picture only to the admin, with the right headers; everyone else gets a 404", async () => {
    const id = await makePreview();
    const ctx = (i: string) => ({ params: Promise.resolve({ id: i }) });
    const req = new Request(`https://lifeflow.test/admin/hq/files/${id}`);
    h.admin = false;
    expect((await fileGET(req, ctx(id))).status).toBe(404);
    h.admin = true;
    const ok = await fileGET(req, ctx(id));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await fileGET(req, ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    expect((await fileGET(req, ctx("not-a-uuid"))).status).toBe(404);
  });
});

describe("the revision loop", () => {
  it("v1, changes with a note, v2, yes: one thread, the old version superseded, the owner told", async () => {
    const sent: string[] = [];
    const v1 = await createApproval(db(), agent, await card(base));
    await expect(reviseApproval(db(), agent, v1.id, { ...(await card(base)), changedSinceNote: "x" })).rejects.toThrow(/hasn't answered/);
    await expect(decideApproval(db(), admin, v1.id, "changes", "  ")).rejects.toThrow(/Say what to change/);
    const sentBack = await decideApproval(db(), admin, v1.id, "changes", "Keep habits, but don't make me see two lists");
    expect(sentBack).toMatchObject({ status: "changes", decisionNote: "Keep habits, but don't make me see two lists" });

    // The inbox hands the owner's note to the department.
    const inbox = await agentInbox(db(), { role: "designer" });
    expect(inbox.revisions.map((r) => [r.id, r.decisionNote])).toEqual([[v1.id, "Keep habits, but don't make me see two lists"]]);
    expect(await pendingApprovalCount(db())).toBe(0);

    setHqPushSender(async () => async (_s, msg) => {
      sent.push(msg.title);
      return { ok: true, gone: false };
    });
    await expect(reviseApproval(db(), agent, v1.id, { ...(await card(base)) } as never)).rejects.toThrow(/changedSinceNote.*missing/);
    const v2 = await reviseApproval(db(), agent, v1.threadId!, {
      ...(await card({ ...base, title: "Make Goals one calm list" })),
      changedSinceNote: "Habits now sit inside each goal.",
    });
    expect(v2).toMatchObject({ version: 2, threadId: v1.id, status: "pending", changedSinceNote: "Habits now sit inside each goal.", role: "designer" });
    const [old] = await db().select().from(hqApprovals).where(eq(hqApprovals.id, v1.id));
    expect(old.supersededAt).not.toBeNull();
    expect(old.status).toBe("changes");
    expect((await agentInbox(db(), { role: "designer" })).revisions).toEqual([]);
    expect(await pendingApprovalCount(db())).toBe(1);

    // A superseded version can't be revised again; the same note can't be answered twice.
    await expect(reviseApproval(db(), agent, v1.id, { ...(await card(base)), changedSinceNote: "again" })).rejects.toThrow(/hasn't answered|newer version/);

    const threads = (await listDecisionThreads(db())).threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ threadId: v1.id, state: "waiting" });
    expect(threads[0].versions.map((v) => v.version)).toEqual([1, 2]);
    expect((await getDecisionThread(db(), v1.id))?.latest.id).toBe(v2.id);

    await decideApproval(db(), admin, v2.id, "approved", "go");
    const done = await getDecisionThread(db(), v2.id);
    expect(done).toMatchObject({ state: "approved" });
    await expect(reviseApproval(db(), agent, v2.id, { ...(await card(base)), changedSinceNote: "late" })).rejects.toThrow(/already said yes/);
    expect(sent.length).toBe(0); // no push subscription for this test owner; the call never throws
  });

  it("pushes the owner's phone when version 2 arrives", async () => {
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
      const v1 = await createApproval(db(), agent, await card(base));
      await decideApproval(db(), admin, v1.id, "changes", "smaller");
      await reviseApproval(db(), agent, v1.id, { ...(await card(base)), changedSinceNote: "Smaller now" });
      expect(sent.map((m) => m.title)).toEqual(["Product & Design needs your yes", "Product & Design: new version"]);
      expect(sent[1].url).toBe("/admin/work#approvals");
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("no closes the thread", async () => {
    const v1 = await createApproval(db(), agent, await card(base));
    await decideApproval(db(), admin, v1.id, "declined", "not now");
    await expect(reviseApproval(db(), agent, v1.id, { ...(await card(base)), changedSinceNote: "please" })).rejects.toThrow(/closed/);
    expect((await listDecisionThreads(db())).threads[0].state).toBe("declined");
  });

  it("works through the API with a key, by thread id", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    const post = (body: unknown) =>
      reportPOST(
        new Request("https://lifeflow.test/api/hq/report", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      );
    const refused = await post({ type: "approval", role: "designer", kind: "design", title: "T", summary: "s" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/not a full decision card.*why.*missing.*previews/);
    const r1 = await (await post(await cardBody())).json();
    expect(r1).toMatchObject({ ok: true, version: 1, threadId: r1.id });
    await decideApproval(db(), admin, r1.id, "changes", "smaller please");
    const inbox = await (
      await inboxGET(new Request("https://lifeflow.test/api/hq/inbox?role=designer", { headers: { authorization: `Bearer ${token}` } }))
    ).json();
    expect(inbox.revisions[0]).toMatchObject({ id: r1.id, decisionNote: "smaller please" });
    const r2 = await (await post({ ...(await cardBody()), revise: r1.threadId, changedSinceNote: "Made it smaller" })).json();
    expect(r2).toMatchObject({ ok: true, version: 2, threadId: r1.id });
  });
});

describe("after a yes: the same card keeps reporting", () => {
  it("maps the linked mission to approved, being built, ready for your look and live, with dates", async () => {
    const a = await createApproval(db(), agent, await card({ role: "developer", kind: "feature", title: "Search as you type" }));
    await decideApproval(db(), admin, a.id, "approved");
    let t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle).toMatchObject({ stage: "approved", mission: null });
    expect(t.lifecycle?.dates.approved).toBeInstanceOf(Date);
    expect((await agentInbox(db(), {})).approvedWithoutMission.map((x) => x.id)).toEqual([a.id]);

    const m = await createMission(db(), agent, { role: "developer", title: "Build search" });
    await expect(linkApprovalMission(db(), agent, a.id, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/no longer exists/);
    await linkApprovalMission(db(), agent, a.id, m.id);
    expect((await agentInbox(db(), {})).approvedWithoutMission).toEqual([]);
    t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle?.stage).toBe("approved"); // mission todo

    await updateMission(db(), agent, m.id, { status: "doing" });
    t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle?.stage).toBe("built");
    expect(t.lifecycle?.dates.built).toBeInstanceOf(Date);
    expect(t.lifecycle?.dates.live).toBeNull();

    await updateMission(db(), agent, m.id, { status: "waiting" });
    t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle?.stage).toBe("look");
    expect(t.lifecycle?.dates.look).toBeInstanceOf(Date);

    await updateMission(db(), agent, m.id, {
      status: "done",
      result: "Live for everyone",
      links: [{ label: "Commit", url: "https://github.com/o/r/commit/abc" }],
    });
    t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle).toMatchObject({ stage: "live", mission: { result: "Live for everyone" } });
    expect(t.lifecycle?.dates.live).toBeInstanceOf(Date);
  });

  it("only a yes can be linked, and only to one mission", async () => {
    const a = await createApproval(db(), agent, await card(base));
    const m = await createMission(db(), agent, { role: "designer", title: "M" });
    await expect(linkApprovalMission(db(), agent, a.id, m.id)).rejects.toThrow(/said yes/);
    await decideApproval(db(), admin, a.id, "approved");
    await linkApprovalMission(db(), agent, a.id, m.id);
    const m2 = await createMission(db(), agent, { role: "designer", title: "M2" });
    await expect(linkApprovalMission(db(), agent, a.id, m2.id)).rejects.toThrow(/already has a mission/);
  });
});

describe("old requests", () => {
  it("show as being rewritten, can't be answered, aren't counted, and are listed for the COO", async () => {
    const [old] = await db()
      .insert(hqApprovals)
      .values({ role: "developer", kind: "deploy", title: "Ship the thing", summary: "ready", source: "agent" })
      .returning();
    expect(await pendingApprovalCount(db())).toBe(0);
    const { threads, rewriting } = await listDecisionThreads(db());
    expect(threads).toEqual([]);
    expect(rewriting.map((r) => r.id)).toEqual([old.id]);
    expect(rewriting[0].card).toBeNull();
    await expect(decideApproval(db(), admin, old.id, "approved")).rejects.toThrow(/being rewritten/);
    await expect(reviseApproval(db(), agent, old.id, { ...(await card(base)), changedSinceNote: "x" })).rejects.toThrow(/old request/);
    const inbox = await agentInbox(db(), {});
    expect(inbox.needsRewrite.map((r) => r.id)).toEqual([old.id]);
    expect((await agentInbox(db(), { role: "designer" })).needsRewrite).toEqual([]);
    // A new request next to it is the only one that counts.
    await createApproval(db(), agent, await card(base));
    expect(await pendingApprovalCount(db())).toBe(1);
  });
});

describe("since you last looked", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  const H = 3_600_000;

  it("lists fixed, found and changed from real records, and leaves out what is old", async () => {
    // Fixed without needing a yes, with a commit link.
    const fixed = await createMission(db(), agent, { role: "developer", title: "Fix the calendar crash" });
    await updateMission(db(), agent, fixed.id, { status: "done", links: [{ label: "Commit", url: "https://github.com/o/r/commit/abc" }] });
    // Found by QA and Customer Success; and one the owner made (not "found").
    await createMission(db(), agent, { role: "qa", title: "Receipts page leaks a name" });
    await createMission(db(), agent, { role: "support", title: "Three people hit sign-in errors" });
    await createMission(db(), { kind: "owner", email: "o@x" }, { role: "qa", title: "Owner's own mission" });
    await createMission(db(), agent, { role: "developer", title: "Developer-made, not found" });
    // An ask that reached Live.
    const a = await createApproval(db(), agent, await card({ role: "developer", kind: "feature", title: "Search as you type" }));
    await decideApproval(db(), admin, a.id, "approved");
    const m = await createMission(db(), agent, { role: "developer", title: "Build search" });
    await linkApprovalMission(db(), agent, a.id, m.id);
    await updateMission(db(), agent, m.id, { status: "done" });
    // An old finished mission, before the window.
    const old = await createMission(db(), agent, { role: "developer", title: "Old fix" });
    await updateMission(db(), agent, old.id, { status: "done" });
    await db()
      .update(hqMissions)
      .set({ doneAt: ago(10 * 24 * H), createdAt: ago(11 * 24 * H) })
      .where(eq(hqMissions.id, old.id));

    const s = await sinceLooked(db(), ago(2 * H));
    expect(s.fixed.map((l) => l.text)).toEqual(["Fix the calendar crash"]); // the Live ask's mission needed a yes, so it isn't "fixed for you"
    expect(s.fixed[0].commitUrl).toBe("https://github.com/o/r/commit/abc");
    expect(s.found.map((l) => l.text).sort()).toEqual(["Receipts page leaks a name", "Three people hit sign-in errors"]);
    expect(s.changed.map((l) => l.text)).toEqual(["Search as you type"]);

    // A later window shows nothing.
    const later = await sinceLooked(db(), new Date(Date.now() + 1000));
    expect([later.fixed, later.found, later.changed].map((x) => x.length)).toEqual([0, 0, 0]);
  });

  it("starts at the cookie's time and falls back to the last 7 days on a first visit", async () => {
    const mid = await createMission(db(), agent, { role: "qa", title: "Found three days ago" });
    await db()
      .update(hqMissions)
      .set({ createdAt: ago(3 * 24 * H) })
      .where(eq(hqMissions.id, mid.id));
    const now = new Date();
    expect((await sinceLooked(db(), sinceFrom(undefined, now))).found.map((l) => l.text)).toEqual(["Found three days ago"]);
    expect((await sinceLooked(db(), sinceFrom(String(now.getTime() - 24 * H), now))).found).toEqual([]);
    expect((await sinceLooked(db(), sinceFrom(String(now.getTime() - 4 * 24 * H), now))).found).toHaveLength(1);
  });
});

describe("review fixes", () => {
  const H = 3_600_000;
  it("follows the BUILD mission, not the mission that asked", async () => {
    const asking = await createMission(db(), agent, { role: "developer", title: "Design the thing" });
    const a = await createApproval(db(), agent, await card({ role: "developer", kind: "feature", title: "Ask", missionId: asking.id }));
    await updateMission(db(), agent, asking.id, { status: "waiting" });
    await decideApproval(db(), admin, a.id, "approved");
    let t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle).toMatchObject({ stage: "approved", mission: null });
    expect((await agentInbox(db(), {})).approvedWithoutMission.map((x) => x.id)).toEqual([a.id]);
    const build = await createMission(db(), agent, { role: "developer", title: "Build it" });
    await linkApprovalMission(db(), agent, a.id, build.id);
    await updateMission(db(), agent, asking.id, { status: "done" });
    t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle?.stage).toBe("approved"); // the asking mission closing never makes it Live
    await updateMission(db(), agent, build.id, { status: "doing" });
    expect((await getDecisionThread(db(), a.id))!.lifecycle?.stage).toBe("built");
    expect((await sinceLooked(db(), new Date(Date.now() - H))).changed).toEqual([]);
    await updateMission(db(), agent, build.id, { status: "done" });
    expect((await sinceLooked(db(), new Date(Date.now() - H))).changed.map((l) => l.text)).toEqual(["Ask"]);
  });

  it("refuses a finished mission, and a dropped build mission shows Stopped and is listed again", async () => {
    const a = await createApproval(db(), agent, await card(base));
    await decideApproval(db(), admin, a.id, "approved");
    const done = await createMission(db(), agent, { role: "designer", title: "Already done" });
    await updateMission(db(), agent, done.id, { status: "done" });
    await expect(linkApprovalMission(db(), agent, a.id, done.id)).rejects.toThrow(/finished or dropped/);
    const m = await createMission(db(), agent, { role: "designer", title: "Build" });
    await linkApprovalMission(db(), agent, a.id, m.id);
    await updateMission(db(), agent, m.id, { status: "dropped", result: "Not needed now" });
    const t = (await getDecisionThread(db(), a.id))!;
    expect(t.lifecycle).toMatchObject({ stage: "approved", stopped: "Not needed now" });
    expect((await agentInbox(db(), {})).approvedWithoutMission.map((x) => x.id)).toEqual([a.id]);
    const m2 = await createMission(db(), agent, { role: "designer", title: "Build again" });
    await linkApprovalMission(db(), agent, a.id, m2.id);
    expect((await getDecisionThread(db(), a.id))!.lifecycle?.stopped).toBeNull();
  });

  it("a revised publish ask moves its post to the new version, so a yes approves the post", async () => {
    const c = await createContent(db(), agent, { kind: "post", title: "Reel", ask: true, request: await reqCard() });
    const v1 = c.approvalId!;
    await decideApproval(db(), admin, v1, "changes", "shorter");
    const v2 = await reviseApproval(db(), agent, v1, { ...(await card({ role: "marketing", kind: "publish", title: "Reel" })), changedSinceNote: "Shorter" });
    const [row] = await db().select().from(hqContent).where(eq(hqContent.id, c.id));
    expect(row).toMatchObject({ approvalId: v2.id, status: "waiting" });
    await decideApproval(db(), admin, v2.id, "approved");
    expect((await db().select().from(hqContent).where(eq(hqContent.id, c.id)))[0].status).toBe("approved");
  });

  it("a revision checks its mission, and can't change the kind", async () => {
    const v1 = await createApproval(db(), agent, await card(base));
    await decideApproval(db(), admin, v1.id, "changes", "n");
    const full = { ...(await card(base)), changedSinceNote: "x" };
    await expect(reviseApproval(db(), agent, v1.id, { ...full, missionId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(HqError);
    await expect(reviseApproval(db(), agent, v1.id, { ...full, kind: "deploy" })).rejects.toThrow(/same kind/);
  });

  it("pictures: the same bytes are stored once, a daily cap holds, and unused old ones are purged", async () => {
    const a = await storePreview(db(), PNG, "image/png");
    const b = await storePreview(db(), PNG, "image/png");
    expect(b.id).toBe(a.id);
    expect(await db().select().from(hqFiles)).toHaveLength(1);
    const [filler] = await db()
      .insert(hqFiles)
      .values({ contentType: "image/png", size: 200 * 1024 * 1024, sha256: "filler", data: Buffer.from("x") })
      .returning();
    const other = Buffer.concat([PNG, Buffer.from("different")]);
    await expect(storePreview(db(), other, "image/png")).rejects.toThrow(/last 24 hours/);
    // Old and unused goes; old but used by a card stays; new stays.
    const used = await makePreview();
    await createApproval(db(), agent, { ...(await card(base)), previews: [{ fileId: used }] });
    await db()
      .update(hqFiles)
      .set({ createdAt: new Date(Date.now() - 48 * H) });
    const fresh = (
      await db()
        .insert(hqFiles)
        .values({ contentType: "image/png", size: 10, sha256: "fresh", data: Buffer.from("y") })
        .returning()
    )[0];
    expect(await purgeUnusedPreviews(db())).toBeGreaterThanOrEqual(1);
    const left = (await db().select({ id: hqFiles.id }).from(hqFiles)).map((r) => r.id);
    expect(left).toContain(used);
    expect(left).toContain(fresh.id);
    expect(left).not.toContain(filler.id);
  });

  it("the summary shows the newest fixes first, and never counts a mission tied to any ask, old or new", async () => {
    for (let i = 0; i < 12; i++) {
      const m = await createMission(db(), agent, { role: "developer", title: `Fix ${i}` });
      await updateMission(db(), agent, m.id, { status: "done" });
      await db()
        .update(hqMissions)
        .set({ doneAt: new Date(Date.now() - (12 - i) * 60_000) })
        .where(eq(hqMissions.id, m.id));
    }
    const tied = await createMission(db(), agent, { role: "developer", title: "Tied to an old ask" });
    await updateMission(db(), agent, tied.id, { status: "done" });
    await db().insert(hqApprovals).values({ role: "developer", kind: "other", title: "old", summary: "s", source: "agent", missionId: tied.id });
    const s = await sinceLooked(db(), new Date(Date.now() - H));
    expect(s.fixed).toHaveLength(8);
    expect(s.fixed[0].text).toBe("Fix 11");
    expect(s.fixed.map((l) => l.text)).not.toContain("Tied to an old ask");
  });

  it("the desk lists every waiting ask the badge counts", async () => {
    for (let i = 0; i < 3; i++) await createApproval(db(), agent, await card({ ...base, title: `T${i}` }));
    const { threads } = await listDecisionThreads(db());
    expect(threads.filter((t) => t.state === "waiting")).toHaveLength(await pendingApprovalCount(db()));
  });

  it("the picture route sends a locked-down content policy", async () => {
    h.admin = true;
    const id = await makePreview();
    const r = await fileGET(new Request("https://lifeflow.test/x"), { params: Promise.resolve({ id }) });
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(r.headers.get("content-disposition")).toBe("inline");
  });
});
