import { localDateOf } from "@/lib/dates";

/**
 * The chat you're in (owner, 2026-11-11: "not one continuous chat ... whenever I close down the app, it goes away ...
 * or sign out"). It lasts while the app is open and for that day. Closing the app (swiping it away), signing out, a new
 * day or "New chat" starts another; every earlier chat stays in the Conversations list.
 *
 * `lf_chat` is "<chat id>~<epoch ms it was last used>", a cookie with no expiry, so the server can open the chat on the
 * first paint. A new visit is known from sessionStorage, which the browser clears when the app closes: the inline script
 * in the root layout marks the document before its first paint (NEW_VISIT_ATTR), and the first chat component to mount
 * lets that chat go (takeNewVisit). A marked document hides its chat messages until then, so an old chat never flashes.
 */
export const CHAT_COOKIE = "lf_chat";
export const NEW_VISIT_ATTR = "data-lf-new-visit";
const VISIT_KEY = "lf-visit";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs in the root layout's <head>, before the first paint: marks a document that opened a new visit. */
export const VISIT_SCRIPT = `try{if(!sessionStorage.getItem("${VISIT_KEY}")){sessionStorage.setItem("${VISIT_KEY}","1");document.documentElement.setAttribute("${NEW_VISIT_ATTR}","")}}catch(e){}`;

/** The cookie's chat and when it was last used (epoch ms), or null when it's missing or not ours. */
export function parseChatCookie(value: string | null | undefined): { id: string; at: number } | null {
  const [id, at] = (value ?? "").split("~");
  const ms = Number(at);
  return id && ID.test(id) && Number.isSafeInteger(ms) && ms > 0 ? { id, at: ms } : null;
}

/** The chat this visit is in: the cookie's, when it was used today in the person's time zone. */
export function chatOfToday(value: string | null | undefined, tz: string, now: Date = new Date()): string | null {
  const c = parseChatCookie(value);
  if (!c || c.at > now.getTime() + 60_000) return null;
  return localDateOf(new Date(c.at), tz) === localDateOf(now, tz) ? c.id : null;
}

const attrs = () => `; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;

/** Makes this chat the one the visit is in (a message was sent in it, or it was opened). */
export function rememberChat(id: string) {
  if (typeof document === "undefined" || !ID.test(id)) return;
  document.cookie = `${CHAT_COOKIE}=${id}~${Date.now()}${attrs()}`;
}

/** The next message starts a new chat (New chat, a new visit). */
export function forgetChat() {
  if (typeof document === "undefined") return;
  document.cookie = `${CHAT_COOKIE}=; max-age=0${attrs()}`;
}

/** The chat this visit is in, read in the browser right now. */
export function currentChat(tz: string): string | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CHAT_COOKIE}=`))
    ?.slice(CHAT_COOKIE.length + 1);
  return chatOfToday(value, tz);
}

let decided = false;
/**
 * True when this document is the first page of a new visit. Only the first chat component to ask gets the answer (the
 * page's own chat, whose first render came from the cookie before the app opened); later ones read the cookie. When it's
 * a new visit, the chat from before is let go here.
 */
export function takeNewVisit(): boolean {
  if (decided || typeof document === "undefined") return false;
  decided = true;
  const fresh = document.documentElement.hasAttribute(NEW_VISIT_ATTR);
  if (fresh) forgetChat();
  return fresh;
}

/** Shows the chat messages again, once the component has settled what they show. */
export function settleNewVisit() {
  if (typeof document !== "undefined") document.documentElement.removeAttribute(NEW_VISIT_ATTR);
}
