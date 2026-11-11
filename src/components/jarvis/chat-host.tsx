"use client";
import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/app-shell";
import { JarvisChat } from "@/components/jarvis/chat";
import { startNewChat, useChatEpoch } from "@/components/jarvis/chat-epoch";
import { useNewDay } from "@/components/jarvis/use-new-day";

/**
 * The skyling's chat, keyed on the chat it's showing and on the app's "new chat" counter, so starting a new chat (or the day
 * changing) always shows an empty one, and an old chat's stream can't write into it. The server renders the chat this visit
 * is in; a new day refreshes the page so the server agrees.
 *
 * After a new chat starts, the page's own props (the chat it was rendered with, and its URL's ?c=) are stale until the
 * router catches up. The new chat therefore starts empty here, and never re-opens the chat it replaced.
 */
export function ChatHost(props: ComponentProps<typeof JarvisChat>) {
  const epoch = useChatEpoch();
  const router = useRouter();
  const { tz } = useShell();
  // the counter as this page was rendered; a new chat started since then makes the page's chat stale
  const [rendered] = useState(epoch);
  const fresh = epoch !== rendered;
  useNewDay(tz, () => {
    startNewChat();
    router.refresh();
  });
  return (
    <JarvisChat
      key={`${fresh ? "new" : (props.conversationId ?? "new")}:${epoch}`}
      {...props}
      conversationId={fresh ? null : props.conversationId}
      initialMessages={fresh ? [] : props.initialMessages}
    />
  );
}
