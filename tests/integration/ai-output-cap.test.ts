import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb } from "@/server/db/client";
import { aiUsage, jarvisRuns, messages } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { OpenAIProvider } from "@/server/jarvis/providers/openai";
import { STEP_OUTPUT_TOKEN_CAP } from "@/server/services/ai-estimates";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// A fake fetch speaking the streaming wire format. Nothing here can reach a real provider.
function fakeProvider(final: "incomplete" | "completed", bodies: unknown[]) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const text = "Here is the start of your plan: ";
    const msg = { type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
    const call = { type: "function_call", id: "fc1", call_id: "c1", name: "create_tasks", arguments: '{"tasks":[{"title":"half writ', status: "completed" };
    const usage = {
      input_tokens: 1000,
      output_tokens: 25_000,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 24_000 },
    };
    const events: unknown[] = [{ type: "response.output_text.delta", delta: text, item_id: "m1", output_index: 0, content_index: 0, logprobs: [] }];
    events.push(
      final === "incomplete"
        ? {
            type: "response.incomplete",
            response: { id: "r", object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [msg, call], usage },
          }
        : { type: "response.completed", response: { id: "r", object: "response", status: "completed", output: [msg], usage } },
    );
    const body = events.map((e, i) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify({ sequence_number: i, ...(e as object) })}\n\n`).join("");
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return new OpenAIProvider({ apiKey: "sk-fake", model: "gpt-5.5", baseURL: "http://fake.invalid/v1", fetch: fetchImpl, reasoningEffort: "high" });
}

const sessionOf = (u: { user: { id: string; email: string; name: string } }): SessionUser => ({
  id: u.user.id,
  email: u.user.email,
  name: u.user.name,
  timezone: TZ,
  accountKind: "standard",
});

describe("a model that runs out of room is never recorded as a finished answer", () => {
  it("asks the model for a cap that leaves room to think, in the estimate and in the request", async () => {
    expect(STEP_OUTPUT_TOKEN_CAP).toBeGreaterThanOrEqual(25_000);
    const u = await makeUser();
    const bodies: { max_output_tokens?: number }[] = [];
    await runJarvisTurn({ user: sessionOf(u), text: "hello", provider: fakeProvider("completed", bodies), emit: () => {} });
    expect(bodies[0].max_output_tokens).toBe(STEP_OUTPUT_TOKEN_CAP);
  });

  it("incomplete: keeps the partial text, says so plainly, runs no half-written tool call, and records an error, not ok", async () => {
    const u = await makeUser();
    const events: JarvisEvent[] = [];
    const r = await runJarvisTurn({
      user: sessionOf(u),
      text: "Plan my whole semester",
      provider: fakeProvider("incomplete", []),
      emit: (e) => events.push(e),
    });
    const said = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(said).toContain("Here is the start of your plan:");
    expect(said).toMatch(/more than .* could fit in one answer.*smaller piece/);
    expect(said).not.toMatch(/token|gpt|openai|max_output/i);
    expect(events.some((e) => e.type === "tool_start")).toBe(false);
    const [run] = await u.run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, r.runId!)));
    expect(run).toMatchObject({ outcome: "error", errorKind: "output_cap", toolCalls: 0 });
    const saved = await u.run((s) => s.tx.select().from(messages).where(eq(messages.conversationId, r.conversationId)));
    expect(saved.some((m) => m.role === "tool")).toBe(false);
    const [usage] = await withUser(u.user.id, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, u.user.id)));
    expect(usage).toMatchObject({ state: "failed", outputTokens: 25_000 });
  });
});
