import { afterAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { jarvisRuns } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn, TOOK_TOO_LONG, type JarvisEvent } from "@/server/jarvis/agent";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

// A tool that never comes back must not hold the turn past its deadline.
vi.mock("@/server/jarvis/executor", async (orig) => {
  const real = await orig<typeof import("@/server/jarvis/executor")>();
  return { ...real, executeToolCall: () => new Promise(() => undefined) };
});

afterAll(closeDb);

describe("the deadline covers a running tool", () => {
  it("closes the turn with a calm saved line and a timeout run", async () => {
    const u = await makeUser("Hung Tool");
    const me: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
    const events: JarvisEvent[] = [];
    const provider = new ScriptedProvider(({ step }) =>
      step === 0 ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "x" }] } }] } : { text: "never" },
    );
    const t0 = Date.now();
    const { conversationId } = await runJarvisTurn({ user: me, text: "add a task", provider, emit: (e) => events.push(e), deadlineMs: 400 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(events.some((e) => e.type === "error" && e.message === TOOK_TOO_LONG)).toBe(true);
    const [run] = await withUser(me.id, (s) =>
      s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.conversationId, conversationId)).orderBy(desc(jarvisRuns.createdAt)),
    );
    expect(run.errorKind).toBe("timeout");
  });
});
