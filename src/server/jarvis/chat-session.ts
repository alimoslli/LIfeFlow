import { cookies } from "next/headers";
import { CHAT_COOKIE, chatOfToday } from "@/lib/chat-session";
import type { UserScope } from "../db/with-user";
import { getConversation } from "./conversations";

/**
 * The chat in `value` (the `lf_chat` cookie) when it's theirs and was used today; otherwise null, and the next message
 * starts a new chat. The lookup runs under their row-level security, so another person's chat is never found.
 */
export async function chatFromCookie(scope: UserScope, value: string | null | undefined, tz: string, now = new Date()): Promise<string | null> {
  const id = chatOfToday(value, tz, now);
  if (!id) return null;
  try {
    return (await getConversation(scope, id)).id;
  } catch {
    return null;
  }
}

/** The chat this visit is in (lib/chat-session.ts), read from the request's cookie. */
export async function sessionChatId(scope: UserScope, tz: string): Promise<string | null> {
  return chatFromCookie(scope, (await cookies()).get(CHAT_COOKIE)?.value, tz);
}
