import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { waitlistPage } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => ({ user: null as SessionUser | null, sent: [] as string[] }));
vi.mock("@/server/auth/current-user", () => ({ requireUser: async () => h.user, getAccountUser: async () => h.user, clientIp: async () => "10.4.4.4" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {}, usePathname: () => "/settings/profile", useRouter: () => ({}) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ children, href }: { children?: unknown; href: string }) => createElement("a", { href }, children as never) };
});
vi.mock("@/server/integrations/email", () => ({
  emailConfig: () => ({ apiKey: "test", from: "LifeFlow <test@example.com>" }),
  sendEmail: async (_cfg: unknown, m: { text: string }) => {
    h.sent.push(m.text);
    return { id: "msg_test" };
  },
}));
const { default: ProfileSettings } = await import("@/app/(app)/settings/profile/page");
const { sendEmailCode, confirmEmail } = await import("@/app/(onboarding)/waitlist/actions");

afterAll(closeDb);
const db = getDb();
const render = async () => renderToStaticMarkup(await ProfileSettings());

describe("Settings > Profile shows the confirm card until the email is confirmed", () => {
  it("someone let in before confirming sees it, can confirm with the same action, and then it is gone", async () => {
    await db.update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
    const inviter = (await makeUser("Inviter")).user;
    const friend = (await makeUser("Friend")).user;
    await recordInvite(db, friend.id, await inviteCodeFor(db, inviter.id));
    await db.update(users).set({ access: "in" }).where(eq(users.id, friend.id));
    h.user = { id: friend.id, email: friend.email, name: friend.name, timezone: friend.timezone, accountKind: "standard", preferences: {} };

    const before = await render();
    expect(before).toContain("Confirm your email so your friend&#x27;s invite counts");
    expect(before).toContain('data-testid="wl-confirm-status"');

    expect(await sendEmailCode(null)).toMatchObject({ sentTo: expect.stringContaining("•••") });
    const code = /\b(\d{6})\b/.exec(h.sent[h.sent.length - 1])![1];
    const fd = new FormData();
    fd.set("code", code);
    expect(await confirmEmail(null, fd)).toMatchObject({ confirmed: true });
    expect(await render()).not.toContain("Confirm your email");
    // the friend now counts for the inviter
    expect((await waitlistPage(db, inviter.id)).friends).toBe(1);
  });
});
