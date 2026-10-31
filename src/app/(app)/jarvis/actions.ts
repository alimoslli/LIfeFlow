"use server";
import { redirect } from "next/navigation";
import { mutate, type ActionState } from "@/server/actions";
import { deleteConversation } from "@/server/jarvis/conversations";
import { rateRun } from "@/server/jarvis/metrics";
import { importMemories } from "@/server/services/memory";

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

export async function importMemoriesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const text = String(fd.get("text") ?? "").slice(0, 20_000);
  let result = { suggested: 0, skipped: 0 };
  const r = await mutate("jarvis.memory.import", async (s) => {
    result = await importMemories(s, text);
    if (!result.suggested) return result.skipped ? "Nothing new to add. Those are already known or were left out for privacy." : "No facts found in that text.";
  });
  if (r?.ok && result.suggested) redirect(`/jarvis/memory?imported=${result.suggested}`);
  return r;
}
