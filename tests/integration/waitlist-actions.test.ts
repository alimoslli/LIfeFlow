import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { appAccess, users } from "@/server/db/schema";
import { canUseApp } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

// Only the account door and the network address are provided: if the actions reached for requireUser or getSessionUser (the
// ones the waitlist gate closes), they would be undefined here and the test would fail.
const h = vi.hoisted(() => ({ user: null as SessionUser | null, sent: [] as string[] }));
vi.mock("@/server/auth/current-user", () => ({ getAccountUser: async () => h.user, clientIp: async () => "10.9.8.7" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/integrations/email", () => ({
  emailConfig: () => ({ apiKey: "test", from: "LifeFlow <test@example.com>" }),
  sendEmail: async (_cfg: unknown, m: { text: string }) => {
    h.sent.push(m.text);
    return { id: "msg_test" };
  },
}));
const { sendEmailCode, confirmEmail } = await import("@/app/(onboarding)/waitlist/actions");

afterAll(closeDb);

describe("the waitlist page's email actions", () => {
  it("a person still waiting, with the switch on, can send and confirm their code", async () => {
    const db = getDb();
    const { user } = await makeUser("Waiting Wendy");
    h.user = { id: user.id, email: user.email, name: user.name, timezone: user.timezone, accountKind: "standard", preferences: {} };
    const [before] = await db.select().from(appAccess);
    await db.update(appAccess).set({ waitlistOn: true });
    try {
      expect(canUseApp({ email: user.email, accountKind: "standard", access: "waiting" }, true, {})).toBe(false);
      const sent = await sendEmailCode(null);
      expect(sent).toMatchObject({ sentTo: expect.stringContaining("•••") });
      const code = /\b(\d{6})\b/.exec(h.sent[h.sent.length - 1])![1];
      const fd = new FormData();
      fd.set("code", code === "000000" ? "111111" : "000000");
      expect(await confirmEmail(null, fd)).toMatchObject({ error: expect.stringContaining("didn't match") });
      fd.set("code", code);
      expect(await confirmEmail(null, fd)).toMatchObject({ confirmed: true });
      const [row] = await db.select({ at: users.emailVerifiedAt, access: users.access }).from(users).where(eq(users.id, user.id));
      expect(row.at).not.toBeNull();
      expect(row.access).toBe("waiting");
    } finally {
      await db.update(appAccess).set({ waitlistOn: before?.waitlistOn ?? false });
    }
  });

  it("nobody signed in gets a plain answer, not a send", async () => {
    h.user = null;
    expect(await sendEmailCode(null)).toMatchObject({ error: expect.stringContaining("sign in") });
  });
});
