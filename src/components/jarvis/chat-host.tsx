"use client";
import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/app-shell";
import { JarvisChat } from "@/components/jarvis/chat";
import { startNewChat, useChatEpoch } from "@/components/jarvis/chat-epoch";
import { useNewDay } from "@/components/jarvis/use-new-day";

type Props = ComponentProps<typeof JarvisChat>;
const NO_MESSAGES: NonNullable<Props["initialMessages"]> = [];

/**
 * The skyling's chat, keyed on the chat it's showing and on the app's "new chat" counter, so starting a new chat (or the day
 * changing) always shows an empty one, and an old chat's stream can't write into it. The server renders the chat this visit
 * is in; a new day refreshes the page so the server agrees.
 *
 * After a new chat starts, the page's props (the chat it was rendered with) are stale until the server renders the page again:
 * every server render has its own version. Until then the new chat starts empty here, and never re-opens the chat it replaced.
 */
export function ChatHost(props: Props) {
  const epoch = useChatEpoch();
  const router = useRouter();
  const { tz } = useShell();
  // the server render this chat was last given, and the counter then (adjusted during render, as React advises for derived state)
  const [page, setPage] = useState({ version: props.pageVersion, epoch });
  if (page.version !== props.pageVersion) setPage({ version: props.pageVersion, epoch });
  const fresh = epoch !== page.epoch;
  useNewDay(tz, () => {
    startNewChat();
    router.refresh();
  });
  return (
    <JarvisChat
      key={`${fresh ? "new" : (props.conversationId ?? "new")}:${epoch}`}
      {...props}
      conversationId={fresh ? null : props.conversationId}
      initialMessages={fresh ? NO_MESSAGES : props.initialMessages}
    />
  );
}
