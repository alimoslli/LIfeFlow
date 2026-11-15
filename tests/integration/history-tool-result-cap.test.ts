import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { messages } from "@/server/db/schema";
import { createConversation, loadHistory } from "@/server/jarvis/conversations";
import { MAX_TOOL_RESULT_CHARS, serializeResult } from "@/server/jarvis/executor";
import { makeUser } from "../helpers";

afterAll(closeDb);

// A tool result is capped when it is first sent to the model, and stored whole. On later turns the conversation is replayed:
// the replay must send what the model saw, not the whole stored result (a big file read went back whole on every turn).
describe("replaying a conversation", () => {
  it("sends a big tool result with the same cap as when it was first sent, and small ones unchanged", async () => {
    const { user, run } = await makeUser("History Cap");
    const big = { ok: true as const, data: { text: "x".repeat(60_000) } };
    const small = { ok: true as const, data: { id: "t1", title: "Pack lunch" } };
    const history = await run(async (s) => {
      const c = await createConversation(s);
      await s.tx.insert(messages).values([
        { userId: user.id, conversationId: c.id, role: "user", content: "read my notes file" },
        { userId: user.id, conversationId: c.id, role: "tool", toolCallId: "call_big", toolName: "read_attachment", toolArgs: {}, toolResult: big },
        { userId: user.id, conversationId: c.id, role: "tool", toolCallId: "call_small", toolName: "create_tasks", toolArgs: {}, toolResult: small },
        { userId: user.id, conversationId: c.id, role: "assistant", content: "Done." },
      ]);
      return loadHistory(s, c.id);
    });
    const out = (id: string) => history.find((i) => i.type === "tool_result" && i.callId === id) as { output: string };
    expect(out("call_big").output).toBe(serializeResult(big));
    expect(out("call_big").output.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 500);
    expect(JSON.parse(out("call_big").output).truncated).toBe(true);
    expect(out("call_small").output).toBe(JSON.stringify(small));
  });
});
