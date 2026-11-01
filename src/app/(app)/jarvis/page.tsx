import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { listConversations } from "@/server/jarvis/conversations";
import { missingConnections } from "@/server/services/integrations";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Jarvis" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const { conversations, tz, connect } = await withCurrentUser(async (s, u) => ({
    conversations: await listConversations(s),
    connect: await missingConnections(s),
    tz: u.timezone,
  }));
  return <JarvisPage conversations={conversations} activeId={null} messages={[]} tz={tz} ask={ask?.slice(0, 500)} connect={connect} />;
}
