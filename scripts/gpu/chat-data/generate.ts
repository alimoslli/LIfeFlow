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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
// Owner's decision of 2026-11-26: the prompt says whether the skyling may book on its own or offers first, and the examples
// show both. With --modes, two lives in three are "on" and one in three is "off"; the translator writes the line into the prompt.
const MODES = argv.includes("--modes");
const OFFER_NEXT = ["yes please", "ok do that", "sure, go ahead", "yeah do it", "not right now", "no thanks"];
const OFFERED_WHEN_OFF = new Set(["behind", "plan", "breakdown"]);
// Longer chats (owner, 2026-11-27, item 8: "every example is one or two turns today"). This share of chats goes on for 3 to 5
// messages. Every message after the first is picked from what the skyling REALLY did in the turn before (messages/after.json,
// the same table the bank builder uses): an offer gets a yes or a no, a saved block gets "make it an hour later" or "undo it",
// a question gets an answer, and now and then the person moves on to something else from the bank, or says thanks.
const LONG_SHARE = Number(arg("long-share", "0.33"));
const AFTER = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "messages", "after.json"), "utf8")) as Record<string, string[] | string>;
const lines = (kind: string) => (Array.isArray(AFTER[kind]) ? (AFTER[kind] as string[]) : []);
const WRITES = /^(create|make|save|update|set|add|log|resolve|delete|remove|contribute|shift|schedule|complete|mark|import|cancel)_/;
const OFFERS = /\b(want me to|should i|shall i|i can (block|add|put|save|set|book|move|draft)|would you like me to|do you want me to)\b[^?]*\?\s*$/i;

/** What the skyling did in a turn, from the tools that ran and the answer it gave: the key of the follow-up table. */
export function didWhat(tools: { name: string; ok: boolean }[], answer: string): string {
  const ran = tools.filter((t) => t.ok).map((t) => t.name);
  if (ran.some((n) => n === "undo_last" || n.startsWith("delete_") || n === "cancel_promise" || n === "forget_memory")) return "undone";
  if (ran.includes("make_promise")) return "promised";
  if (ran.includes("save_memory") || ran.includes("update_memory")) return "remembered";
  if (ran.some((n) => n.startsWith("draft_"))) return "drafted";
  if (ran.some((n) => WRITES.test(n))) return "made";
  const a = answer.trim();
  if (OFFERS.test(a)) return "offered";
  if (/^(i can'?t|i won'?t|that'?s not something i)/i.test(a)) return "declined";
  if (/\?\s*$/.test(a)) return "asked";
  return "talked";
}

type Q = {
  text: string;
  skill?: string;
  source: string;
  followUp?: string;
  family?: string;
  needs?: string[];
  hours?: [number, number] | null;
  /** A skill only the latest main has (the bank builder's tag): skipped until this branch is rebased. */
  needsSkill?: string;
};

/** Does this message fit this made-up life right now? A message says which traits the life must have ("student", "job",
 * "money") and at which hours of the day a person would type it (2026-11-25: "I woke up feeling awful" was asked at a
 * made-up 9:20 PM and a retired widow said "tell my boss I can't come in"; the readers dropped what came of it). */
export function fits(q: Q, traits: Set<string>, hour: number): boolean {
  if (q.needsSkill) return false;
  if ((q.needs ?? []).some((n) => !traits.has(n))) return false;
  if (!q.hours) return true;
  const [from, to] = q.hours;
  return (hour >= from && hour < to) || (hour + 24 >= from && hour + 24 < to);
}

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
  let mode = "";
  const provider = new OpenAIProvider({
    apiKey: "not-a-real-key",
    model: MODEL,
    reasoningEffort: "auto",
    baseURL: BASE,
    fetch: (input, init) =>
      fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), "X-Conv-Id": convId, ...(mode && { "X-Mode": mode }) } }),
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
    const c = loaded.counts;
    const traits = new Set<string>([
      ...((c.courses ?? 0) > 0 ? ["student"] : []),
      ...((c.jobs ?? 0) > 0 || (c.shifts ?? 0) > 0 ? ["job"] : []),
      ...((c.accounts ?? 0) > 0 ? ["money"] : []),
    ]);
    const hour = Number(loaded.nowLocal.slice(11, 13));
    mode = MODES ? (allLives.indexOf(life) % 3 === 2 ? "off" : "on") : "";
    const used = new Set<number>();
    for (let k = 0; k < PER_LIFE; k++) {
      // from this life's own starting point, the first message that fits the life and the hour and that it has not had yet
      let at = ((base + k + OFFSET) * 7919) % questions.length;
      for (let tries = 0; tries < questions.length && (used.has(at) || !fits(questions[at], traits, hour)); tries++) at = (at + 1) % questions.length;
      used.add(at);
      let q = questions[at];
      // With acting on its own off, a good first answer to "I'm so behind" is an offer, so most of these chats go on with a
      // yes or a no: that second turn is where the booking (or the stopping) is learned.
      if (mode === "off" && OFFERED_WHEN_OFF.has(q.family ?? "") && (base + k) % 5 < 3) q = { ...q, followUp: OFFER_NEXT[(base + k) % OFFER_NEXT.length] };
      // The testing allowance (30 messages a day, ADR 0035) would end a long run; this is a throwaway test database.
      await withUser(loaded.session.id, (s) => s.tx.execute(sql`delete from ai_budgets where key like ${`u:${loaded.session.id}:%`}`));
      let conversationId: string | null = null;
      const turns: { text: string; answer: string; outcome: string; ms: number; did?: string; nextFrom?: string; error?: string }[] = [];
      // the same pick every run for the same life and slot, so a rerun asks the same chats
      const pick = (xs: string[], salt: number) => xs[(((base + k + OFFSET) * 31 + salt * 17) >>> 0) % xs.length];
      const long = LONG_SHARE > 0 && (((base + k + OFFSET) * 2654435761) >>> 0) % 1000 < LONG_SHARE * 1000;
      const length = long ? 3 + ((base + k + OFFSET) % 3) : q.followUp ? 2 : 1;
      let text = q.text;
      for (let t = 0; t < length; t++) {
        convId = `${life}~${k}~${t}`;
        let answer = "";
        const ran: { name: string; ok: boolean }[] = [];
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
              else if (e.type === "tool_end") ran.push({ name: e.name, ok: e.ok });
              else if (e.type === "error") error = e.message;
            },
          });
          conversationId = r.conversationId;
        } catch (e) {
          error = `threw: ${(e as Error).message}`.slice(0, 300);
        }
        const did = didWhat(ran, answer);
        turns.push({ text, answer: answer.trim(), outcome: error ? "error" : "ok", ms: Date.now() - t0, did, ...(error && { error }) });
        if (error || t === length - 1) break;
        // What they say next. A short chat keeps the line its author wrote (or the yes/no above). A long one follows what
        // really happened: the last message is often a thanks, the third now and then moves on to another thing from the bank.
        let next = !long ? q.followUp : undefined;
        let why = "written";
        if (long) {
          const lastOne = t === length - 2;
          if (lastOne && (base + k) % 3 === 0) [next, why] = [pick(lines("closer"), t), "closer"];
          else if (t === 1 && (base + k) % 4 === 1) {
            let at2 = ((base + k + OFFSET + 1) * 104729) % questions.length;
            for (let tries = 0; tries < questions.length && (used.has(at2) || !fits(questions[at2], traits, hour)); tries++) at2 = (at2 + 1) % questions.length;
            used.add(at2);
            [next, why] = [questions[at2].text, "moved on"];
          } else {
            const kind = did === "offered" ? (mode === "off" || (base + k + t) % 3 !== 0 ? "yes" : "no") : did;
            [next, why] = [pick(lines(kind).length ? lines(kind) : lines("talked"), t), kind];
          }
        }
        if (!next) break;
        turns[turns.length - 1].nextFrom = why;
        text = next;
      }
      appendFileSync(
        OUT,
        JSON.stringify({
          life,
          k,
          conv: `${life}~${k}`,
          question: q,
          persona: loaded.persona.id,
          nowLocal: loaded.nowLocal,
          tz: loaded.tz,
          traits: [...traits],
          ...(mode && { mode }),
          ...(long && { long: true }),
          turns,
        }) + "\n",
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
