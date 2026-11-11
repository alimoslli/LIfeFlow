"use client";
import { useRouter } from "next/navigation";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { startNewChat } from "@/components/jarvis/chat-epoch";

/**
 * Starts a new chat (owner, 2026-11-11). The earlier chats stay in the list; the next message starts the new one. The address
 * drops its ?c= so a reload stays on the new chat. Never disabled: a keyboard user keeps their place.
 */
export function NewChatButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="New chat"
      title="New chat"
      onClick={() => {
        startNewChat();
        router.replace("/jarvis");
      }}
      className={className}
    >
      <PixelIcon name="plus" className="h-4 w-4" />
      <span className="hidden lg:inline">New chat</span>
    </button>
  );
}
