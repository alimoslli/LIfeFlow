"use server";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { getDb } from "@/server/db/client";
import { addSender, removeSender, undoInboxItem, verifySender } from "@/server/services/inbox";

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
      return `Undone: removed ${n} thing${n === 1 ? "" : "s"} Jarvis filed.`;
    },
    { revalidate: ["/inbox", "/"] },
  );
}
