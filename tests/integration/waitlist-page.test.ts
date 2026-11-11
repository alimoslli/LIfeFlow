import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { appAccess, users } from "@/server/db/schema";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { verifyEmail } from "@/server/services/referrals";
import { acceptUsers, waitlistPlace } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/server/auth/current-user", () => ({ getAccountUser: async () => h.user, clientIp: async () => "10.1.1.1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => Promise.reject(new Error(`redirect:${to}`)),
  usePathname: () => "/waitlist",
  useRouter: () => ({}),
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ children, href }: { children?: unknown; href: string }) => createElement("a", { href }, children as never) };
});
vi.mock("next/image", () => ({ default: () => null }));
const { default: WaitlistPage } = await import("@/app/(onboarding)/waitlist/page");

afterAll(closeDb);
const db = getDb();
const asSession = (u: { id: string; email: string; name: string; timezone: string }): SessionUser => ({ ...u, accountKind: "standard", preferences: {} });
const render = async (search: { preview?: string } = {}) => renderToStaticMarkup(await WaitlistPage({ searchParams: Promise.resolve(search) }));

describe("the waitlist page", () => {
  it("someone let in before confirming still sees the confirm card, and confirming counts for their inviter", async () => {
    await db.update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
    const inviter = (await makeUser("Inviter")).user;
    const friend = (await makeUser("Friend")).user;
    await recordInvite(db, friend.id, await inviteCodeFor(db, inviter.id));
    await acceptUsers(db, [friend.id]);
    h.user = asSession(friend);
    const html = await render();
    expect(html).toContain("You&#x27;re in");
    expect(html).toContain("Confirm your email so your friend&#x27;s invite counts");
    // after confirming, the card is gone and the inviter counts
    await verifyEmail(db, friend.id);
    expect(await render()).not.toContain("Confirm your email");
    expect(await waitlistPlace(db, inviter.id)).toBe(1);
  });

  it("admin preview shows the real number of people waiting, with only the example place marked", async () => {
    await db.update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
    const a = (await makeUser("A")).user;
    await makeUser("B");
    await makeUser("C");
    await makeUser("D");
    process.env.ADMIN_EMAILS = a.email;
    h.user = asSession(a);
    const html = await render({ preview: "1" });
    expect(html).toContain("3 people are waiting");
    expect(html).not.toContain("12 people are waiting");
    // only the admin's own place is marked as an example, exactly once, and the place heading shows the last real place
    expect(html.match(/<span[^>]*>You \(example\)<\/span>/g)).toHaveLength(1);
    expect(html.match(/\(example\)/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="wl-place"[^>]*>#3</);
  });

  it("the rules say what really happens: a friend can move you up, up to 10 places a day, never at first place or past the limit", async () => {
    await db.update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
    const a = (await makeUser("A")).user;
    h.user = asSession(a);
    const [before] = await db.select().from(appAccess);
    await db.update(appAccess).set({ waitlistOn: true });
    let html = "";
    try {
      html = await render();
    } finally {
      await db.update(appAccess).set({ waitlistOn: before?.waitlistOn ?? false });
    }
    expect(html).toContain("can move you up a place, up to 10 places a day");
    expect(html).toContain("a friend doesn&#x27;t move you");
    expect(html).not.toContain("puts you ahead of the person just above");
  });

  it("the confirm card keeps one alert region and one status region in the page, and the thank-you line can take focus", async () => {
    const { ConfirmEmail } = await import("@/app/(onboarding)/waitlist/confirm-email");
    const { createElement } = await import("react");
    const html = renderToStaticMarkup(createElement(ConfirmEmail, { invited: false, className: "x" }));
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Confirm your email");
    expect(html).not.toContain("so your friend");
  });
});
