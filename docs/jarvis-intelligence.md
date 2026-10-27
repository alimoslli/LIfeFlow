# Jarvis intelligence: architecture, gaps and roadmap

Jarvis gets better through **personal memory, user feedback, better tools, and measured changes to prompts, retrieval and workflows**. It does **not** train or fine-tune the AI model. The model is a configurable, stateless service (OpenAI by default). Everything Jarvis "learns" is stored as data in the user's own rows, where the user can review, correct and delete it.

Status legend: ✅ built and verified by tests · 🟡 partly built · ⬜ not started

---

## 1. What already existed (inspected 2026-10-27)

| Area | Where | What it does |
|---|---|---|
| Auth | `src/server/auth/*`, `services/accounts.ts` | scrypt passwords, SHA-256-hashed session tokens (`bf_session` cookie), Postgres-backed rate limits, same-origin checks on APIs, audit log |
| Data isolation | `db/schema.ts` (`ownerPolicy`), `drizzle/0001_force_rls.sql`, `db/with-user.ts` | Every user table has an RLS policy keyed on `app.user_id`, set per transaction by `withUser`. RLS is FORCED. Services also filter by `user_id` |
| Agent loop | `jarvis/agent.ts` | One turn = persist user message → build system prompt → up to 8 model/tool steps → persist every tool call and result → stream NDJSON events |
| Tools | `jarvis/tools/*`, `registry.ts`, `executor.ts` | 48 tools over the same services the UI uses. zod-validated args, `mutates` → audit entry, `confirm` → `pending_actions` row and a Confirm/Cancel card. Results come back as `{ok, data | error}` |
| Provider | `jarvis/providers/*` | Provider-neutral `ModelProvider`. OpenAI Responses API with streaming and `store:false`. Model, reasoning effort and base URL come from env. `ScriptedProvider` for tests |
| Memory | `services/memory.ts`, `tools/knowledge.ts`, Settings → Jarvis & memory | `memories` (content, category, source, active/archived, expiry, lastUsedAt). Secret/PII detection. Exact-text dedupe |
| Conversations | `jarvis/conversations.ts` | Full history in Postgres; the last 80 rows are replayed each turn |
| Tests | `tests/integration/jarvis.test.ts`, `tests/e2e/*` | Tool loop, confirmation gate, cross-user attacks, invalid calls, secret refusal, provider failure; e2e against a fake OpenAI wire server |

## 2. Gaps against the requirements

| Requirement | Gap found |
|---|---|
| **1 Memory: user-approved** | Jarvis wrote memories directly (`save_memory` → active) with no user approval. A prompt-injected note or email could make it "remember" something |
| **1 Memory: relevance** | Every active memory (up to 100) went into every prompt, whether or not it was relevant |
| **1 Memory: facts vs assumptions** | No field separated what the user said from what Jarvis inferred; no confirmation timestamp |
| **1 Memory: correction** | No update tool. Correcting meant forget + save, with no history. Forget was a hard delete |
| **2 Feedback** | Nothing: no ratings, no corrections, no error categories, no learned rules |
| **3 Actions** | Good base, but gaps: no transaction recategorization tool, no edit/delete for budgets, goals, bills, shifts or courses, no day/week planning. Only deletions require confirmation; bulk changes don't |
| **4 Measurement** | No per-turn record of latency, tokens, cost, tool success or outcome. No eval suite. The prompt isn't versioned, so changes can't be compared |
| **4 Experiments** | One prompt in production, with no way to try a variant safely |
| **5 Privacy** | No conversation-retention setting and no consent model for using feedback. **Production uses Neon's `neondb_owner` role, which has BYPASSRLS**, so in production isolation relies on the app-level `user_id` filters alone (the migrate script warns about this) |
| **6 Maintainability** | The prompt mixes dynamic text (time) near the top, which defeats provider prompt caching. Provider usage (tokens) is discarded |

## 3. Roadmap

Ordering principle: make memory trustworthy and **measure before changing behaviour**, so each later phase can show its effect in numbers.

### Phase 1: Memory you control + measurement baseline ✅ (2026-10-27)
Verified by:
- `tests/integration/memory.test.ts`: approval, explicit requests, dismissals, duplicates, the suggestions toggle, the pending cap, corrections, archive and restore, expiry, secrets, note injection, cross-user attempts.
- `tests/unit/memory.test.ts`: explicit-request detection, similarity.
- `tests/unit/memory-retrieval.test.ts`: the labelled set; recall 100%, nothing forbidden sent.
- `tests/integration/jarvis-metrics.test.ts` and `tests/unit/metrics.test.ts`.
- `tests/e2e/memory.spec.ts`.

Not yet verified against the real OpenAI API: this workspace can't reach it. The first live check is in Phase 3.

1. **Turn telemetry** (`jarvis_runs`): latency, time to first token, steps, tool calls, tool errors, confirmations, input/cached/output/reasoning tokens, estimated cost (only when prices are configured), outcome, model, prompt version, and which memories were used.
2. **Memory v2**: Jarvis *proposes*; the user approves with one tap. The only exception is when the user's own message explicitly asks it to remember, which the server checks rather than trusting the model. Each memory carries a basis (`stated` or `inferred`) and `confirmedAt`. Corrections keep history (`supersedesId`). Forgetting archives the memory so it can be restored. Dismissed suggestions are not re-proposed. A new `instruction` category holds how-to-behave rules. Users can turn suggestions off.
3. **Relevance retrieval**: only memories relevant to the request are sent, chosen by lexical scoring over the request plus recent turns, intent → category boosts and module context. Standing instructions are always sent. The memories used are recorded per run.
4. **Prompt restructure**: static instructions first and dynamic context last (cache-friendly), a fact-vs-assumption rule, and a versioned prompt (`PROMPT_VERSION`).
5. **UI**: memory suggestion cards in chat (Keep / Not now). Settings shows suggestions waiting for approval, edit, history, the suggestion toggle, and personal Jarvis stats (requests, speed, tool success).

### Phase 2: Feedback and learning
- 👍/👎 on every answer. "What went wrong?" offers wrong numbers, wrong action, didn't do it, misunderstood, forgot context, too long or short, tone, and other, plus an optional correction.
- `jarvis_feedback`: message, run, task type (derived from the tools used), error category, correction, whether the correction was confirmed, and consent to share for improvement (default off).
- A correction becomes a proposed memory or instruction, never automatically. A repeated-correction detector (≥2 similar in 30 days) proposes a rule. Settings gets "Learned from your feedback" with disable and remove.
- Metrics: correction rate and 👎 rate per task type and prompt version.

### Phase 3: Evaluation suite and safe experiments
- `tests/evals/`: about 30 representative tasks across finance analysis, categorization, budgeting, scheduling, school, tasks, memory and safety (prompt injection, false success). Graders check tool calls, resulting DB state, numbers in the answer, and that no unconfirmed success is claimed.
- Two runners. A deterministic one in CI (regression of tools and graders), and a live one against the real model when `OPENAI_API_KEY` is available. Each report covers accuracy, tool success, completion, latency, tokens and cost.
- Prompt and workflow variants registry. Production is pinned to `stable`. Candidates run only in evals, or on non-production deployments by explicit env. A candidate is promoted only if it scores ≥ stable on the suite.
- An anonymized aggregate report over consenting users: counts by category, task type and prompt version, with no content.

### Phase 4: More capable actions
- Transaction recategorization: single; bulk with confirmation; "always categorize X as Y" rules. Edit for budgets, goals, bills, shifts and courses. `plan_my_day` / `plan_week` (free slots → study blocks). Bulk reschedule.
- Consequential-action policy: confirm deletions, bulk changes (≥5 records), and anything that leaves LifeFlow (email send). Standard post-write verification in the executor.

### Phase 5: Context and continuity
- A life snapshot in the prompt (today, the week, money basics, deadlines), conversation summaries, the drawer resuming recent chats, token-based history trimming, effort routing by task type, web search, and PDF input.

### Phase 6: Privacy and operations
- Conversation retention (30/90/365 days/forever). The feedback-sharing consent toggle. A training-data statement: LifeFlow does not train models on user data; provider data use follows the provider's API terms, which should be checked when the provider changes.
- **Production DB role without BYPASSRLS** (needs a one-time step in Neon and Vercel). Export includes feedback and metrics.

## 4. Decisions
- ADR 0005: memory approval, basis and retrieval.
- ADR 0006: telemetry and cost accounting.
