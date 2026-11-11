import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { appAccess, users } from "@/server/db/schema";
import { canUseApp } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

// Only the account door and the network address are provided: if the actions reached for requireUser or getSessionUser (the
// ones the waitlist gate closes), they would be undefined here and the test would fail.
const h = vi.hoisted(() => ({ user: null as SessionUser | null, sent: [] as string[], ip: "10.9.8.7" }));
vi.mock("@/server/auth/current-user", () => ({ getAccountUser: async () => h.user, clientIp: async () => h.ip }));
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

  it("sends, says a wrong code is wrong, takes the right one once, and says so when already confirmed", async () => {
    const { user } = await makeUser("Sam Quick");
    h.user = { id: user.id, email: user.email, name: user.name, timezone: user.timezone, accountKind: "standard", preferences: {} };
    h.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`;
    const sentBefore = h.sent.length;
    expect(await sendEmailCode(null)).toMatchObject({ sentTo: expect.stringContaining("•••") });
    expect(h.sent.length).toBe(sentBefore + 1);
    const code = /\b(\d{6})\b/.exec(h.sent[h.sent.length - 1])![1];
    const wrong = code === "654321" ? "123456" : "654321";
    const fd = new FormData();
    fd.set("code", wrong);
    expect(await confirmEmail(null, fd)).toMatchObject({ error: "That code didn't match. Check the newest email." });
    // a code typed with a space in the middle (as it's often copied) still works
    fd.set("code", `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(await confirmEmail(null, fd)).toMatchObject({ confirmed: true });
    // the same code again: it worked once
    expect(await confirmEmail(null, fd)).toMatchObject({ error: "That code didn't work. Ask for a new one." });
    // already confirmed: no new email, and the card is told
    expect(await sendEmailCode(null)).toMatchObject({ confirmed: true });
    expect(h.sent.length).toBe(sentBefore + 1);
  });

  it("a resend within the limit replaces the code and is refused after three", async () => {
    const { user } = await makeUser("Sam Resend");
    h.user = { id: user.id, email: user.email, name: user.name, timezone: user.timezone, accountKind: "standard", preferences: {} };
    h.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.2`;
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) {
      expect(await sendEmailCode(null)).toMatchObject({ sentTo: expect.any(String) });
      codes.push(/\b(\d{6})\b/.exec(h.sent[h.sent.length - 1])![1]);
    }
    expect(await sendEmailCode(null)).toMatchObject({ error: expect.stringContaining("sent a few codes") });
    // only the newest code works
    const fd = new FormData();
    fd.set("code", codes[2]);
    expect(await confirmEmail(null, fd)).toMatchObject({ confirmed: true });
  });

  it("after ten tries in a day it says to try tomorrow, not to wait a few minutes", async () => {
    const { user } = await makeUser("Sam Tries");
    h.user = { id: user.id, email: user.email, name: user.name, timezone: user.timezone, accountKind: "standard", preferences: {} };
    const fd = new FormData();
    fd.set("code", "123456");
    for (let i = 0; i < 10; i++) await confirmEmail(null, fd);
    expect(await confirmEmail(null, fd)).toMatchObject({ error: "You've tried too many times today. Try again tomorrow." });
  });

  it("nobody signed in gets a plain answer, not a send", async () => {
    h.user = null;
    expect(await sendEmailCode(null)).toMatchObject({ error: expect.stringContaining("sign in") });
  });
});
