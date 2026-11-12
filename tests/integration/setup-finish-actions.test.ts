import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { users } from "@/server/db/schema";
import { FIRST_CONNECTION_NEEDED } from "@/server/services/setup-first";
import { saveWelcomeProgress } from "@/server/services/onboarding";
import { setUpSchedule } from "@/server/services/schedule-setup";
import { TZ, makeUser } from "../helpers";

// Every action that can finish setup is called directly here (the browser can call any of them whenever it likes): none of them
// finishes without one real thing on the sky.
const h = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/server/auth/current-user", async () => {
  const { withUser } = await import("@/server/db/with-user");
  return {
    withCurrentUser: async (fn: (s: never, u: SessionUser) => Promise<unknown>) => withUser(h.user!.id, (s) => fn(s as never, h.user!)),
    requireUserForWelcome: async () => h.user,
    requireUser: async () => h.user,
    endSession: async () => {},
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const welcome = await import("@/app/(onboarding)/welcome/actions");
const today = await import("@/app/(app)/_today/setup-actions");

afterAll(closeDb);

async function pending() {
  const { user, run } = await makeUser();
  await run((s) => saveWelcomeProgress(s, TZ, { birthDate: "2000-01-15" }));
  await run((s) =>
    s.tx
      .update(users)
      .set({ preferences: { ...user.preferences, birthDate: "2000-01-15", onboarding: "pending" } })
      .where(eq(users.id, user.id)),
  );
  h.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: TZ,
    accountKind: "standard",
    preferences: { birthDate: "2000-01-15", onboarding: "pending" },
  };
  const state = async () => (await withUser(user.id, (s) => s.tx.select({ p: users.preferences }).from(users).where(eq(users.id, user.id))))[0].p.onboarding;
  return { run, state };
}

describe("finishing setup needs one real thing on the sky, on every path", () => {
  it("skipOnboardingAction called directly with nothing saved refuses", async () => {
    const { state } = await pending();
    expect(await welcome.skipOnboardingAction()).toMatchObject({ ok: false, error: FIRST_CONNECTION_NEEDED });
    expect(await state()).toBe("pending");
  });

  it("completeOnboardingAction with nothing real refuses and keeps nothing; the new action refuses too", async () => {
    const { state } = await pending();
    expect(await welcome.completeOnboardingAction({ lifeStage: "life" })).toMatchObject({ ok: false, error: FIRST_CONNECTION_NEEDED });
    expect(await today.finishSetupAction()).toMatchObject({ ok: false, error: FIRST_CONNECTION_NEEDED });
    expect(await state()).toBe("pending");
  });

  it("all of them finish once something real is saved", async () => {
    const a = await pending();
    await a.run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1], startTime: "10:00", endTime: "10:50" }] }));
    expect(await welcome.skipOnboardingAction()).toMatchObject({ ok: true });
    expect(await a.state()).toBe("done");
    const b = await pending();
    await b.run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1], startTime: "10:00", endTime: "10:50" }] }));
    expect(await today.finishSetupAction()).toMatchObject({ ok: true });
    expect(await b.state()).toBe("done");
  });
});
