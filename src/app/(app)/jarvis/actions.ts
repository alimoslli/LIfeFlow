"use server";
import { redirect } from "next/navigation";
import { mutate, type ActionState } from "@/server/actions";
import { deleteConversation } from "@/server/jarvis/conversations";
import { rateRun } from "@/server/jarvis/metrics";

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

/** 👍 / 👎 on a chat answer. */
export async function rateRunAction(runId: string, rating: 1 | -1 | null): Promise<ActionState> {
  if (rating !== 1 && rating !== -1 && rating !== null) return { ok: false, error: "Invalid rating.", at: Date.now() };
  return mutate("jarvis.answer.rated", async (s) => {
    await rateRun(s, runId, rating);
  });
}
