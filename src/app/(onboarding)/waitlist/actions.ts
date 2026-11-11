"use server";

import { getDb } from "@/server/db/client";
import { mutate, formObject, type ActionState } from "@/server/actions";
import { setWaitlistNickname } from "@/server/services/waitlist";

/**
 * Sets, changes or clears the optional public nickname. An account-level action (the `auth.` name keeps it open to
 * people waiting); it writes only the nickname and never touches anyone's place in line.
 */
export async function saveNicknameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  const clear = f.intent === "clear";
  return mutate(
    "auth.waitlist_nickname",
    async (_s, u) => {
      const saved = await setWaitlistNickname(getDb(), u.id, clear ? "" : (f.nickname ?? ""));
      return saved ? "Saved. Others in line see it now." : "Cleared. You're back to your skyling name.";
    },
    { revalidate: ["/waitlist"] },
  );
}
