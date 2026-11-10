/**
 * Handing a question to the chat page (owner, 2026-11-10: no side panel; the chat page is where you talk). A button in the
 * app leaves the question in this tab's sessionStorage and opens /jarvis; the chat takes it once on mount (typed in the box,
 * or sent when the button said so). The words never ride in the address (no logs, no history), the hand-off expires in
 * seconds, and a link from outside the app (`/jarvis?ask=`) can only fill the box, never send.
 */
const KEY = "lf_ask";
const FRESH_MS = 15_000;
export const ASK_EVENT = "lf:ask";
export type AskDetail = { prompt?: string; send?: boolean };

export function handOff(prompt: string, send: boolean) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ prompt, send, at: Date.now() }));
  } catch {}
}

/** The question a button just handed over, once (and only while it's fresh); always cleared. */
export function takeHandoff(now = Date.now()): { prompt: string; send: boolean } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { prompt?: unknown; send?: unknown; at?: unknown };
    if (typeof v.prompt !== "string" || !v.prompt || typeof v.at !== "number" || now - v.at > FRESH_MS) return null;
    return { prompt: v.prompt.slice(0, 500), send: v.send === true };
  } catch {
    return null;
  }
}
