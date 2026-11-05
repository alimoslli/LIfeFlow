import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { conversations, messages, users } from "@/server/db/schema";
import { makeUser } from "../helpers";

afterAll(closeDb);

/**
 * The one-off cleanup in drizzle/0035 (audit 2026-11-05, A1 and A9). It runs once on deploy;
 * here it runs against fixture rows, twice, the way the migrator would (one transaction).
 */
const MIGRATION = "drizzle/0035_assistant_name_cleanup.sql";

async function runCleanup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const stmt of readFileSync(MIGRATION, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.query(stmt);
    await client.query("commit");
    // Nothing set for the cleanup leaks past it.
    expect((await client.query("select current_setting('app.user_id', true) as v")).rows[0].v ?? "").toBe("");
  } finally {
    client.release();
    await pool.end();
  }
}

const OLD = {
  auth: "Jarvis couldn't authenticate with OpenAI. Check OPENAI_API_KEY on the server.",
  quota: "OpenAI is rate-limiting requests or the account is out of quota. Try again shortly.",
  model: "The configured OpenAI model wasn't found. Check OPENAI_MODEL.",
  down: "OpenAI is having trouble right now. Please try again.",
  network: "Jarvis couldn't reach the AI service (network error). Nothing further was changed.",
  unknown: "Something went wrong while Jarvis was responding. Any actions already reported as completed were saved.",
  unknownRaw:
    "Something went wrong while Jarvis was responding: 400 Invalid 'input[3].content': string too long. Any actions already reported as completed were saved.",
};
const NEW = {
  auth: "Your assistant isn't available right now. Try again later.",
  quota: "Your assistant is busy right now. Try again in a minute.",
  model: "Your assistant isn't available right now. Try again later.",
  down: "Your assistant isn't available right now. Try again in a minute.",
  network: "Your assistant couldn't get through just now. Try again in a minute. Nothing else was changed.",
  unknown: "Something went wrong while your assistant was answering. Try again. Anything already shown as done was saved.",
  unknownRaw: "Something went wrong while your assistant was answering. Try again. Anything already shown as done was saved.",
};

async function setName(id: string, name: string | undefined) {
  const [u] = await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id));
  await getDb()
    .update(users)
    .set({ preferences: { ...u.p, assistantName: name } })
    .where(eq(users.id, id));
}
const nameOf = async (id: string) => (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p.assistantName;

describe("one-off cleanup of the old default name and old error texts", () => {
  it("clears a saved name of exactly 'Jarvis' and leaves every other name alone", async () => {
    const jarvis = await makeUser("Ana");
    const dev = await makeUser("Ben");
    const none = await makeUser("Cy");
    const padded = await makeUser("Di");
    const lower = await makeUser("Ed");
    await setName(jarvis.user.id, "Jarvis");
    await setName(dev.user.id, "Dev");
    await setName(padded.user.id, " Jarvis ");
    await setName(lower.user.id, "jarvis");
    await runCleanup();
    await runCleanup(); // safe to repeat
    expect(await nameOf(jarvis.user.id)).toBeUndefined();
    expect(await nameOf(padded.user.id)).toBeUndefined();
    expect(await nameOf(dev.user.id)).toBe("Dev");
    expect(await nameOf(none.user.id)).toBeUndefined();
    expect(await nameOf(lower.user.id)).toBe("jarvis"); // case-sensitive: only the exact old default
    // The rest of their preferences is untouched.
    const [p] = await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, jarvis.user.id));
    expect(p.p.aiConsentAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rewrites only the old generated error replies and voice titles, never what people wrote", async () => {
    const { run } = await makeUser("Fay");
    const named = await makeUser("Gus");
    await setName(named.user.id, "Dev");

    const ids = await run(async (s) => {
      const [chat] = await s.tx.insert(conversations).values({ userId: s.userId, title: "help me plan friday" }).returning();
      const errs: Record<string, string> = {};
      for (const [k, content] of Object.entries(OLD)) {
        const [m] = await s.tx.insert(messages).values({ userId: s.userId, conversationId: chat.id, role: "assistant", content, status: "error" }).returning();
        errs[k] = m.id;
      }
      // The same words written by the user, or in a normal reply, are theirs and stay.
      const [typed] = await s.tx.insert(messages).values({ userId: s.userId, conversationId: chat.id, role: "user", content: OLD.auth }).returning();
      const [reply] = await s.tx.insert(messages).values({ userId: s.userId, conversationId: chat.id, role: "assistant", content: OLD.down }).returning();
      const [search] = await s.tx
        .insert(messages)
        .values({
          userId: s.userId,
          conversationId: chat.id,
          role: "tool",
          toolName: "web_search",
          toolResult: { ok: true, data: { unavailable: "The web search failed: 401 Incorrect API key provided: sk-proj-abc." } },
        })
        .returning();
      const [voice] = await s.tx.insert(conversations).values({ userId: s.userId, title: "Talking with Jarvis" }).returning();
      const [voiceOld] = await s.tx.insert(conversations).values({ userId: s.userId, title: "Voice chat with Jarvis" }).returning();
      // A chat titled from what the user typed keeps its title, even if it reads the same.
      const [typedTitle] = await s.tx.insert(conversations).values({ userId: s.userId, title: "Talking with Jarvis" }).returning();
      await s.tx.insert(messages).values({ userId: s.userId, conversationId: typedTitle.id, role: "user", content: "Talking with Jarvis" });
      return { chat: chat.id, errs, typed: typed.id, reply: reply.id, search: search.id, voice: voice.id, voiceOld: voiceOld.id, typedTitle: typedTitle.id };
    });
    const devVoice = await named.run(async (s) => {
      const [c] = await s.tx.insert(conversations).values({ userId: s.userId, title: "Talking with Jarvis" }).returning();
      return c.id;
    });

    await runCleanup();
    await runCleanup();

    const rows = await run(async (s) => s.tx.select().from(messages).where(eq(messages.conversationId, ids.chat)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const k of Object.keys(OLD) as (keyof typeof OLD)[]) expect(byId.get(ids.errs[k])?.content, k).toBe(NEW[k]);
    expect(byId.get(ids.typed)?.content).toBe(OLD.auth);
    expect(byId.get(ids.reply)?.content).toBe(OLD.down);
    expect(byId.get(ids.search)?.toolResult).toEqual({ ok: true, data: { unavailable: "Live web search isn't available right now." } });

    const titles = new Map((await run((s) => s.tx.select().from(conversations))).map((c) => [c.id, c.title]));
    expect(titles.get(ids.voice)).toBe("Talking with your assistant");
    expect(titles.get(ids.voiceOld)).toBe("Talking with your assistant");
    expect(titles.get(ids.typedTitle)).toBe("Talking with Jarvis");
    expect(titles.get(ids.chat)).toBe("help me plan friday");
    // Someone who named their assistant gets its name in the title.
    expect((await named.run((s) => s.tx.select().from(conversations).where(eq(conversations.id, devVoice))))[0].title).toBe("Talking with Dev");
    // Nothing was left behind with the old wording.
    expect(JSON.stringify(rows.filter((r) => r.role !== "user"))).not.toMatch(/OPENAI_|Jarvis was responding|web search failed/);
  });
});
