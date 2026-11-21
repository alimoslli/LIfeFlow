/**
 * Training examples for our own skyling model (ADR 0023 level 2), made on a rented GPU from made-up lives only.
 *
 * For each simulated life (see make_lives.py) it loads the life through the app's services (load-life.ts), then asks the
 * skyling a few student questions through the REAL loop (runJarvisTurn: the same prompt, skills, tool groups and tools),
 * answered by a teacher model served by vLLM behind scripts/gpu/chat-eval/responses_shim.py. Each model request carries
 * an X-Conv-Id header; the shim (with --dump) writes the exact chat messages and the teacher's reply, so the examples are
 * what a student model will see. This script writes one metadata line per question; filter.py joins and filters them.
 *
 *   node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts \
 *     --lives /workspace/chatdata/lives --questions /workspace/chatdata/questions.json --per-life 6 \
 *     --worker 0 --workers 8 --out /workspace/chatdata/meta-0.jsonl
 *
 * Needs TEST_DATABASE_URL pointing at a throwaway *_test database. Never a real one.
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const LIVES = arg("lives")!;
const QUESTIONS = arg("questions")!;
const PER_LIFE = Number(arg("per-life", "6"));
/** Shifts which questions are asked, so a later run (a holdout check, a second batch) asks ones no earlier run did. */
const OFFSET = Number(arg("offset", "0"));
const WORKER = Number(arg("worker", "0"));
const WORKERS = Number(arg("workers", "1"));
const OUT = arg("out")!;
const BASE = arg("base-url", "http://127.0.0.1:8100/v1")!;
const MODEL = arg("model", "teacher")!;

type Q = { text: string; skill?: string; source: string; followUp?: string };

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test/.test(url)) throw new Error("TEST_DATABASE_URL must be a *_test database");
  process.env.DATABASE_URL = url;
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

  const [{ loadLife }, { runJarvisTurn }, { OpenAIProvider }, { closeDb }, { withUser }, { sql }] = await Promise.all([
    import("./load-life"),
    import("../../../src/server/jarvis/agent"),
    import("../../../src/server/jarvis/providers/openai"),
    import("../../../src/server/db/client"),
    import("../../../src/server/db/with-user"),
    import("drizzle-orm"),
  ]);

  const questions = JSON.parse(readFileSync(QUESTIONS, "utf8")) as Q[];
  const allLives = readdirSync(LIVES)
    .filter((d) => !d.startsWith("."))
    .sort();
  const lives = allLives.filter((_, i) => i % WORKERS === WORKER);
  let convId = "";
  const provider = new OpenAIProvider({
    apiKey: "not-a-real-key",
    model: MODEL,
    reasoningEffort: "auto",
    baseURL: BASE,
    fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), "X-Conv-Id": convId } }),
  });

  for (const life of lives) {
    const dir = join(LIVES, life);
    let loaded;
    try {
      loaded = await loadLife(dir);
    } catch (e) {
      appendFileSync(OUT, JSON.stringify({ life, error: `load: ${(e as Error).message}`.slice(0, 300) }) + "\n");
      continue;
    }
    // Spread the bank evenly: each (life, k) takes its own question, stepping by a prime through the whole bank, so every
    // skill is asked (a seeded random per life clustered on 6 of 37 skills, 2026-11-21) and no life gets a question twice.
    const base = allLives.indexOf(life) * PER_LIFE;
    for (let k = 0; k < PER_LIFE; k++) {
      const q = questions[((base + k + OFFSET) * 7919) % questions.length];
      // The testing allowance (30 messages a day, ADR 0035) would end a long run; this is a throwaway test database.
      await withUser(loaded.session.id, (s) => s.tx.execute(sql`delete from ai_budgets where key like ${`u:${loaded.session.id}:%`}`));
      let conversationId: string | null = null;
      const turns: { text: string; answer: string; outcome: string; ms: number; error?: string }[] = [];
      for (const [t, text] of [q.text, ...(q.followUp ? [q.followUp] : [])].entries()) {
        convId = `${life}~${k}~${t}`;
        let answer = "";
        const t0 = Date.now();
        let error: string | undefined;
        try {
          const r = await runJarvisTurn({
            user: loaded.session,
            conversationId,
            text,
            provider,
            now: loaded.now,
            emit: (e) => {
              if (e.type === "text") answer += e.delta;
              else if (e.type === "error") error = e.message;
            },
          });
          conversationId = r.conversationId;
        } catch (e) {
          error = `threw: ${(e as Error).message}`.slice(0, 300);
        }
        turns.push({ text, answer: answer.trim(), outcome: error ? "error" : "ok", ms: Date.now() - t0, ...(error && { error }) });
        if (error) break;
      }
      appendFileSync(
        OUT,
        JSON.stringify({ life, k, conv: `${life}~${k}`, question: q, persona: loaded.persona.id, nowLocal: loaded.nowLocal, tz: loaded.tz, turns }) + "\n",
      );
    }
    console.log(`[w${WORKER}] ${life} done`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
