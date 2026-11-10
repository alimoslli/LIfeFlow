import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { listConversations } from "@/server/jarvis/conversations";
import { missingConnections } from "@/server/services/integrations";
import { ideaClouds } from "@/server/services/idea-clouds";
import { assistantProfile } from "@/lib/assistant";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Skyling" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string; voice?: string }> }) {
  const { ask, voice } = await searchParams;
  const { conversations, tz, connect, ideas } = await withCurrentUser(async (s, u) => ({
    conversations: await listConversations(s),
    connect: await missingConnections(s),
    // idea clouds under the skyling: what they can tell or ask it, from their own data (lib/idea-clouds)
    ideas: await ideaClouds(s, u.timezone, u.preferences, assistantProfile(u.preferences, u.timezone).name),
    tz: u.timezone,
  }));
  return (
    <JarvisPage
      conversations={conversations}
      activeId={null}
      messages={[]}
      tz={tz}
      ask={ask?.slice(0, 500)}
      connect={connect}
      ideas={ideas}
      voice={voice === "1"}
    />
  );
}
