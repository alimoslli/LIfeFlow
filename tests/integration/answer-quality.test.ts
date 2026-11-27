import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { jarvisRuns } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { answerQuality, rateRun } from "@/server/jarvis/metrics";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { listMessages, listPendingActions } from "@/server/jarvis/conversations";
import { answerRuns, toUiMessages } from "@/server/jarvis/ui-messages";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

/** The thumbs-down reason and the per-version numbers on the debug screen (owner, 2026-11-27). Codes only. */
afterAll(closeDb);

describe("answer quality numbers", () => {
  it("a thumbs-down keeps its reason; a thumbs-up or taking it back clears it; the numbers add up per prompt version", async () => {
    const u = await makeUser("Robin Vale");
    const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
    const ask = (text: string) =>
      runJarvisTurn({ user: session, text, provider: new ScriptedProvider(() => ({ text })), emit: () => {}, answerChecks: "watch" });
    const bad = await ask("Want me to try again in a bit?");
    const good = await ask("Homework 8 is due at 11:59 PM tonight.");
    await u.run((s) => rateRun(s, bad.runId!, -1, "not_done"));
    await u.run((s) => rateRun(s, good.runId!, 1, "wrong"));
    const reason = (id: string) => u.run(async (s) => (await s.tx.select({ r: jarvisRuns.ratingReason }).from(jarvisRuns).where(eq(jarvisRuns.id, id)))[0].r);
    expect(await reason(bad.runId!)).toBe("not_done");
    // a reason belongs to a thumbs-down only
    expect(await reason(good.runId!)).toBeNull();
    const [q] = await u.run((s) => answerQuality(s));
    expect(q).toMatchObject({ runs: 2, flagged: 1, sentBack: 0, up: 1, down: 1, downAndFlagged: 1, found: { works_later: 1 }, reasons: { not_done: 1 } });
    await u.run((s) => rateRun(s, bad.runId!, null));
    expect(await reason(bad.runId!)).toBeNull();
  });

  it("a chat loaded again keeps each answer's thumbs and rating (before, they went at the first refresh)", async () => {
    const u = await makeUser("Robin Vale");
    const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
    const first = await runJarvisTurn({ user: session, text: "hi", provider: new ScriptedProvider(() => ({ text: "Hey Robin." })), emit: () => {} });
    await runJarvisTurn({
      user: session,
      conversationId: first.conversationId,
      text: "thanks",
      provider: new ScriptedProvider(() => ({ text: "Any time." })),
      emit: () => {},
    });
    await u.run((s) => rateRun(s, first.runId!, -1, "too_long"));
    const ui = await u.run(async (s) =>
      toUiMessages(
        await listMessages(s, first.conversationId),
        await listPendingActions(s, first.conversationId),
        [],
        new Map(),
        await answerRuns(s, first.conversationId),
      ),
    );
    const answers = ui.filter((m) => m.role === "assistant");
    expect(answers.map((a) => a.role === "assistant" && [a.text, !!a.runId, a.rating ?? null])).toEqual([
      ["Hey Robin.", true, -1],
      ["Any time.", true, null],
    ]);
  });
});
