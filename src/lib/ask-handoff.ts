/**
 * Handing a question to the chat page (owner, 2026-11-10: no side panel; the chat page is where you talk). A button in the
 * app that should SEND its question marks it here first; the chat page sends `?ask=` only when the mark matches, so a link
 * from outside the app can fill the box but never send anything on its own.
 */
const KEY = "lf_ask_send";
export const ASK_EVENT = "lf:ask";
export type AskDetail = { prompt?: string; send?: boolean };

export function markSend(prompt: string) {
  try {
    sessionStorage.setItem(KEY, prompt);
  } catch {}
}

/** True once, for the question the app itself marked. */
export function takeSend(prompt: string) {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v === prompt;
  } catch {
    return false;
  }
}

export function askUrl(prompt?: string) {
  return prompt ? `/jarvis?ask=${encodeURIComponent(prompt)}` : "/jarvis";
}
