"use client";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { startNewChat } from "@/components/jarvis/chat-epoch";

/**
 * Starts a new chat (owner, 2026-11-11). The earlier chats stay in the list; the next message starts the new one. A link's ?c=
 * is dropped from the address without a navigation (a navigation would render the page again and rebuild the chat under a
 * message being typed), so a reload stays on the new chat. Never disabled: a keyboard user keeps their place.
 */
export function NewChatButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="New chat"
      title="New chat"
      onClick={() => {
        startNewChat();
        if (new URLSearchParams(window.location.search).has("c")) window.history.replaceState(null, "", "/jarvis");
      }}
      className={className}
    >
      <PixelIcon name="plus" className="h-4 w-4" />
      <span className="hidden lg:inline">New chat</span>
    </button>
  );
}
