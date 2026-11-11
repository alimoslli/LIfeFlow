import { localDateOf } from "@/lib/dates";

/**
 * The chat you're in (owner, 2026-11-11: "not one continuous chat ... whenever I close down the app, it goes away ...
 * or sign out"). It lasts while the app is open and for that day. Closing the app (swiping it away), signing out, a new
 * day or "New chat" starts another; every earlier chat stays in the Conversations list.
 *
 * `lf_chat` is "<chat id>~<epoch ms it became this visit's chat>" (started, or opened from the list): a cookie with no
 * expiry, the browser's last chat, which the server reads to paint the first page. Each open app keeps its own chat in
 * memory (`visit`), so another tab never changes it. A new visit is known from sessionStorage, which the browser clears
 * when the app closes: the inline script in the root layout marks the document before its first paint (NEW_VISIT_ATTR),
 * and the first chat component to mount lets that chat go (takeNewVisit). A marked document hides its chat messages until
 * then, so an old chat never flashes.
 */
export const CHAT_COOKIE = "lf_chat";
export const NEW_VISIT_ATTR = "data-lf-new-visit";
const VISIT_KEY = "lf-visit";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether this is the shape of a chat id (checked before it goes anywhere near the database). */
export const isChatId = (id: string | null | undefined): id is string => !!id && ID.test(id);

/** Runs in the root layout's <head>, before the first paint: marks a document that opened a new visit. */
export const VISIT_SCRIPT = `try{if(!sessionStorage.getItem("${VISIT_KEY}")){sessionStorage.setItem("${VISIT_KEY}","1");document.documentElement.setAttribute("${NEW_VISIT_ATTR}","")}}catch(e){}`;

/** The cookie's chat and when it became this visit's chat (epoch ms), or null when it's missing or not ours. */
export function parseChatCookie(value: string | null | undefined): { id: string; at: number } | null {
  const [id, at] = (value ?? "").split("~");
  const ms = Number(at);
  return id && ID.test(id) && Number.isSafeInteger(ms) && ms > 0 ? { id, at: ms } : null;
}

/** The chat in the cookie, when it became the chat today in the person's time zone (the server and the browser agree). */
export function chatOfToday(value: string | null | undefined, tz: string, now: Date = new Date()): string | null {
  const c = parseChatCookie(value);
  return c && localDateOf(new Date(c.at), tz) === localDateOf(now, tz) ? c.id : null;
}

const attrs = () => `; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;

/** This app's chat: undefined until it's first asked, then the browser's last chat for today (or null for a new visit). */
let visit: string | null | undefined;
/** When that chat became this app's (epoch ms): a chat that began on another day is not carried on. */
let visitAt = 0;

/** Makes this chat the one this app is in (started or opened); the browser's last chat follows it. */
export function rememberChat(id: string) {
  if (typeof document === "undefined" || !ID.test(id)) return;
  const at = Date.now();
  visit = id;
  visitAt = at;
  document.cookie = `${CHAT_COOKIE}=${id}~${at}${attrs()}`;
}

/** The next message starts a new chat (New chat, a new visit, a new day). */
export function forgetChat() {
  visit = null;
  visitAt = 0;
  if (typeof document === "undefined") return;
  document.cookie = `${CHAT_COOKIE}=; max-age=0${attrs()}`;
}

/** Whether `at` (epoch ms) is the same day as `now` in the person's time zone. */
export function sameDay(at: number, tz: string, now: Date = new Date()): boolean {
  return localDateOf(new Date(at), tz) === localDateOf(now, tz);
}

/** The chat this app is in right now: its own, or the browser's for today when it has none yet. */
export function currentChat(tz: string): string | null {
  if (visit === undefined) {
    const value =
      typeof document === "undefined"
        ? undefined
        : document.cookie
            .split("; ")
            .find((c) => c.startsWith(`${CHAT_COOKIE}=`))
            ?.slice(CHAT_COOKIE.length + 1);
    visit = chatOfToday(value, tz);
    visitAt = parseChatCookie(value)?.at ?? 0;
  } else if (visit !== null && !sameDay(visitAt, tz)) forgetChat();
  return visit;
}

/** Takes the chat a fresh render of the page shows as this app's own (the browser's copy already says the same): no cookie write. */
export function adoptChat(id: string | null) {
  visit = id;
  visitAt = id ? Date.now() : 0;
}

let asked = false;
/**
 * Whether a page rendered with `server` as its chat is behind the chat this app is in. A page shown again from the browser's
 * copy (back or forward) can be: a chat started on Today after it was left. Such a page is rendered again once; if the fresh
 * render still disagrees, the server's chat is the one this app takes, so the two never split.
 */
export function pageIsStale(server: string | null, tz: string): boolean {
  if (currentChat(tz) === server) {
    asked = false;
    return false;
  }
  if (!asked) {
    asked = true;
    return true;
  }
  asked = false;
  adoptChat(server);
  return false;
}

let decided = false;
/**
 * True when this document is the first page of a new visit. Only the first chat component to ask gets the answer (the
 * page's own chat, whose first render came from the cookie before the app opened); later ones use this app's chat. When
 * it's a new visit, the browser's last chat is let go here, and this app starts without one.
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
