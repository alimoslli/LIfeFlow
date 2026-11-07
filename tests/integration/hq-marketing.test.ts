import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as inboxGET } from "@/app/api/hq/inbox/route";
import { POST as reportPOST } from "@/app/api/hq/report/route";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, hqActivity, hqApprovals, hqContent, hqKeys, hqMetrics, hqSettings, rateLimitBuckets } from "@/server/db/schema";
import { agentInbox, createHqKey, decideApproval, HqError, listActivity, setHqPushSender, weeklySummary, type HqActor } from "@/server/services/hq";
import {
  createContent,
  getContent,
  getControls,
  listContent,
  marketingView,
  marketingWeek,
  recordMetrics,
  saveControls,
  updateContent,
} from "@/server/services/hq-marketing";
import { makeUser } from "../helpers";
import { reqCard } from "../hq-fixtures";

afterAll(async () => {
  setHqPushSender(null);
  // Leave the shared test database clean for the other HQ tests (weekly headline counts).
  const d = getDb();
  await d.delete(hqMetrics);
  await d.delete(hqContent);
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqKeys);
  await d.delete(adminActions);
  await closeDb();
});

const db = () => getDb();
const owner: HqActor = { kind: "owner", email: "owner@test.local" };
const agent: HqActor = { kind: "agent", keyName: "LF Marketing", sessionId: null };
const SID = "session_01Mhcz6Ao4XdmNh3eAPYd3QN";
let admin: { id: string; email: string };

beforeEach(async () => {
  const d = db();
  await d.delete(hqMetrics);
  await d.delete(hqContent);
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqKeys);
  await d.delete(adminActions);
  await d.delete(hqSettings);
  await d.delete(rateLimitBuckets);
  setHqPushSender(null);
  const { user } = await makeUser("HQ Marketing Owner");
  admin = { id: user.id, email: user.email };
});

const texts = async () => (await listActivity(db(), { limit: 100 })).map((a) => a.text);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("content lifecycle", () => {
  it("create, ask, yes, schedule, publish", async () => {
    const sent: { title: string; body: string }[] = [];
    setHqPushSender(async () => async (_s, msg) => {
      sent.push(msg);
      return { ok: true, gone: false };
    });
    const when = day(3).toISOString();
    const c = await createContent(
      db(),
      { ...agent, sessionId: SID },
      {
        kind: "post",
        title: "  Two   subscriptions ",
        hook: "You paid twice",
        platforms: ["instagram"],
        scheduledFor: when,
        ask: true,
        request: await reqCard(),
      },
    );
    expect(c).toMatchObject({ title: "Two subscriptions", status: "waiting", source: "agent", sessionId: SID, platforms: ["instagram"] });
    expect(c.approvalId).toBeTruthy();
    const [ap] = await db().select().from(hqApprovals).where(eq(hqApprovals.id, c.approvalId!));
    expect(ap).toMatchObject({ role: "marketing", kind: "publish", title: "Publish: Two subscriptions", status: "pending" });
    expect(ap.summary).toMatch(/You paid twice/);
    expect(ap.summary).toMatch(/Instagram/);
    expect(await texts()).toContain("Asked for your yes: Publish: Two subscriptions");

    // Nothing can be scheduled before the owner says yes, and an agent can't approve it.
    await expect(updateContent(db(), agent, c.id, { status: "approved" })).rejects.toThrow(/Only your yes/);
    await expect(updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_1" })).rejects.toThrow(HqError);
    await expect(updateContent(db(), agent, c.id, { title: "Changed after asking" })).rejects.toThrow(/new draft/);

    await decideApproval(db(), admin, ap.id, "approved");
    expect((await getContent(db(), c.id))?.status).toBe("approved");
    expect((await agentInbox(db(), {})).approvedContent.map((x) => x.id)).toEqual([c.id]);

    await expect(updateContent(db(), agent, c.id, { status: "published" })).rejects.toThrow(/link|id/);
    const sch = await updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_123" });
    expect(sch).toMatchObject({ status: "scheduled", externalId: "mc_123" });
    expect((await agentInbox(db(), {})).approvedContent).toEqual([]);
    const pub = await updateContent(db(), agent, c.id, { status: "published", publishedUrl: "https://instagram.com/p/abc" });
    expect(pub).toMatchObject({ status: "published", publishedUrl: "https://instagram.com/p/abc", externalId: "mc_123" });
    await expect(updateContent(db(), agent, c.id, { hook: "x" })).rejects.toThrow(/already published/);

    const t = await texts();
    expect(t).toContain(`"Two subscriptions" approved`);
    expect(t).toContain(`"Two subscriptions" scheduled`);
    expect(t).toContain(`"Two subscriptions" published`);
    expect(sent).toHaveLength(0); // no owner with a subscription here; the sender is still consulted without failing
  });

  it("an agent schedules an approved post and sets its time in the same update", async () => {
    const c = await createContent(db(), agent, { kind: "post", title: "Time me", ask: true, request: await reqCard() });
    await decideApproval(db(), admin, c.approvalId!, "approved");
    expect((await agentInbox(db(), {})).approvedContent.map((x) => x.id)).toEqual([c.id]);
    const when = day(2).toISOString();
    // Without the scheduler id in the same update, the time can't be set.
    await expect(updateContent(db(), agent, c.id, { scheduledFor: when })).rejects.toThrow(/scheduledFor/);
    const done = await updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_9", scheduledFor: when });
    expect(done).toMatchObject({ status: "scheduled", externalId: "mc_9" });
    expect(done.scheduledFor?.toISOString()).toBe(when);
    expect((await agentInbox(db(), {})).approvedContent).toEqual([]);
    // After that the agent can't move it again.
    await expect(updateContent(db(), agent, c.id, { scheduledFor: day(3).toISOString() })).rejects.toThrow(/scheduledFor/);
  });

  it("with posting times switched off, an agent schedules only at the time on the post", async () => {
    await saveControls(db(), admin, { delegations: { postingTimes: false } });
    const planned = day(2).toISOString();
    const c = await createContent(db(), agent, { kind: "post", title: "Owner's time", ask: true, request: await reqCard(), scheduledFor: planned });
    await decideApproval(db(), admin, c.approvalId!, "approved");
    // A time of its own choosing is refused, and nothing changes.
    await expect(updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_1", scheduledFor: day(3).toISOString() })).rejects.toThrow(
      /switched off/,
    );
    await expect(updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_1", scheduledFor: null })).rejects.toThrow(/switched off/);
    expect(await getContent(db(), c.id)).toMatchObject({ status: "approved", externalId: null });
    // The time the owner saw on the request is fine, sent again or left out.
    const same = await updateContent(db(), agent, c.id, { status: "scheduled", externalId: "mc_1", scheduledFor: planned });
    expect(same.scheduledFor?.toISOString()).toBe(planned);
    const d = await createContent(db(), agent, { kind: "post", title: "No time given", ask: true, request: await reqCard(), scheduledFor: planned });
    await decideApproval(db(), admin, d.approvalId!, "approved");
    expect(await updateContent(db(), agent, d.id, { status: "scheduled", externalId: "mc_2" })).toMatchObject({ status: "scheduled" });
    // Switched back on, the COO may pick the time.
    await saveControls(db(), admin, { delegations: { postingTimes: true } });
    const e = await createContent(db(), agent, { kind: "post", title: "Picked time", ask: true, request: await reqCard(), scheduledFor: planned });
    await decideApproval(db(), admin, e.approvalId!, "approved");
    const chosen = day(4).toISOString();
    const picked = await updateContent(db(), agent, e.id, { status: "scheduled", externalId: "mc_3", scheduledFor: chosen });
    expect(picked.scheduledFor?.toISOString()).toBe(chosen);
  });

  it("queued lists approved or scheduled posts that have no place in the week", async () => {
    const mk = async (title: string, scheduledFor?: string) => {
      const c = await createContent(db(), agent, { kind: "post", title, ask: true, request: await reqCard(), ...(scheduledFor ? { scheduledFor } : {}) });
      await decideApproval(db(), admin, c.approvalId!, "approved");
      return c;
    };
    const none = await mk("No date");
    const past = await mk("Past", day(-2).toISOString());
    const far = await mk("Far", day(30).toISOString());
    const soon = await mk("Soon", day(3).toISOString());
    const v = await marketingView(db());
    expect(v.week.map((x) => x.id)).toEqual([soon.id]);
    expect(v.queued.map((x) => x.id)).toEqual([past.id, far.id, none.id]);
  });

  it("asking for a yes is one step: linked and waiting, one push, and a failed push undoes nothing", async () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = admin.email;
    try {
      const { withUser } = await import("@/server/db/with-user");
      const { saveSubscription } = await import("@/server/services/push");
      await withUser(
        admin.id,
        (sc) => saveSubscription(sc, { endpoint: `https://push.example.test/${admin.id}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } }),
        db(),
      );
      let sent = 0;
      let fail = false;
      setHqPushSender(async () => async () => {
        sent++;
        if (fail) throw new Error("push service down");
        return { ok: true, gone: false };
      });
      const c = await createContent(db(), agent, { kind: "post", title: "Atomic", ask: true, request: await reqCard() });
      expect(c).toMatchObject({ status: "waiting" });
      expect(c.approvalId).toBeTruthy();
      const [ap] = await db().select().from(hqApprovals).where(eq(hqApprovals.id, c.approvalId!));
      expect(ap).toMatchObject({ status: "pending", title: "Publish: Atomic" });
      expect(sent).toBe(1);

      fail = true;
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const c2 = await createContent(db(), agent, { kind: "post", title: "Atomic two", ask: true, request: await reqCard() });
      err.mockRestore();
      expect(sent).toBe(2);
      expect(await getContent(db(), c2.id)).toMatchObject({ status: "waiting", approvalId: c2.approvalId });
      expect(await db().select().from(hqApprovals)).toHaveLength(2);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("a failure while asking leaves no half-made post", async () => {
    // A publish request can't be made for research, and nothing is saved when it is refused.
    await expect(
      createContent(db(), agent, { kind: "research", title: "R", links: [{ label: "s", url: "https://a.example/x" }], ask: true, request: await reqCard() }),
    ).rejects.toThrow();
    expect(await db().select().from(hqContent)).toHaveLength(0);
    expect(await db().select().from(hqApprovals)).toHaveLength(0);
  });

  it("pushes the owner when an agent asks", async () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = admin.email;
    try {
      const { withUser } = await import("@/server/db/with-user");
      const { saveSubscription } = await import("@/server/services/push");
      await withUser(
        admin.id,
        (sc) => saveSubscription(sc, { endpoint: `https://push.example.test/${admin.id}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } }),
        db(),
      );
      const sent: { title: string; body: string }[] = [];
      setHqPushSender(async () => async (_s, msg) => {
        sent.push(msg);
        return { ok: true, gone: false };
      });
      await createContent(db(), agent, { kind: "post", title: "Push me", ask: true, request: await reqCard() });
      expect(sent).toEqual([expect.objectContaining({ body: "Publish: Push me" })]);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("no = dropped, changes = draft with the note in the activity", async () => {
    const a = await createContent(db(), agent, { kind: "script", title: "A", ask: true, request: await reqCard() });
    const b = await createContent(db(), agent, { kind: "script", title: "B", ask: true, request: await reqCard() });
    await decideApproval(db(), admin, a.approvalId!, "declined");
    await decideApproval(db(), admin, b.approvalId!, "changes", "Shorter hook");
    expect((await getContent(db(), a.id))?.status).toBe("dropped");
    expect((await getContent(db(), b.id))?.status).toBe("draft");
    expect(await texts()).toContain(`"B" sent back to draft: Shorter hook`);
    // The agent can edit it again and ask again.
    await expect(updateContent(db(), agent, b.id, { hook: "Short" })).resolves.toMatchObject({ hook: "Short" });
    await expect(updateContent(db(), agent, a.id, { hook: "x" })).rejects.toThrow(/dropped/);
  });

  it("an approval for something else leaves content alone; a decided one can't move content later", async () => {
    const c = await createContent(db(), agent, { kind: "post", title: "C", ask: true, request: await reqCard() });
    await updateContent(db(), owner, c.id, { status: "dropped" });
    // Dropping closes the pending request, so it can't be answered later.
    await expect(decideApproval(db(), admin, c.approvalId!, "approved")).rejects.toThrow(/already decided/);
    expect((await getContent(db(), c.id))?.status).toBe("dropped");
  });

  it("owner can drop and edit; agents can't drop or approve; research needs a source", async () => {
    const c = await createContent(db(), agent, { kind: "concept", title: "Idea", status: "idea" });
    expect(c.status).toBe("idea");
    await expect(updateContent(db(), agent, c.id, { status: "dropped" })).rejects.toThrow(/Only the owner/);
    await expect(updateContent(db(), agent, c.id, { status: "approved" })).rejects.toThrow(/Only your yes/);
    const e = await updateContent(db(), owner, c.id, { title: "Better", hook: "H", body: "B", scheduledFor: day(2).toISOString() });
    expect(e).toMatchObject({ title: "Better", hook: "H", body: "B" });
    expect(e.scheduledFor).not.toBeNull();
    expect((await updateContent(db(), owner, c.id, { status: "dropped" })).status).toBe("dropped");

    await expect(createContent(db(), agent, { kind: "research", title: "Finding" })).rejects.toThrow(/source link/);
    const r = await createContent(db(), agent, { kind: "research", title: "Finding", links: [{ label: "Source", url: "https://example.com/a" }] });
    expect(r.kind).toBe("research");
    await expect(updateContent(db(), agent, r.id, { links: [] })).rejects.toThrow(/source link/);
    await expect(createContent(db(), agent, { kind: "post", title: "Bad", links: [{ label: "x", url: "javascript:1" }] })).rejects.toThrow(HqError);
  });

  it("lists with filters and records a plain activity line", async () => {
    await createContent(db(), owner, { kind: "post", title: "P1" });
    await createContent(db(), owner, { kind: "concept", title: "C1", status: "idea" });
    expect((await listContent(db())).map((x) => x.title).sort()).toEqual(["C1", "P1"]);
    expect((await listContent(db(), { kind: ["concept"] })).map((x) => x.title)).toEqual(["C1"]);
    expect((await listContent(db(), { status: ["draft"] })).map((x) => x.title)).toEqual(["P1"]);
    expect(await texts()).toContain(`Added a post: "P1"`);
    expect(await getContent(db(), "not-an-id")).toBeNull();
  });
});

describe("metrics", () => {
  it("upserts one reading per day, network, metric and post, and reports the previous value", async () => {
    await recordMetrics(db(), agent, [
      { takenOn: ago(7), network: "instagram", metric: "followers", value: 100 },
      { takenOn: ago(1), network: "instagram", metric: "followers", value: 120 },
      { takenOn: ago(1), network: "instagram", metric: "reach", value: 900 },
    ]);
    // Same day again: replaced, not duplicated. Duplicates inside one call: the last wins.
    const r = await recordMetrics(db(), agent, [
      { takenOn: ago(1), network: "instagram", metric: "followers", value: 121 },
      { takenOn: ago(1), network: "instagram", metric: "followers", value: 125 },
    ]);
    expect(r.saved).toBe(1);
    expect(await db().select().from(hqMetrics)).toHaveLength(3);
    const ig = (await marketingView(db())).performance.find((p) => p.network === "instagram")!;
    expect(ig.asOf).toBe(ago(1));
    expect(ig.latest).toEqual([
      { metric: "followers", value: 125, takenOn: ago(1), previous: 100 },
      { metric: "reach", value: 900, takenOn: ago(1), previous: null },
    ]);
  });

  it("keeps a post's reading apart from the account's, and refuses an unknown post", async () => {
    const c = await createContent(db(), agent, { kind: "post", title: "P" });
    await recordMetrics(db(), agent, [
      { takenOn: ago(1), network: "instagram", metric: "views", value: 5 },
      { takenOn: ago(1), network: "instagram", metric: "views", value: 50, contentId: c.id },
    ]);
    expect(await db().select().from(hqMetrics)).toHaveLength(2);
    const ig = (await marketingView(db())).performance.find((p) => p.network === "instagram")!;
    expect(ig.latest).toEqual([{ metric: "views", value: 5, takenOn: ago(1), previous: null }]);
    await expect(
      recordMetrics(db(), agent, [{ takenOn: ago(1), network: "instagram", metric: "views", value: 1, contentId: "00000000-0000-4000-8000-000000000009" }]),
    ).rejects.toThrow(/doesn't exist/);
    expect(await db().select().from(hqMetrics)).toHaveLength(2);
  });

  it("is all or nothing on bad input", async () => {
    await expect(
      recordMetrics(db(), agent, [
        { takenOn: ago(1), network: "instagram", metric: "followers", value: 1 },
        { takenOn: ago(1), network: "instagram", metric: "followers2", value: -4 },
      ]),
    ).rejects.toThrow(/Reading 2/);
    expect(await db().select().from(hqMetrics)).toHaveLength(0);
    expect((await recordMetrics(db(), agent, [])).saved).toBe(0);
  });
});

describe("marketing view", () => {
  it("has every network and no made-up numbers when empty", async () => {
    const v = await marketingView(db());
    expect(v.performance.map((p) => p.network)).toEqual(["instagram", "tiktok", "youtube", "facebook", "linkedin"]);
    for (const p of v.performance) expect(p).toEqual({ network: p.network, latest: [], asOf: null });
    expect([v.week, v.unscheduled, v.waiting, v.research, v.published]).toEqual([[], [], [], [], []]);
  });

  it("groups items into the lists", async () => {
    const soon = await createContent(db(), agent, { kind: "post", title: "Soon", scheduledFor: day(2).toISOString(), ask: true, request: await reqCard() });
    await createContent(db(), agent, { kind: "post", title: "Far", scheduledFor: day(30).toISOString() });
    await createContent(db(), agent, { kind: "concept", title: "Loose" });
    await createContent(db(), agent, { kind: "research", title: "Finding", links: [{ label: "s", url: "https://example.com" }] });
    const done = await createContent(db(), agent, { kind: "post", title: "Done", ask: true, request: await reqCard() });
    await decideApproval(db(), admin, done.approvalId!, "approved");
    await updateContent(db(), agent, done.id, { status: "published", publishedUrl: "https://instagram.com/p/z" });
    const v = await marketingView(db());
    expect(v.week.map((x) => x.title)).toEqual(["Soon"]);
    expect(v.unscheduled.map((x) => x.title)).toEqual(["Loose"]);
    expect(v.waiting.map((w) => [w.content.id, w.approval?.status])).toEqual([[soon.id, "pending"]]);
    expect(v.research.map((x) => x.title)).toEqual(["Finding"]);
    expect(v.published.map((x) => x.title)).toEqual(["Done"]);
    await recordMetrics(db(), agent, [{ takenOn: ago(0), network: "tiktok", metric: "followers", value: 7 }]);
    const tt = (await marketingView(db())).performance.find((p) => p.network === "tiktok")!;
    expect(tt.latest).toHaveLength(1);
    expect(tt.asOf).toBe(ago(0));
  });
});

describe("controls", () => {
  it("creates the row, saves changes and logs them", async () => {
    await db().delete(hqSettings);
    expect(await getControls(db())).toMatchObject({
      autonomous: true,
      rounds: { night: true, research: true, marketing: true },
      creditBudget: 0,
      updatedByEmail: null,
    });
    const c = await saveControls(db(), admin, { autonomous: false, rounds: { marketing: false }, creditBudget: 25 });
    expect(c).toMatchObject({ autonomous: false, rounds: { night: true, research: true, marketing: false }, creditBudget: 25, updatedByEmail: admin.email });
    expect(await getControls(db())).toMatchObject({ autonomous: false, creditBudget: 25 });
    const t = await texts();
    expect(t).toEqual(expect.arrayContaining(["Autonomous mode off", "Marketing round turned off", "Credit budget set to 25 credits a week"]));
    const acts = await db().select().from(adminActions);
    expect(acts.map((a) => a.action)).toEqual(["hq.controls_saved"]);
    // Nothing changed: nothing logged.
    await saveControls(db(), admin, { autonomous: false });
    expect(await db().select().from(adminActions)).toHaveLength(1);
    await saveControls(db(), admin, { autonomous: true });
    expect(await texts()).toContain("Autonomous mode on");
  });

  it("refuses bad values and unknown rounds", async () => {
    await expect(saveControls(db(), admin, { creditBudget: 10001 })).rejects.toThrow(HqError);
    await expect(saveControls(db(), admin, { rounds: { weekend: true } as never })).rejects.toThrow(HqError);
    expect((await getControls(db())).creditBudget).toBe(0);
  });

  it("reaches the inbox", async () => {
    await saveControls(db(), admin, { rounds: { night: false } });
    const r = await agentInbox(db(), {});
    expect(r.controls).toMatchObject({ autonomous: true, rounds: { night: false, research: true, marketing: true } });
    expect(r.approvedContent).toEqual([]);
  });
});

describe("weekly numbers", () => {
  it("counts drafts and status changes, and adds a headline", async () => {
    const empty = await weeklySummary(db());
    expect(empty.marketing).toEqual({ drafted: 0, approved: 0, scheduled: 0, published: 0 });
    expect(empty.headline.some((h) => h.startsWith("Marketing"))).toBe(false);
    const a = await createContent(db(), agent, { kind: "post", title: "A", ask: true, request: await reqCard() });
    await createContent(db(), agent, { kind: "post", title: "B" });
    await createContent(db(), agent, { kind: "post", title: "C" });
    await createContent(db(), agent, { kind: "research", title: "R", links: [{ label: "s", url: "https://example.com" }] });
    await decideApproval(db(), admin, a.approvalId!, "approved");
    await updateContent(db(), agent, a.id, { status: "scheduled", externalId: "mc" });
    const w = await weeklySummary(db());
    expect(w.marketing).toEqual({ drafted: 3, approved: 1, scheduled: 1, published: 0 });
    expect(w.headline).toContain("Marketing: 3 drafts, 1 approved, 1 scheduled, 0 published.");
    expect(await marketingWeek(db(), day(-7), day(0))).toEqual(w.marketing);
    expect(await marketingWeek(db(), day(-30), day(-20))).toEqual({ drafted: 0, approved: 0, scheduled: 0, published: 0 });
  });
});

describe("HQ API: content and metrics", () => {
  const post = (body: unknown, key?: string) =>
    reportPOST(
      new Request("https://lifeflow.test/api/hq/report", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
      }),
    );
  const get = (key: string) => inboxGET(new Request("https://lifeflow.test/api/hq/inbox", { headers: { authorization: `Bearer ${key}` } }));

  it("creates, updates and records metrics; refuses bad input; keeps the 401", async () => {
    expect((await post({ type: "content", kind: "post", title: "x" })).status).toBe(401);
    expect((await post({ type: "metrics", rows: [] }, "lfq_wrong")).status).toBe(401);
    const { token } = await createHqKey(db(), admin, "LF Marketing");

    const created = await post(
      { type: "content", kind: "post", title: "Hello", platforms: ["instagram"], sessionId: SID, ask: true, request: await reqCard() },
      token,
    );
    expect(created.status).toBe(200);
    const { id } = await created.json();
    expect(await getContent(db(), id)).toMatchObject({ status: "waiting", sessionId: SID, source: "agent" });

    // An agent can never approve, and unknown fields are refused.
    for (const bad of [{ status: "approved" }, { status: "waiting" }, { kind: "script" }, { publishedUrl: "http://x.example" }]) {
      const r = await post({ type: "content", id, ...bad }, token);
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await post({ type: "content", kind: "research", title: "R" }, token)).status).toBe(400);
    expect((await post({ type: "content", kind: "post", title: "" }, token)).status).toBe(400);
    expect((await post({ type: "content", kind: "post", title: "t", sessionId: "nope" }, token)).status).toBe(400);

    const row = { takenOn: ago(1), network: "instagram", metric: "followers", value: 10 };
    const m = await post({ type: "metrics", rows: [row] }, token);
    expect(await m.json()).toEqual({ ok: true, saved: 1 });
    for (const bad of [
      { type: "metrics" },
      { type: "metrics", rows: "x" },
      { type: "metrics", rows: [{ ...row, value: -1 }] },
      { type: "metrics", rows: [{ ...row, value: "NaN" }] },
      { type: "metrics", rows: [{ ...row, takenOn: "2999-01-01" }] },
      { type: "metrics", rows: Array.from({ length: 201 }, () => row) },
    ])
      expect((await post(bad, token)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);

    await decideApproval(db(), admin, (await getContent(db(), id))!.approvalId!, "approved");
    const inbox = await (await get(token)).json();
    expect(inbox.approvedContent.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(inbox.controls).toMatchObject({ autonomous: true });
    expect(inbox).toHaveProperty("missions");
    expect(inbox).toHaveProperty("decisions");
    const upd = await post({ type: "content", id, status: "scheduled", externalId: "mc_9" }, token);
    expect(upd.status).toBe(200);
  });
});
