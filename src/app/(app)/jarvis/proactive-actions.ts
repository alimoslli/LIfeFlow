"use server";
import { todayIn } from "@/lib/dates";
import { mutate, type ActionState } from "@/server/actions";
import { respondToMessage, type Response } from "@/server/services/proactive/respond";

const RESPONSES: Response[] = ["do", "snooze", "dismiss", "mute", "up", "down", "undo"];

/** A button on one of Jarvis's messages. */
export async function respondAction(id: string, response: Response): Promise<ActionState> {
  if (!RESPONSES.includes(response)) return { ok: false, error: "Unknown response.", at: Date.now() };
  return mutate(`jarvis.message.${response}`, async (s, u) => (await respondToMessage(s, u, id, response, todayIn(u.timezone))).text, {
    revalidate: ["/"],
  });
}
