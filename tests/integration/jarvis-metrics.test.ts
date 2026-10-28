import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { jarvisRuns } from "@/server/db/schema";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { jarvisStats } from "@/server/jarvis/metrics";
import { PROMPT_VERSION } from "@/server/jarvis/prompt";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import type { ModelProvider } from "@/server/jarvis/providers/types";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-10-26T14:00:00Z");
const usage = { inputTokens: 1000, cachedInputTokens: 600, outputTokens: 50, reasoningTokens: 10 };

async function setup() {
  const u = await makeUser("Metrics Person");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  return { ...u, session };
}

async function turn(session: SessionUser, text: string, provider: ModelProvider, prices?: { inputPerMTok: number; outputPerMTok: number }) {
  const events: JarvisEvent[] = [];
  const r = await runJarvisTurn({ user: session, text, provider, emit: (e) => events.push(e), now: NOW, prices });
  return { ...r, events };
}

describe("Jarvis run metrics", () => {
  it("records steps, tool outcomes, summed usage, cost and the prompt version", async () => {
    const { session, run } = await setup();
    const responder: Responder = ({ step }) =>
      step === 0
        ? {
            usage,
            toolCalls: [
              { name: "create_tasks", args: { tasks: [{ title: "Buy stamps" }] } },
              { name: "get_task", args: { id: "00000000-0000-4000-8000-000000000000" } },
            ],
          }
        : { usage, text: "Added it." };
    const r = await turn(session, "add buy stamps", new ScriptedProvider(responder), { inputPerMTok: 2, outputPerMTok: 8 });
    expect(r.events.at(-1)).toMatchObject({ type: "done", runId: r.runId });

    const [row] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, r.runId!)));
    expect(row).toMatchObject({
      conversationId: r.conversationId,
      provider: "scripted",
      model: "scripted",
      promptVersion: PROMPT_VERSION,
      outcome: "ok",
      errorKind: null,
      steps: 2,
      toolCalls: 2,
      toolErrors: 1, // get_task on a missing id fails
      confirmations: 0,
      inputTokens: 2000,
      cachedInputTokens: 1200,
      outputTokens: 100,
      reasoningTokens: 20,
      costMicros: 800 * 2 + 1200 * 2 + 100 * 8, // no cached price set → input price
    });
    expect(row.toolNames.sort()).toEqual(["create_tasks", "get_task"]);
    expect(row.messageId).not.toBeNull();
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row.firstTokenMs).not.toBeNull();
  });

  it("counts confirmations separately from tool errors and leaves unknown cost null", async () => {
    const { session, run } = await setup();
    const created = await turn(
      session,
      "x",
      new ScriptedProvider(({ step }) => (step === 0 ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "Old" }] } }] } : { text: "ok" })),
    );
    void created;
    const [task] = await run((s) => s.tx.query.tasks.findMany());
    const r = await turn(
      session,
      "delete it",
      new ScriptedProvider(({ step }) => (step === 0 ? { toolCalls: [{ name: "delete_task", args: { id: task.id } }] } : { text: "Press Confirm." })),
    );
    const [row] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, r.runId!)));
    expect(row).toMatchObject({ confirmations: 1, toolErrors: 0, costMicros: null, inputTokens: null });
  });

  it("records failures with a coarse error kind", async () => {
    const { session, run } = await setup();
    const failing: ModelProvider = {
      name: "failing",
      model: "m",
      startTurn: () => ({
        async *step() {
          throw Object.assign(new Error("Too many requests"), { status: 429 });
        },
      }),
    };
    const r = await turn(session, "hello", failing);
    const [row] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, r.runId!)));
    expect(row).toMatchObject({ outcome: "error", errorKind: "rate_limited", messageId: null, firstTokenMs: null });
  });

  it("summarizes only the signed-in user's runs", async () => {
    const a = await setup();
    const b = await setup();
    const ok = new ScriptedProvider(() => ({ text: "hi", usage }));
    await turn(a.session, "one", ok);
    await turn(a.session, "two", ok);
    await turn(b.session, "three", ok);
    const statsA = await a.run((s) => jarvisStats(s, 30, new Date()));
    expect(statsA).toMatchObject({ runs: 2, failedRuns: 0, inputTokens: 2000, outputTokens: 100, costMicros: null, pricedRuns: 0 });
    expect(statsA.medianLatencyMs).not.toBeNull();
    // RLS: user B's scope can't read A's rows even without the explicit filter.
    const visible = await b.run((s) => s.tx.select({ id: jarvisRuns.id }).from(jarvisRuns));
    expect(visible).toHaveLength(1);
  });
});
