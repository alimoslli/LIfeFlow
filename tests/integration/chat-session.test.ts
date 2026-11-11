import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { chatFromCookie } from "@/server/jarvis/chat-session";
import { createConversation } from "@/server/jarvis/conversations";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The chat a visit opens is the cookie's only when it's theirs and was used today (lib/chat-session.ts).
describe("the chat a visit opens", () => {
  it("is theirs and today's, never another person's or one from two days ago", async () => {
    const ada = await makeUser("Ada Visit");
    const bo = await makeUser("Bo Visit");
    const chat = await ada.run((s) => createConversation(s, null, "Mine"));
    const now = new Date();
    const cookie = (id: string, at = now.getTime()) => `${id}~${at}`;
    expect(await ada.run((s) => chatFromCookie(s, cookie(chat.id), TZ, now))).toBe(chat.id);
    expect(await bo.run((s) => chatFromCookie(s, cookie(chat.id), TZ, now))).toBeNull();
    expect(await ada.run((s) => chatFromCookie(s, cookie(chat.id, now.getTime() - 2 * 86_400_000), TZ, now))).toBeNull();
    expect(await ada.run((s) => chatFromCookie(s, undefined, TZ, now))).toBeNull();
  });
});
