import { cookies } from "next/headers";
import { CHAT_COOKIE, chatOfToday } from "@/lib/chat-session";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "../services/errors";
import { getConversation } from "./conversations";

/** The chat with this id when it's theirs (row-level security), or null. Any other error (a database fault) is thrown. */
export async function ownedChat(scope: UserScope, id: string) {
  try {
    return await getConversation(scope, id);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "not_found") return null;
    throw e;
  }
}

/** The chat in `value` (the `lf_chat` cookie) when it became the chat today and it's theirs; otherwise null. */
export async function chatFromCookie(scope: UserScope, value: string | null | undefined, tz: string, now = new Date()): Promise<string | null> {
  const id = chatOfToday(value, tz, now);
  return id ? ((await ownedChat(scope, id))?.id ?? null) : null;
}

/** The chat this visit is in (lib/chat-session.ts), read from the request's cookie. */
export async function sessionChatId(scope: UserScope, tz: string): Promise<string | null> {
  return chatFromCookie(scope, (await cookies()).get(CHAT_COOKIE)?.value, tz);
}
