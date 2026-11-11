import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { afterAll } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { creditReferral, emailHash } from "@/server/services/referrals";
import { inviteCodeFor, recordInvite } from "@/server/services/invites";
import { makeUser } from "../helpers";

vi.mock("@/server/auth/current-user", () => ({
  requireUser: async () => ({ id: "00000000-0000-0000-0000-000000000000" }),
  withCurrentUser: async () => ({ items: [], tz: "UTC" }),
}));
vi.mock("@/server/services/accounts", async (orig) => ({ ...(await orig<object>()), accountHasPassword: async () => true }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ children, href }: { children?: unknown; href: string }) => createElement("a", { href }, children as never) };
});
vi.mock("next/navigation", () => ({ redirect: () => {}, usePathname: () => "/settings/data", useRouter: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
const { default: PrivacyPage } = await import("@/app/(legal)/privacy/page");
const { default: DataSettings } = await import("@/app/(app)/settings/data/page");

afterAll(closeDb);
const db = getDb();
const normalise = (html: string) => html.replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("what we say about deleting an account", () => {
  it("the privacy page says exactly what the owner approved about the one-way fingerprint", () => {
    const text = normalise(renderToStaticMarkup(PrivacyPage() as never));
    expect(text).toContain(
      "When you delete your account we remove your data, except a one-way fingerprint of your email address, kept so the same address can't earn a second invite credit. It can't be turned back into your address.",
    );
  });

  it("Settings says the same where it offers to delete", async () => {
    const text = normalise(renderToStaticMarkup(await DataSettings()));
    expect(text).toContain(
      "Deletes your account and everything in it, except a one-way fingerprint of your email address, kept so the same address can't earn a second invite credit.",
    );
  });
});

describe("an inviter's own alias can't credit them", () => {
  it("a friend whose email is a dot or plus alias of the inviter's inbox earns nothing", async () => {
    const inviter = (await makeUser("Inviter")).user;
    const box = `me${crypto.randomUUID().slice(0, 8)}`;
    await db
      .update(users)
      .set({ email: `${box}@gmail.com` })
      .where(eq(users.id, inviter.id));
    const [alias] = await db
      .insert(users)
      .values({ name: "Alias", email: `${box.slice(0, 3)}.${box.slice(3)}+promo@googlemail.com`, passwordHash: "x", emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await recordInvite(db, alias.id, await inviteCodeFor(db, inviter.id));
    expect(emailHash(`${box}@gmail.com`)).toBe(emailHash(`${box.slice(0, 3)}.${box.slice(3)}+promo@googlemail.com`));
    expect(await db.transaction((tx) => creditReferral(tx, alias.id))).toEqual({ recorded: false, moved: false });
  });
});
