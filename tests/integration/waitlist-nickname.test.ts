import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { appAccess, users } from "@/server/db/schema";
import { createSession } from "@/server/auth/sessions";
import { acceptUsers, setWaitlistNickname, waitlistPage, waitlistPlace } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

// The action runs the real session check; only the request's cookie jar and the cache are stood in for.
const h = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (h.token ? { name, value: h.token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "x-lf-path": "/waitlist" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
  },
}));
const { saveNicknameAction } = await import("@/app/(onboarding)/waitlist/actions");

afterAll(closeDb);
beforeEach(async () => {
  h.token = "";
  await getDb().update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
});

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const nick = async (id: string) => (await getDb().select({ n: users.waitlistNickname }).from(users).where(eq(users.id, id)))[0].n;

describe("waitlist nicknames", () => {
  it("sets, changes and clears a nickname through the account-level action, only the nickname, with the switch on", async () => {
    const a = (await makeUser("Ana Ruiz")).user;
    const b = (await makeUser("Ben Cole")).user;
    await getDb()
      .insert(appAccess)
      .values({ id: "app", waitlistOn: true })
      .onConflictDoUpdate({ target: appAccess.id, set: { waitlistOn: true } });
    try {
      h.token = (await createSession(getDb(), b.id)).token;
      const before = [await waitlistPlace(getDb(), a.id), await waitlistPlace(getDb(), b.id)];
      expect(before).toEqual([1, 2]);

      expect(await saveNicknameAction(null, fd({ nickname: "  Night   Owl " }))).toMatchObject({ ok: true });
      expect(await nick(b.id)).toBe("Night Owl");
      expect(await saveNicknameAction(null, fd({ nickname: "Moon-7" }))).toMatchObject({ ok: true });
      expect(await nick(b.id)).toBe("Moon-7");
      // refused values leave the saved one alone
      expect(await saveNicknameAction(null, fd({ nickname: "me@x.com" }))).toMatchObject({ ok: false });
      expect(await saveNicknameAction(null, fd({ nickname: "5551234567" }))).toMatchObject({ ok: false });
      expect(await nick(b.id)).toBe("Moon-7");
      // the page shows it, in the front of the line and in their own data
      const w = await waitlistPage(getDb(), b.id);
      expect(w.myNickname).toBe("Moon-7");
      expect(w.front.find((r) => r.me)).toMatchObject({ label: "Moon-7", nickname: true, place: 2 });
      expect(w.front.find((r) => !r.me)?.nickname).toBe(false);

      // clearing returns the anonymous label at once
      expect(await saveNicknameAction(null, fd({ intent: "clear" }))).toMatchObject({ ok: true });
      expect(await nick(b.id)).toBeNull();
      const w2 = await waitlistPage(getDb(), b.id);
      expect(w2.front.find((r) => r.me)?.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
      expect(w2.myNickname).toBeNull();
      // nobody's place moved, and nobody else's nickname changed
      expect([await waitlistPlace(getDb(), a.id), await waitlistPlace(getDb(), b.id)]).toEqual(before);
      expect(await nick(a.id)).toBeNull();
    } finally {
      await getDb().update(appAccess).set({ waitlistOn: false });
    }
  });

  it("hands the page no email, name or account id for anyone", async () => {
    const a = (await makeUser("Zed Secretname")).user;
    const b = (await makeUser("Yan Hidden")).user;
    await setWaitlistNickname(getDb(), a.id, "Zed Fan");
    const json = JSON.stringify(await waitlistPage(getDb(), b.id));
    for (const secret of [a.email, b.email, "@test.local", "Secretname", "Hidden", a.id, b.id]) expect(json).not.toContain(secret);
    expect(json).toContain("Zed Fan");
  });

  it("an accepted person's nickname moves nobody, and an accepted person can't set one", async () => {
    const a = (await makeUser("Ana One")).user;
    const b = (await makeUser("Ben Two")).user;
    const c = (await makeUser("Cy Three")).user;
    await setWaitlistNickname(getDb(), b.id, "Bee");
    await acceptUsers(getDb(), [b.id]);
    expect([await waitlistPlace(getDb(), a.id), await waitlistPlace(getDb(), c.id)]).toEqual([1, 2]);
    await expect(setWaitlistNickname(getDb(), b.id, "Bee Again")).rejects.toThrow(/waiting/);
    const w = await waitlistPage(getDb(), a.id);
    expect(w.front.map((r) => r.label)).not.toContain("Bee");
  });

  it("refuses a signed-out call", async () => {
    h.token = "";
    await expect(saveNicknameAction(null, fd({ nickname: "Ghost" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const [{ n }] = (await getDb().execute(sql`select count(*)::int as n from users where waitlist_nickname = 'Ghost'`)).rows as { n: number }[];
    expect(n).toBe(0);
  });
});
