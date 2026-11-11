"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { forgetChat } from "@/lib/chat-session";

/**
 * Starts a new chat (owner, 2026-11-11). This visit's chat lets go and the earlier ones stay in the list; the next message
 * starts the new one (lib/chat-session.ts). The address drops its ?c= too, so a reload stays on the new chat.
 */
export function NewChatButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="New chat"
      title="New chat"
      disabled={pending}
      onClick={() =>
        start(() => {
          forgetChat();
          router.replace("/jarvis");
          router.refresh();
        })
      }
      className={className}
    >
      <PixelIcon name="plus" className="h-4 w-4" />
      <span className="hidden lg:inline">New chat</span>
    </button>
  );
}
