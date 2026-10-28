import { after } from "next/server";
import type { SessionUser } from "../../auth/sessions";
import { withUser } from "../../db/with-user";
import { runProactive } from "./engine";

type Trigger = "transaction" | "shift" | "goal" | "task";

/** Which saved changes make Jarvis take a fresh look (matched on the mutate() action name). */
const TRIGGERS: [RegExp, Trigger][] = [
  [/^transaction\.(create|import)/, "transaction"],
  [/^shift\.create/, "shift"],
  [/^goal\.(contribut|create)/, "goal"],
  [/^task\.(toggle|complete)/, "task"],
];

/** After the response is sent, runs the detectors that this change could affect. Never blocks or breaks the save. */
export function proactiveAfterMutation(actionName: string, user: SessionUser) {
  const trigger = TRIGGERS.find(([re]) => re.test(actionName))?.[1];
  if (!trigger || user.accountKind === "demo") return;
  after(async () => {
    try {
      await withUser(user.id, (scope) => runProactive({ scope, tz: user.timezone, prefs: user.preferences, trigger }));
    } catch (e) {
      console.error("proactive event failed", trigger, e instanceof Error ? e.name : "unknown");
    }
  });
}
