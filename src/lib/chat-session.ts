import { localDateOf } from "@/lib/dates";

/**
 * The chat you're in (owner, 2026-11-11: "not one continuous chat ... whenever I close down the app, it goes away ... or
 * sign out", and "join the second window"). The app's chat lasts while the app is open and for that day. Closing the app
 * (every window), signing out, a new day or "New chat" starts another; every earlier chat stays in Conversations.
 *
 * The browser keeps the app's chat in `lf_chat` ("<chat id>~<epoch ms it became the chat>"): a cookie with no expiry, and
 * the one source of truth. Every window of the app shows and writes that chat, and the server renders the page from it.
 * A window that opens fresh (sessionStorage is per window, so it's a new visit) joins the open chat when another window of
 * the app is open, and starts a fresh one when it's alone (joinNewVisit). Every window holds a shared lock while it's open,
 * so the browser says whether the app is open elsewhere (a force-quit app holds nothing). When the chat changes, the other
 * windows are told (onChatChanged) and render it again. The address never carries the chat (only a link to one does).
 */
export const CHAT_COOKIE = "lf_chat";
export const NEW_VISIT_ATTR = "data-lf-new-visit";
const VISIT_KEY = "lf-visit";
const WINDOW_LOCK = "lf-window";
const CHANNEL = "lf-chat";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether this is the shape of a chat id (checked before it goes anywhere near the database). */
export const isChatId = (id: string | null | undefined): id is string => !!id && ID.test(id);

/** Runs in the root layout's <head>, before the first paint: marks a document that opened a new visit. */
export const VISIT_SCRIPT = `try{if(!sessionStorage.getItem("${VISIT_KEY}")){sessionStorage.setItem("${VISIT_KEY}","1");document.documentElement.setAttribute("${NEW_VISIT_ATTR}","")}}catch(e){}`;

/** The cookie's chat and when it became the chat (epoch ms), or null when it's missing or not ours. */
export function parseChatCookie(value: string | null | undefined): { id: string; at: number } | null {
  const [id, at] = (value ?? "").split("~");
  const ms = Number(at);
  return id && ID.test(id) && Number.isSafeInteger(ms) && ms > 0 ? { id, at: ms } : null;
}

/** Whether `at` (epoch ms) is the same day as `now` in the person's time zone. */
export function sameDay(at: number, tz: string, now: Date = new Date()): boolean {
  return localDateOf(new Date(at), tz) === localDateOf(now, tz);
}

/** The chat in the cookie, when it became the chat today in the person's time zone (the server and the browser agree). */
export function chatOfToday(value: string | null | undefined, tz: string, now: Date = new Date()): string | null {
  const c = parseChatCookie(value);
  return c && sameDay(c.at, tz, now) ? c.id : null;
}

const attrs = () => `; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;

/** The cookie's raw value (`<id>~<stamp>`), or undefined. */
function cookieValue(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CHAT_COOKIE}=`))
    ?.slice(CHAT_COOKIE.length + 1);
}

/** The app's chat in the browser, whatever its day. */
function cookieChat(): string | null {
  return parseChatCookie(cookieValue())?.id ?? null;
}

let channel: BroadcastChannel | null | undefined;
/** The channel the windows of the app talk on (client only; never on the server). */
function chatChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  return channel;
}

/** When this browser last saw the app's chat change (epoch ms, from this window or another): a page rendered before it is stale. */
let changedAt = 0;
export const chatChangedAt = () => changedAt;

/** Runs when another window changed the app's chat (a window that changed it is not told). Returns the way to stop. */
export function onChatChanged(fn: () => void): () => void {
  const c = chatChannel();
  if (!c) return () => {};
  const listener = () => {
    changedAt = Date.now();
    fn();
  };
  c.addEventListener("message", listener);
  return () => c.removeEventListener("message", listener);
}

/** Makes this chat the app's chat in this browser (started or opened): every window of the app shows and writes it. */
export function rememberChat(id: string) {
  if (typeof document === "undefined" || !ID.test(id)) return;
  const was = cookieChat();
  document.cookie = `${CHAT_COOKIE}=${id}~${Date.now()}${attrs()}`;
  if (was !== id) {
    changedAt = Date.now();
    chatChannel()?.postMessage("changed");
  }
}

/** The app starts no chat for the next message (New chat, a new day, a new visit alone, sign-out). */
export function forgetChat() {
  if (typeof document === "undefined") return;
  const was = cookieChat();
  document.cookie = `${CHAT_COOKIE}=; max-age=0${attrs()}`;
  if (was) {
    changedAt = Date.now();
    chatChannel()?.postMessage("changed");
  }
}

/** The app's chat right now: the browser's chat when it began today in the person's time zone, else null. */
export function currentChat(tz: string): string | null {
  return chatOfToday(cookieValue(), tz);
}

/**
 * After a fresh render of a page (its chat was decided by the server from the cookie), the browser's chat is the one that page
 * shows: a chat the server no longer finds, or one from another day, is let go.
 */
export function adoptPageChat(page: string | null, tz: string) {
  if (currentChat(tz) === page) return;
  if (page) rememberChat(page);
  else forgetChat();
}

let windows: Promise<boolean> | null = null;
/** Whether another window of the app is open. Asked once per window, before this window takes its own lock. */
function otherWindowOpen(): Promise<boolean> {
  windows ??= (async () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return false;
    try {
      const snapshot = await locks.query();
      const open = (snapshot.held ?? []).some((lock) => lock.name === WINDOW_LOCK);
      // this window holds its lock from now on, for as long as it's open (the browser lets go when it closes)
      void locks.request(WINDOW_LOCK, { mode: "shared" }, () => new Promise<void>(() => {})).catch(() => undefined);
      return open;
    } catch {
      return false;
    }
  })();
  return windows;
}

/** Every window of the app holds its lock while it's open: the app shell asks once, on every app page. */
export function holdWindow() {
  void otherWindowOpen();
}

let joined: Promise<boolean> | null = null;
/**
 * A new visit (this window opened fresh: not a reload, not a page of the app already open) joins the app's chat when another
 * window of the app is open. Alone, it starts fresh: the browser's chat is let go. Resolves to whether it joined. Asked once.
 */
export function joinNewVisit(): Promise<boolean> {
  joined ??= otherWindowOpen().then((open) => {
    if (!open) forgetChat();
    return open;
  });
  return joined;
}

/**
 * True while this document is the first page of a new visit (sessionStorage marks each window's documents): until
 * settleNewVisit. Every component that asks before then gets the same answer, and the join is asked once (joinNewVisit), so a
 * component that runs twice (React's Strict Mode in development) agrees with itself. What a new visit does is joinNewVisit.
 */
export function takeNewVisit(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(NEW_VISIT_ATTR);
}

/** Shows the chat messages again, once the component has settled what they show. */
export function settleNewVisit() {
  if (typeof document !== "undefined") document.documentElement.removeAttribute(NEW_VISIT_ATTR);
}
