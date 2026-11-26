import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports } from "@/server/db/schema";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { firstFrameInSrc, turnFailureReport } from "@/server/jarvis/turn-error";
import type { ChatItem, ModelProvider, ModelTurn } from "@/server/jarvis/providers/types";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

/** A provider whose step throws what we give it (a code exception, not an HTTP status). */
const throwing = (make: () => unknown): ModelProvider => ({
  name: "scripted",
  model: "scripted",
  startTurn({ history }: { history: ChatItem[] }): ModelTurn {
    void history;
    return {
      async *step() {
        throw make();
      },
    };
  },
});

async function person(name: string) {
  const u = await makeUser(name);
  return { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" } as SessionUser;
}

describe("a turn that fails with a code exception reaches HQ's error feed", () => {
  it("records the class, the scrubbed message and the first frame in src, never the person's words", async () => {
    const me = await person("Erin Report");
    const events: JarvisEvent[] = [];
    const boom = () => {
      const e = new TypeError('invalid input syntax for type uuid: "my business presentation is due dec 1st"');
      e.stack = `TypeError: x\n    at node:internal/foo (node:internal/foo:1:1)\n    at fn (/app/src/server/jarvis/tools/example.ts:42:7)\n    at other (/app/src/server/other.ts:1:1)`;
      return e;
    };
    await runJarvisTurn({
      user: me,
      text: "remember that my business presentation is due dec 1st",
      provider: throwing(boom),
      emit: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === "error")).toBe(true);
    const rows = await getDb().select().from(errorReports).where(like(errorReports.route, "jarvis.turn.%"));
    const row = rows.find((r) => r.message.startsWith("TypeError"))!;
    expect(row.source).toBe("server");
    expect(row.route).toBe("jarvis.turn.internal");
    expect(row.message).toContain("TypeError");
    expect(row.message).toContain("src/server/jarvis/tools/example.ts:42:7");
    expect(row.message).not.toMatch(/business|presentation|dec 1st/i);
  });

  it("one kind groups into one row that counts up", async () => {
    const me = await person("Gil Group");
    const fail = () => new RangeError("stream broke");
    const countOf = async () =>
      (await getDb().select().from(errorReports).where(eq(errorReports.route, "jarvis.turn.internal"))).find((r) =>
        r.message.startsWith("RangeError: stream broke"),
      )?.count ?? 0;
    const before = await countOf();
    for (let i = 0; i < 2; i++) await runJarvisTurn({ user: me, text: `hello ${i}`, provider: throwing(fail), emit: () => {} });
    expect((await countOf()) - before).toBe(2);
  });
});

describe("turnFailureReport", () => {
  it("cuts quoted values and a query's parameters", () => {
    const e = new Error('Failed query: insert into "memories" values ($1) params: my private words');
    expect(turnFailureReport(e).message).not.toMatch(/private|memories/);
  });
  it("finds the first frame in our code, and none when there is none", () => {
    const e = new Error("x");
    e.stack = "Error: x\n    at a (/app/node_modules/zod/index.js:1:1)\n    at b (/app/src/lib/dates.ts:9:3)";
    expect(firstFrameInSrc(e)).toBe("src/lib/dates.ts:9:3");
    e.stack = "Error: x\n    at a (node:internal/x:1:1)";
    expect(firstFrameInSrc(e)).toBeNull();
  });
});
