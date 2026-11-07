import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reportPOST } from "@/app/api/hq/report/route";
import { addDeskTaskAction, goodnightAction, lightsOnAction } from "@/app/admin/hq/actions";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, hqActivity, hqApprovals, hqChats, hqKeys, hqMissions, hqSettings, rateLimitBuckets } from "@/server/db/schema";
import { createHqKey, createMission, updateMission, type HqActor } from "@/server/services/hq";
import { addDeskTask, deskView, lightsOn, nightEndsAt, sayGoodnight } from "@/server/services/hq-desk";
import { getControls } from "@/server/services/hq-marketing";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => ({ admin: false, adminId: "", redirects: [] as string[] }));
vi.mock("@/server/auth/require-admin", () => ({
  requireAdmin: async () => {
    if (!h.admin) throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    return { id: h.adminId, email: "owner@test.local" };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirects.push(to);
    throw new Error("NEXT_REDIRECT");
  },
}));

afterAll(closeDb);

const db = () => getDb();
const agent: HqActor = { kind: "agent", keyName: "LF COO", sessionId: null };
let admin: { id: string; email: string };
const SID = "session_01DeskChatAbcdefghij";

beforeEach(async () => {
  const d = db();
  await d.delete(hqActivity);
  await d.delete(hqApprovals);
  await d.delete(hqMissions);
  await d.delete(hqChats);
  await d.delete(hqKeys);
  await d.delete(hqSettings);
  await d.delete(adminActions);
  await d.delete(rateLimitBuckets);
  h.admin = false;
  h.redirects = [];
  const { user } = await makeUser("HQ Owner");
  admin = { id: user.id, email: user.email };
  h.adminId = user.id; // a real user, for the admin_actions foreign key
});

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("the CEO's desk", () => {
  it("lists only open missions with a desk prompt, high first, each with its link", async () => {
    await createMission(db(), agent, { role: "developer", title: "Not on the desk" });
    const low = await createMission(db(), agent, { role: "developer", title: "Vercel work", priority: "low", deskPrompt: "Tidy the deploy." });
    const hi = await createMission(db(), agent, { role: "designer", title: "Finish the V3 revision", priority: "high", deskPrompt: "Finish it as pictures." });
    const done = await createMission(db(), agent, { role: "developer", title: "Done one", deskPrompt: "x" });
    await updateMission(db(), agent, done.id, { status: "done" });
    const v = await deskView(db());
    expect(v.files.map((f) => f.mission.title)).toEqual(["Finish the V3 revision", "Vercel work"]);
    const first = v.files[0];
    expect(first.status).toBe("Not started");
    expect(first.link.kind).toBe("new");
    const u = new URL(first.link.href);
    expect(u.origin + u.pathname).toBe("https://claude.ai/code/new");
    expect(u.searchParams.get("repo")).toBe("alimoslli/LIfeFlow");
    expect(u.searchParams.get("q")).toContain(`npx tsx scripts/hq.ts mission update ${hi.id} --status doing`);
    expect(u.searchParams.get("q")).toContain("Finish it as pictures.");

    // The chat that took it reports in (mission update from that chat sends its id): the file now reopens that chat.
    await updateMission(db(), { kind: "agent", keyName: "k", sessionId: SID }, low.id, { status: "doing", sessionId: SID, progress: "Listing env vars" });
    const v2 = await deskView(db());
    const vercel = v2.files.find((f) => f.mission.id === low.id)!;
    expect(vercel).toMatchObject({ status: "Listing env vars", link: { kind: "open", href: `https://claude.ai/code/${SID}` } });
    expect(vercel.link.prompt).toContain(`mission update ${low.id} --status done`);
  });

  it("takes desk prompts through the report API, plain and at most 1,500 characters", async () => {
    const { token } = await createHqKey(db(), admin, "k");
    const post = (body: unknown) =>
      reportPOST(
        new Request("https://lifeflow.test/api/hq/report", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      );
    const ok = await post({ type: "mission", role: "developer", title: "Finish Twilio", deskPrompt: "Check the SMS path.​" });
    expect(ok.status).toBe(200);
    const { id } = await ok.json();
    const [row] = await db().select().from(hqMissions).where(eq(hqMissions.id, id));
    expect(row.deskPrompt).toBe("Check the SMS path."); // invisible characters are removed
    const long = await post({ type: "mission", id, deskPrompt: "x".repeat(1501) });
    expect(long.status).toBe(400);
    expect((await long.json()).error).toMatch(/too long \(max 1500\)/);
    // An empty prompt takes it off the desk.
    expect((await post({ type: "mission", id, deskPrompt: "" })).status).toBe(200);
    expect((await db().select().from(hqMissions).where(eq(hqMissions.id, id)))[0].deskPrompt).toBeNull();
  });

  it("Add to my desk is owner-only, validates, and logs the admin action", async () => {
    await expect(addDeskTaskAction(fd({ role: "developer", title: "Plaid end to end", prompt: "Run the Plaid tests." }))).rejects.toThrow(/404/);
    expect(await db().select().from(hqMissions)).toHaveLength(0);
    h.admin = true;
    await expect(addDeskTaskAction(fd({ role: "developer", title: "Plaid end to end", prompt: "Run the Plaid tests." }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirects.at(-1)).toBe(`/admin?done=${encodeURIComponent("On your desk: Plaid end to end")}#desk`);
    const [m] = await db().select().from(hqMissions);
    expect(m).toMatchObject({ role: "developer", deskPrompt: "Run the Plaid tests.", priority: "high", source: "owner" });
    expect((await db().select().from(adminActions)).map((a) => a.action)).toContain("hq.desk_added");
    await expect(addDeskTaskAction(fd({ role: "ceo", title: "x", prompt: "y" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirects.at(-1)).toMatch(/^\/admin\?error=/);
    await expect(addDesk({ prompt: "p".repeat(1501) })).rejects.toThrow(/too long/);
  });
});

const addDesk = (o: Partial<{ role: string; title: string; prompt: string }>) =>
  addDeskTask(db(), admin, { role: "developer", title: "A task", prompt: "Do it.", ...o });

describe("Goodnight", () => {
  it("ends at the first 5 AM after it, in the owner's time zone", () => {
    const LA = "America/Los_Angeles";
    // 11 PM Saturday in LA -> 5 AM Sunday.
    expect(nightEndsAt(new Date("2026-11-08T07:00:00Z"), LA).toISOString()).toBe("2026-11-08T13:00:00.000Z");
    // 2 AM -> 5 AM the same morning.
    expect(nightEndsAt(new Date("2026-11-08T10:00:00Z"), LA).toISOString()).toBe("2026-11-08T13:00:00.000Z");
    // Exactly 5 AM -> the next morning.
    expect(nightEndsAt(new Date("2026-11-08T13:00:00Z"), LA).toISOString()).toBe("2026-11-09T13:00:00.000Z");
  });

  it("dims the office until 5 AM, starts nothing, and Lights on ends it", async () => {
    const before = await getControls(db());
    const at = new Date("2026-11-08T07:00:00Z");
    await sayGoodnight(db(), admin, at);
    expect((await deskView(db(), new Date("2026-11-08T12:59:00Z"))).night).toMatchObject({ on: true });
    expect((await deskView(db(), new Date("2026-11-08T13:00:00Z"))).night).toEqual({ on: false, since: null, endsAt: null });
    // Nothing started: no missions, no chats, the controls the rounds read are unchanged.
    expect(await db().select().from(hqMissions)).toHaveLength(0);
    expect(await db().select().from(hqChats)).toHaveLength(0);
    const after = await getControls(db());
    expect({ ...after, updatedAt: null, updatedByEmail: null }).toEqual({ ...before, updatedAt: null, updatedByEmail: null });
    expect((await db().select().from(hqActivity)).map((a) => a.kind)).toEqual(["goodnight"]);
    await lightsOn(db(), admin);
    expect((await deskView(db(), new Date("2026-11-08T08:00:00Z"))).night.on).toBe(false);
    await lightsOn(db(), admin); // twice is fine
    expect((await db().select().from(hqActivity)).map((a) => a.kind).sort()).toEqual(["goodnight", "lights_on"]);
  });

  it("the buttons are owner-only", async () => {
    await expect(goodnightAction()).rejects.toThrow(/404/);
    await expect(lightsOnAction()).rejects.toThrow(/404/);
    expect(await db().select().from(hqActivity)).toHaveLength(0);
    h.admin = true;
    await expect(goodnightAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirects.at(-1)).toMatch(/^\/admin\?done=Goodnight/);
    expect((await db().select().from(hqSettings))[0].goodnightAt).not.toBeNull();
    await expect(lightsOnAction()).rejects.toThrow("NEXT_REDIRECT");
    expect((await db().select().from(hqSettings))[0].goodnightAt).toBeNull();
  });
});
