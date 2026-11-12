/**
 * The one small real-model run of Step 0 (docs/backlog/2026-11-12-local-models.md; owner via the COO, 2026-11-12: yes to
 * "about 12 calls to the small model", once, with the development key): today's paid purchase sorting (`openAiTidy`, the
 * app's own path: the usage gate, one `ai_usage` row per call) on the labelled purchases our keywords leave unknown, in the
 * app's batches of 40. Stops at 12 calls whatever happens. Made-up data only, on the test database's throwaway account.
 *   DATABASE_URL=<the test database> npx tsx --conditions=react-server --env-file=.env scripts/local-models/tidy-ai-run.mts --owner-approved
 * Writes docs/backlog/2026-11-12-local-models-ai-run.json: each call's tokens, what it filed, and the score.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client";
import { aiUsage, users } from "../../src/server/db/schema";
import { withUser } from "../../src/server/db/with-user";
import { keywordCategory } from "../../src/server/services/finance/categorize";
import { DEFAULT_CATEGORIES } from "../../src/server/services/finance/categories";
import { openAiTidy } from "../../src/server/services/finance/tidy";
import { makeUser } from "../../tests/helpers";

// --usage-only reads the last run's usage rows again and calls nothing
const usageOnly = process.argv.includes("--usage-only");
if (!usageOnly && !process.argv.includes("--owner-approved"))
  throw new Error("This run calls the paid model. It needs --owner-approved (the owner's yes, once).");
const MAX_CALLS = 12;
const BATCH = 40;
// on the test database only: the throwaway account and its usage rows never touch a real one
if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
  throw new Error("Run it on the test database: DATABASE_URL=$TEST_DATABASE_URL.");

type P = { id: string; description: string; merchant: string | null; amountCents: number; label: string; accept: string[] };
const purchases = JSON.parse(readFileSync("tests/fixtures/purchases-labelled.json", "utf8")) as P[];
const names = DEFAULT_CATEGORIES.filter((c) => c.kind === "expense").flatMap((c) => [c.name, ...(c.children ?? [])]);
const unknown = purchases
  .map((p, i) => ({ p, i }))
  .filter(({ p }) => !keywordCategory({ merchantName: p.merchant, description: p.description }, p.amountCents));

const NAME = "Local models eval";
// each call's own record, read as that account (row-level security hides it from anyone else)
const usageOf = (userId: string) =>
  withUser(userId, (s) =>
    s.tx
      .select({
        model: aiUsage.model,
        state: aiUsage.state,
        input: aiUsage.inputTokens,
        cached: aiUsage.cachedInputTokens,
        output: aiUsage.outputTokens,
        reasoning: aiUsage.reasoningTokens,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId)),
  );
const total = (rows: Awaited<ReturnType<typeof usageOf>>) =>
  rows.reduce(
    (t, u) => ({
      input: t.input + (u.input ?? 0),
      cached: t.cached + (u.cached ?? 0),
      output: t.output + (u.output ?? 0),
      reasoning: t.reasoning + (u.reasoning ?? 0),
    }),
    { input: 0, cached: 0, output: 0, reasoning: 0 },
  );
const OUT = "docs/backlog/2026-11-12-local-models-ai-run.json";
if (usageOnly) {
  const [last] = await getDb().select({ id: users.id }).from(users).where(eq(users.name, NAME)).orderBy(desc(users.createdAt)).limit(1);
  const rows = await usageOf(last.id);
  const r = JSON.parse(readFileSync(OUT, "utf8"));
  Object.assign(r, { model: rows[0]?.model ?? null, usage: rows, tokens: total(rows) });
  writeFileSync(OUT, `${JSON.stringify(r, null, 1)}\n`);
  console.log(JSON.stringify({ model: r.model, calls: rows.length, tokens: r.tokens }));
  process.exit(0);
}
const { user } = await makeUser(NAME);
const llm = openAiTidy({ userId: user.id, door: "tidy_button" });
if (!llm) throw new Error("No model key in the settings: nothing was called.");

const guesses = new Map<number, string | null>();
const calls: { batch: number; items: number; ms: number; ok: boolean }[] = [];
for (let b = 0; b * BATCH < unknown.length && calls.length < MAX_CALLS; b++) {
  const part = unknown.slice(b * BATCH, (b + 1) * BATCH);
  const t = performance.now();
  try {
    const out = await llm(
      part.map(({ p, i }) => ({ key: String(i), text: p.merchant ? `${p.merchant} ${p.description}` : p.description, spent: true })),
      names,
    );
    for (const g of out) guesses.set(Number(g.key), g.category);
    calls.push({ batch: b, items: part.length, ms: Math.round(performance.now() - t), ok: true });
  } catch (e) {
    calls.push({ batch: b, items: part.length, ms: Math.round(performance.now() - t), ok: false });
    console.error("call failed", e instanceof Error ? e.name : typeof e);
  }
}
const usage = await usageOf(user.id);

let right = 0,
  wrong = 0,
  none = 0;
const wrongs: string[] = [];
for (const { p, i } of unknown) {
  const g = guesses.get(i) ?? null;
  if (!g) none++;
  else if (p.accept.includes(g)) right++;
  else {
    wrong++;
    wrongs.push(`${p.description} → ${g} (is ${p.label})`);
  }
}
const result = {
  when: new Date().toISOString(),
  model: usage[0]?.model ?? null,
  calls,
  usage,
  tokens: total(usage),
  unknown: unknown.length,
  score: { right, wrong, unsorted: none, accuracy: Math.round((right / unknown.length) * 1000) / 1000 },
  guesses: Object.fromEntries(unknown.map(({ i }) => [purchases[i].id, guesses.get(i) ?? null])),
  wrongs,
};
writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ model: result.model, calls: calls.length, tokens: result.tokens, score: result.score }, null, 1));
process.exit(0);
