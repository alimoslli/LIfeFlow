import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { attachmentMeta, listConversations, listMessages, listPendingActions } from "@/server/jarvis/conversations";
import { ownedChat, sessionChatId } from "@/server/jarvis/chat-session";
import { suggestedMemoryIds, toUiMessages } from "@/server/jarvis/ui-messages";
import { memoryStatuses } from "@/server/services/memory";
import type { UiMessage } from "@/components/jarvis/types";
import { missingConnections } from "@/server/services/integrations";
import { ideaClouds } from "@/server/services/idea-clouds";
import { skyCounts } from "@/server/services/sky-home";
import { assistantProfile } from "@/lib/assistant";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Skyling" };

/**
 * A chat changes without a save (Today's bar and the chat send to the route, and the cookie moves), so this page is never
 * reused from the router's two-minute cache. Going back to it (the browser's back, or a swipe) can show the copy the browser
 * kept; the page is then rendered again when it's behind the browser's chat (JarvisChat resyncs, lib/chat-session.ts).
 */
export const unstable_dynamicStaleTime = 0;

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string; voice?: string; c?: string }> }) {
  const { ask, voice, c } = await searchParams;
  // one id per server render: the chat adopts the page it was given only when a new render arrives (components/jarvis/chat.tsx)
  const version = crypto.randomUUID();
  const { conversations, tz, connect, ideas, messages, activeId, home } = await withCurrentUser(async (s, u) => {
    const conversations = await listConversations(s);
    // A link (?c=) opens that chat, however old, when it's theirs; otherwise this app's chat (lib/chat-session.ts) opens here,
    // the same one Today's bar carries on. Another person's chat finds nothing (row-level security), so a new chat starts.
    const activeId = c ? ((await ownedChat(s, c))?.id ?? null) : await sessionChatId(s, u.timezone);
    let messages: UiMessage[] = [];
    if (activeId) {
      const rows = await listMessages(s, activeId);
      const actions = await listPendingActions(s, activeId);
      const atts = await attachmentMeta(s, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
      messages = toUiMessages(rows, actions, atts, await memoryStatuses(s, suggestedMemoryIds(rows)));
    }
    return {
      conversations,
      activeId,
      messages,
      connect: await missingConnections(s),
      // idea clouds under the skyling: what they can tell or ask it, from their own data (lib/idea-clouds)
      ideas: await ideaClouds(s, u.timezone, u.preferences, assistantProfile(u.preferences, u.timezone).name),
      // the skyling's cloud: its stars and suns (owner, 2026-11-11)
      home: await skyCounts(s),
      tz: u.timezone,
    };
  });
  return (
    <JarvisPage
      conversations={conversations}
      activeId={activeId}
      messages={messages}
      tz={tz}
      ask={ask?.slice(0, 500)}
      connect={connect}
      ideas={ideas}
      voice={voice === "1"}
      home={home}
      version={version}
    />
  );
}
