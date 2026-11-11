import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createSession, validateSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { updateProfile } from "@/server/services/accounts";
import { exportStream } from "@/server/services/data-export";
import { saveWelcomeProgress } from "@/server/services/onboarding";
import { buildSystemPrompt } from "@/server/jarvis/prompt";
import { makeUser } from "../helpers";

afterAll(closeDb);

const full = async (id: string) => (await getDb().select({ f: users.fullName }).from(users).where(eq(users.id, id)))[0]?.f;
const text = (s: ReadableStream<Uint8Array>) => new Response(s).text();

describe("full name (private, optional)", () => {
  it("is saved and cleared in About you, trimmed, and refused past 120 characters", async () => {
    const { user, run } = await makeUser("Mae");
    await run((s) => saveWelcomeProgress(s, "UTC", { fullName: "  Maya   Rose Patel " }));
    expect(await full(user.id)).toBe("Maya Rose Patel");
    await run((s) => saveWelcomeProgress(s, "UTC", { lifeStage: "student" })); // left out: kept
    expect(await full(user.id)).toBe("Maya Rose Patel");
    await expect(run((s) => saveWelcomeProgress(s, "UTC", { fullName: "x".repeat(121) }))).rejects.toThrow();
    await run((s) => saveWelcomeProgress(s, "UTC", { fullName: "  " }));
    expect(await full(user.id)).toBeNull();
  });

  it("is saved, kept and cleared in Settings", async () => {
    const { user } = await makeUser("Mae");
    const base = { name: "Mae", timezone: "UTC" };
    await updateProfile(getDb(), user.id, { ...base, fullName: "Maya Patel" });
    expect(await full(user.id)).toBe("Maya Patel");
    await updateProfile(getDb(), user.id, base); // not on the form: kept
    expect(await full(user.id)).toBe("Maya Patel");
    await updateProfile(getDb(), user.id, { ...base, fullName: "" });
    expect(await full(user.id)).toBeNull();
    await expect(updateProfile(getDb(), user.id, { ...base, fullName: "y".repeat(121) })).rejects.toThrow();
  });

  it("the under-13 lock clears it", async () => {
    const { user, run } = await makeUser("Kid");
    await getDb()
      .update(users)
      .set({ fullName: "Kid Person", preferences: { onboarding: "pending" } })
      .where(eq(users.id, user.id));
    await run((s) => saveWelcomeProgress(s, "UTC", { birthDate: "2020-01-01" }));
    expect(await full(user.id)).toBeNull();
  });

  it("is in the data export's profile block", async () => {
    const { user } = await makeUser("Mae");
    await getDb().update(users).set({ fullName: "Maya Patel" }).where(eq(users.id, user.id));
    const json = JSON.parse(await text(exportStream(user.id, { name: user.name, email: user.email, timezone: user.timezone, fullName: "Maya Patel" })));
    expect(json.profile.fullName).toBe("Maya Patel");
  });

  it("never reaches the skyling's context (session user and prompt carry the nickname only)", async () => {
    const { user } = await makeUser("Mae");
    await getDb().update(users).set({ fullName: "Maya Quentin Patel" }).where(eq(users.id, user.id));
    const { token } = await createSession(getDb(), user.id);
    const session = (await validateSession(getDb(), token))!;
    expect(JSON.stringify(session)).not.toContain("Quentin");
    const prompt = buildSystemPrompt({
      userName: session.name.split(" ")[0],
      tz: "UTC",
      now: new Date("2026-11-11T12:00:00Z"),
      accountKind: "standard",
      memories: [],
    });
    expect(prompt).not.toContain("Quentin");
    expect(prompt).not.toContain("Patel");
    expect(prompt).toContain("Mae");
  });

  it("is removed with the account", async () => {
    const { user } = await makeUser("Gone");
    await getDb().update(users).set({ fullName: "Gone Person" }).where(eq(users.id, user.id));
    const { deleteAccount } = await import("@/server/services/accounts");
    await deleteAccount(getDb(), user.id, "correct horse battery", { fetch: (async () => new Response("{}")) as typeof fetch });
    expect(await full(user.id)).toBeUndefined();
  });
});
