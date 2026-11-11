import { describe, expect, it } from "vitest";
import { chatOfToday, NEW_VISIT_ATTR, parseChatCookie, VISIT_SCRIPT } from "@/lib/chat-session";

const ID = "3f9c2a10-7b1e-4c2d-9a8f-1234567890ab";
const TZ = "America/New_York";

// Owner, 2026-11-11: one chat lasts while the app is open and for the day; a new day or a new visit starts another.
describe("the chat this visit is in (lib/chat-session.ts)", () => {
  it("reads the cookie: a chat id and when it was last used", () => {
    expect(parseChatCookie(`${ID}~1793000000000`)).toEqual({ id: ID, at: 1793000000000 });
    expect(parseChatCookie(ID)).toBeNull();
    expect(parseChatCookie(`not-a-chat~1793000000000`)).toBeNull();
    expect(parseChatCookie(`${ID}~-5`)).toBeNull();
    expect(parseChatCookie(null)).toBeNull();
  });

  it("is the chat only on the day it was used, in the person's own time zone", () => {
    const now = new Date("2026-11-11T03:00:00Z"); // Nov 10, 10 PM in New York
    const earlierToday = `${ID}~${new Date("2026-11-10T20:00:00Z").getTime()}`; // Nov 10, 3 PM
    const yesterday = `${ID}~${new Date("2026-11-09T23:00:00Z").getTime()}`; // Nov 9, 6 PM
    expect(chatOfToday(earlierToday, TZ, now)).toBe(ID);
    expect(chatOfToday(yesterday, TZ, now)).toBeNull();
    expect(chatOfToday(undefined, TZ, now)).toBeNull();
  });

  it("never trusts a time in the future (a clock that's out)", () => {
    const now = new Date("2026-11-11T03:00:00Z");
    expect(chatOfToday(`${ID}~${now.getTime() + 3_600_000}`, TZ, now)).toBeNull();
  });

  it("marks a new visit before the first paint, with the attribute the chat reads", () => {
    expect(VISIT_SCRIPT).toContain(NEW_VISIT_ATTR);
    expect(VISIT_SCRIPT).toContain("sessionStorage");
  });
});
