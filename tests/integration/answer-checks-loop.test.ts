import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { aiUsage, calendarEvents, jarvisRuns, messages, promises } from "@/server/db/schema";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import type { AnswerChecksMode } from "@/server/jarvis/answer-checks";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import { OpenAIProvider } from "@/server/jarvis/providers/openai";
import { STEP_OUTPUT_TOKEN_CAP } from "@/server/services/ai-estimates";
import { looksLikeDistress } from "@/lib/distress";
import { makeUser, TZ } from "../helpers";
import type { SessionUser } from "@/server/auth/sessions";

/**
 * The answer checks inside the real skyling loop (answer-checks.ts; owner, 2026-11-27), with the scripted model: nothing
 * reaches a provider. Off: nothing changes. Watch: counted, nothing changes. Fix: a failing answer is never shown, the model
 * is asked once more as one more step of the same turn, and the person always ends up with an answer.
 */
afterAll(closeDb);

const NOW = new Date("2026-11-21T18:30:00Z"); // Saturday 1:30 PM in New York
const LATER_LINE = "I can't search the web right now. Want me to try again in a bit?";
const CLEAN_LINE = "I can't search the web here. I can save it as a to-do so it's waiting for you.";

async function person() {
  const u = await makeUser("Robin Vale");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  return { u, session };
}

async function turn(session: SessionUser, text: string, responder: Responder, answerChecks?: AnswerChecksMode) {
  const events: JarvisEvent[] = [];
  const seen: { step: number; note?: string }[] = [];
  const provider = new ScriptedProvider((c) => {
    seen.push({ step: c.step, note: c.note });
    return responder(c);
  });
  const out = await runJarvisTurn({ user: session, text, provider, emit: (e) => events.push(e), now: NOW, answerChecks });
  const said = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
  return { out, events, said, seen };
}

async function recorded(u: Awaited<ReturnType<typeof makeUser>>, conversationId: string) {
  return u.run(async (s) => {
    const [run] = await s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.conversationId, conversationId));
    const [usage] = await s.tx.select().from(aiUsage).where(eq(aiUsage.conversationId, conversationId));
    const answers = await s.tx
      .select({ content: messages.content, status: messages.status })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "assistant")));
    return { run, usage, answers };
  });
}

describe("answer checks in the skyling's loop", () => {
  it("off (the default): the answer goes out as written, one step, nothing counted", async () => {
    const { u, session } = await person();
    const t = await turn(session, "find studies on video games", () => ({ text: LATER_LINE }));
    expect(t.said).toBe(LATER_LINE);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.steps).toBe(1);
    expect(r.run.answerChecks).toEqual([]);
    expect(r.run.answerFixed).toBeNull();
  });

  it("watch: counted on the run, nothing changes for the person and no second model call", async () => {
    const { u, session } = await person();
    const t = await turn(session, "find studies on video games", () => ({ text: LATER_LINE }), "watch");
    expect(t.said).toBe(LATER_LINE);
    expect(t.seen).toHaveLength(1);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.steps).toBe(1);
    expect(r.run.answerChecks).toEqual(["works_later"]);
    expect(r.run.answerFixed).toBeNull();
    expect(r.usage.steps).toBe(1);
  });

  it("fix: the failing answer is never shown or saved; the model is told what to fix once, and that step is counted", async () => {
    const { u, session } = await person();
    const t = await turn(session, "find studies on video games", (c) => ({ text: c.note ? CLEAN_LINE : LATER_LINE }), "fix");
    expect(t.said).toBe(CLEAN_LINE);
    expect(t.said).not.toContain("try again");
    expect(t.seen).toHaveLength(2);
    expect(t.seen[0].note).toBeUndefined();
    expect(t.seen[1].note).toMatch(/was not shown to them/);
    expect(t.seen[1].note).toMatch(/it works here or it does not/);
    const r = await recorded(u, t.out.conversationId);
    expect(r.answers.map((a) => a.content)).toEqual([CLEAN_LINE]);
    // the second try is one more step of the same turn: set aside and settled like any step, on the same usage row
    expect(r.run.steps).toBe(2);
    expect(r.usage.steps).toBe(2);
    expect(r.usage.state).toBe("settled");
    expect(r.run.answerChecks).toEqual(["works_later"]);
    expect(r.run.answerFixed).toBe(true);
    expect(r.run.outcome).toBe("ok");
    // the run points at the answer the person really got
    const done = t.events.find((e) => e.type === "done");
    expect(done && done.type === "done" && done.messageId).toBeTruthy();
  });

  it("fix: at most one retry, ever. A second answer that still fails is shown and counted as not fixed", async () => {
    const { u, session } = await person();
    const t = await turn(session, "find studies on video games", () => ({ text: LATER_LINE }), "fix");
    expect(t.seen).toHaveLength(2);
    expect(t.said).toBe(LATER_LINE);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.steps).toBe(2);
    expect(r.answers.map((a) => a.content)).toEqual([LATER_LINE]);
    expect(r.run.answerFixed).toBe(false);
  });

  it("fix: a clean answer costs nothing more: one step, shown whole", async () => {
    const { u, session } = await person();
    const t = await turn(session, "hey", () => ({ text: "Hey Robin. Nothing is due today." }), "fix");
    expect(t.seen).toHaveLength(1);
    expect(t.said).toBe("Hey Robin. Nothing is due today.");
    // held until checked, so it arrives in one piece
    expect(t.events.filter((e) => e.type === "text")).toHaveLength(1);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.steps).toBe(1);
    expect(r.run.answerFixed).toBeNull();
  });

  it("fix: when the second try fails, the person still gets the answer that was held back", async () => {
    const { u, session } = await person();
    const t = await turn(
      session,
      "find studies on video games",
      (c) => {
        if (c.note) throw new Error("the provider broke");
        return { text: LATER_LINE };
      },
      "fix",
    );
    expect(t.said).toBe(LATER_LINE);
    expect(t.events.some((e) => e.type === "error")).toBe(false);
    const r = await recorded(u, t.out.conversationId);
    expect(r.answers).toEqual([{ content: LATER_LINE, status: "complete" }]);
    expect(r.run.outcome).toBe("ok");
    expect(r.run.answerFixed).toBe(false);
  });

  it("fix: a second try that comes back empty also falls back to the first answer", async () => {
    const { session } = await person();
    const t = await turn(session, "find studies on video games", (c) => ({ text: c.note ? "" : LATER_LINE }), "fix");
    expect(t.said).toBe(LATER_LINE);
  });

  it("fix: a reply to someone in real distress is never sent back", async () => {
    const { u, session } = await person();
    const stay =
      "I'm really glad you told me. I take it seriously. Is there someone you trust who can be with you now? You can call or text 988 any time. How are you right now? Are you safe? Can you stay with me a minute?";
    const t = await turn(session, "I don't want to be here anymore", () => ({ text: stay }), "fix");
    expect(t.seen).toHaveLength(1);
    expect(t.said).toBe(stay);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.answerChecks).toEqual([]);
  });

  it("fix: a check-in for a time already gone is not saved the first time; the model picks a time still ahead", async () => {
    const { u, session } = await person();
    const t = await turn(
      session,
      "I'll start the essay today, I promise",
      (c) => {
        if (c.step === 0) return { toolCalls: [{ name: "make_promise", args: { text: "Start the essay", date: "2026-11-21", time: "09:00" } }] };
        if (c.step === 1) {
          // the call was not run, and the note says why
          expect(c.results[0].output).toMatch(/Not run/);
          expect(c.results[0].output).toMatch(/already 1:30 PM/);
          return { toolCalls: [{ name: "make_promise", args: { text: "Start the essay", date: "2026-11-21", time: "21:00" } }] };
        }
        return { text: "That's a promise. I'll check in tonight at 9 PM." };
      },
      "fix",
    );
    expect(t.said).toBe("That's a promise. I'll check in tonight at 9 PM.");
    const saved = await u.run((s) => s.tx.select({ text: promises.text, dueAt: promises.dueAt }).from(promises));
    expect(saved).toHaveLength(1);
    expect(saved[0].dueAt.toISOString()).toBe("2026-11-22T02:00:00.000Z");
    // the person saw one saved check-in, never the refused one
    expect(t.events.filter((e) => e.type === "tool_start")).toHaveLength(1);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.answerChecks).toEqual(["past_save"]);
    expect(r.run.toolCalls).toBe(1);
  });

  it("fix: the very same call asked for again runs (they may really have meant it)", async () => {
    const { u, session } = await person();
    // something that really happened this morning, logged after the fact
    const call = { name: "create_events", args: { events: [{ title: "Dentist", date: "2026-11-21", startTime: "09:00", endTime: "09:30" }] } };
    const t = await turn(session, "add my dentist appointment from 9 this morning", (c) => (c.step < 2 ? { toolCalls: [call] } : { text: "Added." }), "fix");
    expect(t.seen[1]).toBeDefined();
    expect(t.events.filter((e) => e.type === "tool_start")).toHaveLength(1);
    const saved = await u.run((s) => s.tx.select({ title: calendarEvents.title }).from(calendarEvents));
    expect(saved).toEqual([{ title: "Dentist" }]);
  });

  it("watch: a late save is counted but still runs", async () => {
    const { u, session } = await person();
    const call = { name: "create_events", args: { events: [{ title: "Stretch", date: "2026-11-21", startTime: "09:00", endTime: "09:15" }] } };
    const t = await turn(session, "add my stretch from this morning", (c) => (c.step === 0 ? { toolCalls: [call] } : { text: "Added." }), "watch");
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.answerChecks).toEqual(["past_save"]);
    expect(r.run.toolCalls).toBe(1);
  });

  it("fix: someone who may be in distress: no check, no hold, no retry, even with no number in the reply (COO review)", async () => {
    const { u, session } = await person();
    // long, three questions, asks something: every rule would trip, and none may
    const stay =
      "I'm really glad you told me, and I'm here with you right now. Is there someone you trust nearby who could come and be with you? Are you somewhere safe at the moment? Which feels harder tonight, being alone or the thoughts themselves? I'm not going anywhere, and you don't have to sort anything out with me right now, we can just talk for a minute.";
    const t = await turn(session, "I want to die", () => ({ text: stay }), "fix");
    expect(t.seen).toHaveLength(1);
    expect(t.said).toBe(stay);
    // streamed as it came, in pieces, not held back and sent whole
    expect(t.events.filter((e) => e.type === "text").length).toBeGreaterThan(1);
    const r = await recorded(u, t.out.conversationId);
    expect(r.run.answerChecks).toEqual([]);
    expect(r.run.answerFixed).toBeNull();
    // and the next message in that chat too, whatever it says
    const next = new ScriptedProvider(() => ({ text: "I'm still here. Can you tell me where you are right now? Is anyone with you? What would help most?" }));
    const events: JarvisEvent[] = [];
    const again = await runJarvisTurn({
      user: session,
      conversationId: t.out.conversationId,
      text: "idk",
      provider: next,
      emit: (e) => events.push(e),
      now: NOW,
      answerChecks: "fix",
    });
    const r2 = await u.run(async (s) => (await s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, again.runId!)))[0]);
    expect(r2.answerChecks).toEqual([]);
    expect(r2.steps).toBe(1);
  });

  it("the distress check: the prompt's own examples yes, everyday stress no", () => {
    for (const x of [
      "I want to die",
      "I don't want to be here anymore",
      "sometimes I think everyone would be better off without me",
      "I can't do this anymore, what's the point",
      "i keep thinking about killing myself",
      "I'm not safe at home",
      "I already hurt myself tonight",
      "I wish I wasn't alive",
      "I can’t go on",
    ])
      expect(looksLikeDistress(x), x).toBe(true);
    for (const x of ["this week is killing me", "I'm dying of boredom", "I'm so done with this class", "my phone died", "the essay is killing me lol"])
      expect(looksLikeDistress(x), x).toBe(false);
  });

  it("fix: the retry step carries the same output cap as every step (the real provider's request body)", async () => {
    const { session } = await person();
    const bodies: { max_output_tokens?: number }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const text = bodies.length === 1 ? LATER_LINE : CLEAN_LINE;
      const usage = { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
      const output = [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }];
      const events = [
        { type: "response.output_text.delta", sequence_number: 0, item_id: "m1", output_index: 0, content_index: 0, delta: text, logprobs: [] },
        { type: "response.completed", sequence_number: 1, response: { id: "r", object: "response", status: "completed", output, usage } },
      ];
      return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-fake", model: "gpt-5.5", baseURL: "http://fake.invalid/v1", fetch: fetchImpl });
    const events: JarvisEvent[] = [];
    await runJarvisTurn({ user: session, text: "find studies on video games", provider, emit: (e) => events.push(e), now: NOW, answerChecks: "fix" });
    expect(bodies).toHaveLength(2);
    for (const b of bodies) expect(b.max_output_tokens).toBe(STEP_OUTPUT_TOKEN_CAP);
    // the second request carries the app's note after the first answer
    expect(JSON.stringify(bodies[1])).toMatch(/was not shown to them/);
    expect(
      events
        .filter((e) => e.type === "text")
        .map((e) => (e.type === "text" ? e.delta : ""))
        .join(""),
    ).toBe(CLEAN_LINE);
  });
});
