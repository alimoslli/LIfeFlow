import { describe, expect, it } from "vitest";
import { keepRecentToolSteps, stepStub } from "@/server/jarvis/history-trim";
import type { ChatItem } from "@/server/jarvis/providers/types";

const turn = (q: string, tool: string, a: string): ChatItem[] => [
  { type: "user", text: q },
  { type: "tool_call", callId: `c-${q}`, name: tool, arguments: "{}" },
  { type: "tool_result", callId: `c-${q}`, output: '{"ok":true}' },
  { type: "assistant", text: a },
];

describe("keepRecentToolSteps", () => {
  it("keeps a short chat exactly as it is", () => {
    const h = [...turn("one", "get_daily_briefing", "A"), { type: "user", text: "two" } as ChatItem];
    expect(keepRecentToolSteps(h)).toEqual(h);
  });

  it("keeps every earlier word but only the last finished turn's and the current turn's tool steps", () => {
    const h = [
      ...turn("one", "spending_summary", "A"),
      ...turn("two", "list_bills", "B"),
      ...turn("three", "get_daily_briefing", "C"),
      { type: "user", text: "four" } as ChatItem,
    ];
    const out = keepRecentToolSteps(h);
    expect(out.filter((x) => x.type === "user").map((x) => (x as { text: string }).text)).toEqual(["one", "two", "three", "four"]);
    expect(out.filter((x) => x.type === "assistant").length).toBe(3);
    expect(out.filter((x) => x.type === "tool_call").map((x) => (x as { name: string }).name)).toEqual(["get_daily_briefing"]);
    // every kept call still has its result right after it
    const calls = out.flatMap((x, i) => (x.type === "tool_call" ? [i] : []));
    for (const i of calls) expect(out[i + 1]).toMatchObject({ type: "tool_result", callId: (out[i] as { callId: string }).callId });
  });

  it("keeps a turn that is being continued (its own tool steps are after the last user message)", () => {
    const h = [...turn("one", "spending_summary", "A"), ...turn("two", "list_bills", "B"), ...turn("three", "create_tasks", "")];
    const out = keepRecentToolSteps(h);
    expect(out.filter((x) => x.type === "tool_call").map((x) => (x as { name: string }).name)).toEqual(["list_bills", "create_tasks"]);
  });

  const writes = (name: string) => name.startsWith("create_") || name.startsWith("delete_");

  it("a step that changed something leaves one line naming what it saved; a lookup leaves nothing", () => {
    const save: ChatItem[] = [
      { type: "user", text: "one" },
      { type: "tool_call", callId: "s1", name: "create_tasks", arguments: "{}" },
      { type: "tool_result", callId: "s1", output: '{"ok":true,"data":{"created":[{"id":"t1","title":"Email advisor"}]}}' },
      { type: "assistant", text: "Added." },
    ];
    const h = [...save, ...turn("two", "list_bills", "B"), ...turn("three", "get_daily_briefing", "C"), { type: "user", text: "four" } as ChatItem];
    const out = keepRecentToolSteps(h, { changes: writes });
    expect(out.filter((x) => x.type === "assistant").map((x) => (x as { text: string }).text)).toEqual([
      "[Earlier in this chat: create_tasks saved (Email advisor). Its details aren't repeated here.]",
      "Added.",
      "B",
      "C",
    ]);
    expect(out.some((x) => x.type === "tool_call" && x.name === "list_bills")).toBe(false);
  });

  it("a turn that ended without words after its steps is never trimmed", () => {
    const h = [
      ...turn("one", "create_tasks", ""),
      ...turn("two", "list_bills", "B"),
      ...turn("three", "get_daily_briefing", "C"),
      { type: "user", text: "four" } as ChatItem,
    ];
    const out = keepRecentToolSteps(h, { changes: writes });
    expect(out.filter((x) => x.type === "tool_call").map((x) => (x as { name: string }).name)).toEqual(["create_tasks", "get_daily_briefing"]);
  });

  it("a confirm card's stub says what really became of it", () => {
    const waiting = '{"ok":true,"data":{"status":"awaiting_user_confirmation","summary":"Delete Old list?"}}';
    expect(stepStub("delete_task", waiting)).toContain("still waiting for the user to press Confirm");
    expect(stepStub("delete_task", waiting, "expired")).toContain("expired unconfirmed, nothing was changed");
    expect(stepStub("delete_task", '{"ok":false,"data":{"status":"cancelled"}}')).toContain("cancelled by the user");
    expect(stepStub("send_email", waiting, "executed")).toContain("done after the user confirmed");
    expect(stepStub("create_tasks", '{"ok":false,"error":"x"}')).toContain("failed, nothing was changed");
  });
});
