import { useSyncExternalStore } from "react";
import { forgetChat } from "@/lib/chat-session";

/**
 * A counter for "a new chat was started in this app": the chat is keyed on it, so a New chat (or the day changing) always
 * starts the chat from empty, even when the server's page didn't change (a first message sent on this same page).
 */
let epoch = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Starts a new chat in this app: the next message begins one, and the chat on screen is replaced by an empty one. */
export function startNewChat() {
  forgetChat();
  epoch += 1;
  listeners.forEach((l) => l());
}

export const useChatEpoch = () =>
  useSyncExternalStore(
    subscribe,
    () => epoch,
    () => 0,
  );
