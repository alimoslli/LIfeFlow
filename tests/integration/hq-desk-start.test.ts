import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, hqActivity, hqChats, hqMissions, rateLimitBuckets } from "@/server/db/schema";
import { addDeskTask, deskView } from "@/server/services/hq-desk";
import { FIRE_BETA, STARTS_PER_HOUR, fireConfig, startDeskTask } from "@/server/services/hq-desk-start";
import { deskLink, deskPin } from "@/server/hq/desk";
import type { Mission } from "@/server/hq/types";
import { createMission, getMission, updateMission } from "@/server/services/hq";
import { makeUser } from "../helpers";
import { deskTaskPrompt } from "../../scripts/hq";

afterAll(closeDb);

const db = () => getDb();
const URL_OK = "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire";
const config = { url: URL_OK, token: "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz" };
const NEW = "session_01DeskStartedAbcdefgh";
let admin: { id: string; email: string };

beforeEach(async () => {
  const d = db();
  await d.delete(hqActivity);
  await d.delete(hqMissions);
  await d.delete(hqChats);
  await d.delete(adminActions);
  await d.delete(rateLimitBuckets);
  const { user } = await makeUser("HQ Owner");
  admin = { id: user.id, email: user.email };
});

/** A fake fire endpoint: records the call and answers like Claude's (code.claude.com/docs/en/routines). */
function fakeFire(
  status = 200,
  body: unknown = { type: "routine_fire", claude_code_session_id: NEW, claude_code_session_url: `https://claude.ai/code/${NEW}` },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("starting a desk task from HQ (ADR 0030)", () => {
  const pinOf = (m: Mission) => deskLink(m).pin;

  it("fires the owner's desk task starter with only the mission id and the prompt's fingerprint, then follows the new chat", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Finish Twilio", prompt: "Check the SMS path." });
    const { f, calls } = fakeFire();
    const r = await startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: f });
    expect(r).toEqual({ sessionId: NEW, url: `https://claude.ai/code/${NEW}` });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL_OK);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h).toMatchObject({ authorization: `Bearer ${config.token}`, "anthropic-beta": FIRE_BETA, "anthropic-version": "2023-06-01" });
    expect(calls[0].init.redirect).toBe("error");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: `${m.id} ${pinOf(m)}` });
    const [row] = await db().select().from(hqMissions).where(eq(hqMissions.id, m.id));
    expect(row).toMatchObject({ status: "doing", sessionId: NEW, progress: "Starting in its chat" });
    expect((await db().select().from(adminActions)).map((a) => a.action)).toContain("hq.desk_started");
    // The new chat's own claim agrees with it.
    await updateMission(db(), { kind: "agent", keyName: "k", sessionId: NEW }, m.id, { status: "doing", claim: true, sessionId: NEW });
    expect((await db().select().from(hqMissions).where(eq(hqMissions.id, m.id)))[0].sessionId).toBe(NEW);
  });

  it("runs only the prompt the owner read: a changed task is refused before anything starts", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Plaid", prompt: "Run the tests." });
    const seen = pinOf(m);
    // An agent rewrites the prompt after the owner opened the desk.
    await updateMission(db(), { kind: "agent", keyName: "k", sessionId: null }, m.id, { deskPrompt: "Do something else entirely." });
    const { f, calls } = fakeFire();
    await expect(startDeskTask(db(), admin, m.id, seen, { config, fetch: f })).rejects.toThrow(/changed since you opened your desk/);
    await expect(startDeskTask(db(), admin, m.id, "not-a-pin", { config, fetch: f })).rejects.toThrow(/changed since/);
    expect(calls).toHaveLength(0);
  });

  it("one chat per task: refuses a task that has its chat, a second start in a row, and never reopens one finished meanwhile", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Vercel", prompt: "Tidy." });
    await startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: fakeFire().f });
    const again = (await getMission(db(), m.id))!;
    await expect(startDeskTask(db(), admin, m.id, pinOf(again), { config, fetch: fakeFire().f })).rejects.toThrow(/already has its own chat/);

    // A double tap (or a second tab) before the first start answers: the hold refuses the second.
    const m2 = await addDeskTask(db(), admin, { role: "developer", title: "Teams", prompt: "Check Teams." });
    let release: () => void = () => {};
    const slow = (async () => {
      await new Promise<void>((r) => (release = r));
      return new Response(JSON.stringify({ claude_code_session_id: "session_01SlowStartAbcdefghij" }), { status: 200 });
    }) as unknown as typeof fetch;
    const first = startDeskTask(db(), admin, m2.id, pinOf(m2), { config, fetch: slow });
    await new Promise((r) => setTimeout(r, 200));
    await expect(startDeskTask(db(), admin, m2.id, pinOf(m2), { config, fetch: fakeFire().f })).rejects.toThrow(/already starting/);
    // Finished while the start was on its way: it stays finished.
    await updateMission(db(), { kind: "owner", email: admin.email }, m2.id, { status: "done" });
    release();
    await first;
    expect((await getMission(db(), m2.id))!.status).toBe("done");
    await expect(startDeskTask(db(), admin, m2.id, pinOf(m2), { config, fetch: fakeFire().f })).rejects.toThrow(/finished/);
  });

  it("refuses without the set-up and for a mission that isn't on the desk", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Plaid", prompt: "Run the tests." });
    await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config: null, fetch: fakeFire().f })).rejects.toThrow(/isn't set up yet/);
    const plain = await createMission(db(), { kind: "owner", email: admin.email }, { role: "developer", title: "Not a desk file" });
    await expect(startDeskTask(db(), admin, plain.id, "0000000000000000", { config, fetch: fakeFire().f })).rejects.toThrow(/isn't a task on your desk/);
    await expect(startDeskTask(db(), admin, "nope", "0000000000000000", { config, fetch: fakeFire().f })).rejects.toThrow(/isn't a task on your desk/);
  });

  it("says plainly what went wrong, and changes nothing", async () => {
    const tries: [number, unknown, RegExp][] = [
      [401, { error: "bad token" }, /didn't accept the start key/],
      [429, {}, /too many starts/],
      [500, {}, /couldn't start the chat/],
      [200, { claude_code_session_id: "evil id" }, /can't follow/],
    ];
    for (const [status, body, msg] of tries) {
      const m = await addDeskTask(db(), admin, { role: "developer", title: `Try ${status}`, prompt: "Tidy." });
      await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: fakeFire(status, body).f })).rejects.toThrow(msg);
      expect((await getMission(db(), m.id))!).toMatchObject({ status: "todo", sessionId: null });
    }
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Offline", prompt: "Tidy." });
    const offline = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: offline })).rejects.toThrow(/couldn't be reached/);
  });

  it("a refused start can be tried again at once; a start that never got going can be started again after 10 minutes", async () => {
    const m = await addDeskTask(db(), admin, { role: "developer", title: "Retry", prompt: "Tidy." });
    await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: fakeFire(500, {}).f })).rejects.toThrow(/couldn't start/);
    await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: fakeFire().f })).resolves.toMatchObject({ sessionId: NEW });
    // Its chat never said a word (no ping, no claim): the desk offers a fresh start after 10 minutes.
    expect((await deskView(db())).files.find((f) => f.mission.id === m.id)).toMatchObject({ link: { kind: "open" } });
    await db()
      .update(hqMissions)
      .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(hqMissions.id, m.id));
    const file = (await deskView(db())).files.find((f) => f.mission.id === m.id)!;
    expect(file).toMatchObject({ status: "Didn't start. Tap to start it again.", link: { kind: "new" } });
    const again = "session_01SecondTryAbcdefghij";
    await expect(startDeskTask(db(), admin, m.id, file.link.pin, { config, fetch: fakeFire(200, { claude_code_session_id: again }).f })).resolves.toMatchObject(
      {
        sessionId: again,
      },
    );
  });

  it("says who wrote the task: the owner's own file, or the team's (also when an agent rewrites the owner's)", async () => {
    const mine = await addDeskTask(db(), admin, { role: "developer", title: "Mine", prompt: "Mine." });
    expect(mine.deskPromptBy).toBe("owner");
    await updateMission(db(), { kind: "agent", keyName: "k", sessionId: null }, mine.id, { deskPrompt: "Rewritten by an agent." });
    expect((await getMission(db(), mine.id))!.deskPromptBy).toBe("agent");
    await updateMission(db(), { kind: "owner", email: admin.email }, mine.id, { title: "Mine again" });
    expect((await getMission(db(), mine.id))!.deskPromptBy).toBe("owner");
    const theirs = await createMission(db(), { kind: "agent", keyName: "k", sessionId: null }, { role: "developer", title: "Theirs", deskPrompt: "x" });
    expect(theirs.deskPromptBy).toBe("agent");
  });

  it(`allows at most ${STARTS_PER_HOUR} starts an hour`, async () => {
    for (let i = 0; i < STARTS_PER_HOUR; i++) {
      const m = await addDeskTask(db(), admin, { role: "developer", title: `Task ${i}`, prompt: "x" });
      await startDeskTask(db(), admin, m.id, pinOf(m), {
        config,
        fetch: fakeFire(200, { claude_code_session_id: `session_01ManyStarts${String(i).padStart(8, "0")}` }).f,
      });
    }
    const m = await addDeskTask(db(), admin, { role: "developer", title: "One more", prompt: "x" });
    await expect(startDeskTask(db(), admin, m.id, pinOf(m), { config, fetch: fakeFire().f })).rejects.toThrow(/a lot of starts/);
  });

  it("only takes Claude's own fire address and a plain token from the environment", () => {
    expect(fireConfig({ HQ_DESK_FIRE_URL: URL_OK, HQ_DESK_FIRE_TOKEN: config.token })).toEqual(config);
    expect(fireConfig({ HQ_DESK_FIRE_URL: ` ${URL_OK} `, HQ_DESK_FIRE_TOKEN: ` ${config.token}\n` })).toEqual(config);
    expect(fireConfig({})).toBeNull();
    expect(
      fireConfig({ HQ_DESK_FIRE_URL: "https://evil.example/v1/claude_code/routines/trig_01ABCDEFGHJK/fire", HQ_DESK_FIRE_TOKEN: config.token }),
    ).toBeNull();
    expect(fireConfig({ HQ_DESK_FIRE_URL: URL_OK.replace("https", "http"), HQ_DESK_FIRE_TOKEN: config.token })).toBeNull();
    expect(fireConfig({ HQ_DESK_FIRE_URL: URL_OK, HQ_DESK_FIRE_TOKEN: "short" })).toBeNull();
    expect(fireConfig({ HQ_DESK_FIRE_URL: URL_OK, HQ_DESK_FIRE_TOKEN: "has spaces in it for sure ok" })).toBeNull();
  });

  it("the started chat reads its prompt from HQ: `desk <id> --pin` prints the task's first prompt, and refuses anything else", () => {
    const t = {
      id: "6f1c2c1e-6a43-4b3a-9a59-0d7c2f8f0a11",
      title: "Finish Twilio",
      role: "developer" as const,
      deskPrompt: "Check the SMS path.",
      sessionId: null,
    };
    const inbox = {
      missions: [t, { id: "7f1c2c1e-6a43-4b3a-9a59-0d7c2f8f0a11", title: "Not on the desk", role: "developer", deskPrompt: null, sessionId: null }],
    };
    const p = deskTaskPrompt(inbox, t.id, deskPin(t));
    expect(p).toContain("Desk task from the CEO: Finish Twilio");
    expect(p).toContain("--status doing --claim");
    expect(p).toContain("Check the SMS path.");
    // A changed task, or no fingerprint at all, is refused.
    expect(() => deskTaskPrompt(inbox, t.id, "0123456789abcdef")).toThrow(/changed after the CEO started it/);
    expect(() => deskTaskPrompt(inbox, t.id, "")).toThrow(/changed after the CEO started it/);
    expect(() => deskTaskPrompt(inbox, "7f1c2c1e-6a43-4b3a-9a59-0d7c2f8f0a11", deskPin(t))).toThrow(/isn't an open task/);
    expect(() => deskTaskPrompt({}, t.id, deskPin(t))).toThrow(/isn't an open task/);
  });
});
