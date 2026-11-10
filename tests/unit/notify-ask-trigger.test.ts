import { describe, expect, it } from "vitest";
import { describeToolResult } from "@/server/jarvis/labels";

/**
 * The chat offers notifications the first time a promise is made or a to-do gets a reminder (owner's program, item 3):
 * the chat reads "reminder on" from create_tasks' summary, so that word must be there exactly when a reminder was set.
 */
describe("the notifications ask's trigger", () => {
  const created = (reminders: boolean[]) => ({
    ok: true,
    data: { created: reminders.map((reminder, i) => ({ id: `t${i}`, title: "x", reminder })), viewAt: "/tasks" },
  });

  it("says 'reminder on' only when a created to-do has a reminder", () => {
    expect(describeToolResult("create_tasks", created([false])).summary).toBe("Created 1 task");
    expect(describeToolResult("create_tasks", created([false, true])).summary).toBe("Created 2 tasks · reminder on");
  });
});
