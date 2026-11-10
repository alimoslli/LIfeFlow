"use server";
import { redirect } from "next/navigation";
import { mutate, type ActionState } from "@/server/actions";
import { deleteConversation } from "@/server/jarvis/conversations";
import { rateRun } from "@/server/jarvis/metrics";
import { importMemories } from "@/server/services/memory";
import { saveLifeImport } from "@/server/services/life-import";
import { withCurrentUser } from "@/server/auth/current-user";
import { recordCloudTap } from "@/server/services/idea-clouds";
import { undoChatTools } from "@/server/jarvis/undo";

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

/** Saves the lines the user ticked on Import (facts, milestones, goals). */
export async function saveLifeImportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let items: unknown;
  try {
    items = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return { ok: false, error: "Couldn't read that. Try again.", at: Date.now() };
  }
  let r = { facts: 0, milestones: 0, goals: 0, skipped: 0 };
  const res = await mutate(
    "jarvis.memory.import",
    async (s) => {
      r = await saveLifeImport(s, items);
      if (!r.facts && !r.milestones && !r.goals) return "Nothing new to add. Those are already saved or were left out for privacy.";
    },
    { revalidate: ["/jarvis", "/milestones", "/goals"] },
  );
  if (res?.ok && (r.facts || r.milestones || r.goals)) redirect(`/goals?view=done&imported=${r.facts}.${r.milestones}.${r.goals}`);
  return res;
}

/** An idea cloud was tapped: counts it (which cloud, never the message), so a feature they've tried shows less. */
export async function tapIdeaCloudAction(key: string): Promise<void> {
  if (typeof key !== "string" || key.length > 40) return;
  await withCurrentUser((s) => recordCloudTap(s, key));
}

/** Undo under the last answer: takes back exactly what that answer created (program item 8). */
export async function undoChatToolsAction(conversationId: string, callIds: string[]): Promise<ActionState> {
  if (typeof conversationId !== "string" || !Array.isArray(callIds)) return { ok: false, error: "There's nothing to undo here.", at: Date.now() };
  return mutate("jarvis.chat.undo", async (s) => (await undoChatTools(s, conversationId, callIds.map(String))).text, {
    revalidate: ["/", "/tasks", "/plan", "/calendar"],
  });
}
