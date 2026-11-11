import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { friendCounts } from "@/server/services/waitlist";
import { verifyEmail } from "@/server/services/referrals";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/server/auth/current-user", () => ({ requireUser: async () => h.user }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => {}, usePathname: () => "/settings/invite", useRouter: () => ({}) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ children, href }: { children?: unknown; href: string }) => createElement("a", { href }, children as never) };
});
const { default: InvitePage } = await import("@/app/(app)/settings/invite/page");

afterAll(closeDb);
const db = getDb();

describe("Settings > Invite uses the same friend rule as the waitlist page", () => {
  it("shows who joined and who confirmed (counted), as two labelled numbers", async () => {
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    const f1 = (await makeUser("F1")).user;
    const f2 = (await makeUser("F2")).user;
    await recordInvite(db, f1.id, code);
    await recordInvite(db, f2.id, code);
    await verifyEmail(db, f1.id);
    expect(await friendCounts(db, inviter.id)).toEqual({ friends: 1, pending: 1 });
    h.user = { id: inviter.id, email: inviter.email, name: inviter.name, timezone: inviter.timezone, accountKind: "standard", preferences: {} };
    const html = renderToStaticMarkup(await InvitePage());
    expect(html).toMatch(/Joined with your link<\/span><span[^>]*data-testid="invite-joined"[^>]*>2</);
    expect(html).toMatch(/Confirmed their email \(counted\)<\/span><span[^>]*data-testid="invite-confirmed"[^>]*>1</);
    expect(html).not.toContain("Friends who joined");
  });
});
