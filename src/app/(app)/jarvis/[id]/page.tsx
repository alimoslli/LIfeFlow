import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withCurrentUser } from "@/server/auth/current-user";
import { attachmentMeta, getConversation, listConversations, listMessages, listPendingActions } from "@/server/jarvis/conversations";
import { suggestedMemoryIds, toUiMessages } from "@/server/jarvis/ui-messages";
import { memoryStatuses } from "@/server/services/memory";
import { JarvisPage } from "../jarvis-page";

export const metadata: Metadata = { title: "Jarvis" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withCurrentUser(async (s, u) => {
    const conv = await getConversation(s, id).catch(() => null);
    if (!conv) return null;
    const rows = await listMessages(s, id);
    const actions = await listPendingActions(s, id);
    const atts = await attachmentMeta(s, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
    const statuses = await memoryStatuses(s, suggestedMemoryIds(rows));
    return { conversations: await listConversations(s), messages: toUiMessages(rows, actions, atts, statuses), tz: u.timezone };
  });
  if (!data) notFound();
  return <JarvisPage conversations={data.conversations} activeId={id} messages={data.messages} tz={data.tz} />;
}
