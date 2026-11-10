import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { attachmentMeta, listConversations, listMessages, listPendingActions } from "@/server/jarvis/conversations";
import { suggestedMemoryIds, toUiMessages } from "@/server/jarvis/ui-messages";
import { memoryStatuses } from "@/server/services/memory";
import type { UiMessage } from "@/components/jarvis/types";
import { missingConnections } from "@/server/services/integrations";
import { ideaClouds } from "@/server/services/idea-clouds";
import { assistantProfile } from "@/lib/assistant";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Skyling" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string; voice?: string }> }) {
  const { ask, voice } = await searchParams;
  const { conversations, tz, connect, ideas, messages } = await withCurrentUser(async (s, u) => {
    const conversations = await listConversations(s);
    // one chat that keeps going (owner, 2026-11-10: "starting a new chat is annoying every time"): the skyling's page
    // opens the latest one, the same one Today's bar carries on
    const latest = conversations[0];
    let messages: UiMessage[] = [];
    if (latest) {
      const rows = await listMessages(s, latest.id);
      const actions = await listPendingActions(s, latest.id);
      const atts = await attachmentMeta(s, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
      messages = toUiMessages(rows, actions, atts, await memoryStatuses(s, suggestedMemoryIds(rows)));
    }
    return {
      conversations,
      messages,
      connect: await missingConnections(s),
      // idea clouds under the skyling: what they can tell or ask it, from their own data (lib/idea-clouds)
      ideas: await ideaClouds(s, u.timezone, u.preferences, assistantProfile(u.preferences, u.timezone).name),
      tz: u.timezone,
    };
  });
  return (
    <JarvisPage
      conversations={conversations}
      activeId={conversations[0]?.id ?? null}
      messages={messages}
      tz={tz}
      ask={ask?.slice(0, 500)}
      connect={connect}
      ideas={ideas}
      voice={voice === "1"}
    />
  );
}
