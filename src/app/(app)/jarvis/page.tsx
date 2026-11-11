import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { attachmentMeta, listConversations, listMessages, listPendingActions } from "@/server/jarvis/conversations";
import { sessionChatId } from "@/server/jarvis/chat-session";
import { suggestedMemoryIds, toUiMessages } from "@/server/jarvis/ui-messages";
import { memoryStatuses } from "@/server/services/memory";
import type { UiMessage } from "@/components/jarvis/types";
import { missingConnections } from "@/server/services/integrations";
import { ideaClouds } from "@/server/services/idea-clouds";
import { skyCounts } from "@/server/services/sky-home";
import { assistantProfile } from "@/lib/assistant";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Skyling" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string; voice?: string; c?: string }> }) {
  const { ask, voice, c } = await searchParams;
  const { conversations, tz, connect, ideas, messages, activeId, home } = await withCurrentUser(async (s, u) => {
    const conversations = await listConversations(s);
    // The chat lasts while the app is open and for the day (lib/chat-session.ts): this visit's chat opens here, the same
    // one Today's bar carries on. An earlier chat opens when asked for (the list of chats, ?c=). Another person's chat
    // address finds nothing (row-level security), so it opens this visit's chat, or an empty one.
    const asked = c ? conversations.find((x) => x.id === c) : undefined;
    const visit = asked ? null : await sessionChatId(s, u.timezone);
    const latest = asked ?? conversations.find((x) => x.id === visit);
    let messages: UiMessage[] = [];
    if (latest) {
      const rows = await listMessages(s, latest.id);
      const actions = await listPendingActions(s, latest.id);
      const atts = await attachmentMeta(s, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
      messages = toUiMessages(rows, actions, atts, await memoryStatuses(s, suggestedMemoryIds(rows)));
    }
    return {
      conversations,
      activeId: latest?.id ?? null,
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
    />
  );
}
