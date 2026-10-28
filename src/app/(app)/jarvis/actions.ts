"use server";
import { redirect } from "next/navigation";
import { mutate, type ActionState } from "@/server/actions";
import { deleteConversation } from "@/server/jarvis/conversations";

export async function deleteConversationAction(id: string): Promise<ActionState> {
  const r = await mutate(
    "jarvis.conversation.delete",
    async (s) => {
      await deleteConversation(s, id);
    },
    { revalidate: ["/jarvis"] },
  );
  if (r?.ok) redirect("/jarvis");
  return r;
}
