import type { Metadata } from "next";
import { withCurrentUser } from "@/server/auth/current-user";
import { listConversations } from "@/server/jarvis/conversations";
import { JarvisPage } from "./jarvis-page";

export const metadata: Metadata = { title: "Jarvis" };

export default async function Page() {
  const { conversations, tz } = await withCurrentUser(async (s, u) => ({ conversations: await listConversations(s), tz: u.timezone }));
  return <JarvisPage conversations={conversations} activeId={null} messages={[]} tz={tz} />;
}
