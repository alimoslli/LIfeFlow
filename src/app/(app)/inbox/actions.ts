"use server";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { todayIn } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { addSender, answerQuestion, removeSender, fileSuggestion, undoInboxItem, verifySender } from "@/server/services/inbox";

const R = { revalidate: ["/inbox"] };

export async function addSenderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  return mutate(
    "inbox.sender_add",
    async (s) => {
      const r = await addSender(s, getDb(), email);
      return r.verified ? `${email} can forward to your inbox.` : `We emailed a 6-digit code to ${email}. Enter it below.`;
    },
    R,
  );
}

export async function verifySenderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("inbox.sender_verify", async (s) => (await verifySender(s, f.email ?? "", f.code ?? ""), `Verified. Forward from ${f.email} anytime.`), R);
}

export async function removeSenderAction(id: string): Promise<ActionState> {
  return mutate("inbox.sender_remove", async (s) => (await removeSender(s, id), "Address removed. Mail from it will be ignored."), R);
}

export async function undoInboxAction(id: string): Promise<ActionState> {
  return mutate(
    "inbox.undo",
    async (s) => {
      const n = await undoInboxItem(s, id);
      if (n === 0) return "It changed after this (in Canvas or by hand), so I left it as it is.";
      return `Undone: removed ${n} thing${n === 1 ? "" : "s"} that were filed.`;
    },
    { revalidate: ["/inbox", "/"] },
  );
}

export async function fileSuggestionAction(id: string): Promise<ActionState> {
  return mutate(
    "inbox.file_suggestion",
    async (s, u) => {
      const r = await fileSuggestion(s, u.timezone, todayIn(u.timezone), id);
      return r.status === "filed" ? "Filed. You can undo it below." : (r.reason ?? "Couldn't file that one.");
    },
    { revalidate: ["/inbox", "/"] },
  );
}

export async function answerQuestionAction(id: string, same: boolean, pick?: string): Promise<ActionState> {
  return mutate(
    "inbox.answer_question",
    async (s, u) => {
      const r = await answerQuestion(s, u.timezone, todayIn(u.timezone), id, same, pick);
      const exam = (r.extracted as { ask?: { kind?: string } } | null)?.ask?.kind === "exam";
      // Worded from what really happened: a stale card (the bill or exam moved on since) changes nothing and says so.
      if (same && r.status !== "duplicate" && !r.filed.length) return "Nothing changed. It had already moved on since I asked.";
      if (exam) return same ? (r.status === "filed" ? "Moved. You can undo it below." : "Nothing changed.") : "Kept the old date.";
      return r.status === "duplicate"
        ? "Got it, it's the same. Nothing was added."
        : same
          ? "Updated. You can undo it below."
          : "Kept both. You can undo it below.";
    },
    { revalidate: ["/inbox", "/", "/finances/bills", "/plan", "/school"] },
  );
}
