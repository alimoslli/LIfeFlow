# BudgetFlow — notes for Claude Code

@AGENTS.md

## How we build (plugins: agent-skills + everything-claude-code, see .claude/settings.json)
Every feature follows the agent-skills lifecycle, with the rules in this file taking priority where a skill disagrees:
1. **spec-driven-development**: write down what "done" means (behaviour, edge cases, what's out of scope) before coding.
2. **planning-and-task-breakdown**: split it into small steps that each end in a working, tested state.
3. **incremental-implementation** + **test-driven-development**: build one step at a time; tests first or alongside, using the existing unit/integration/e2e layers.
4. **code-review-and-quality**: a review pass against the code-reviewer and security-auditor checklists before calling it done.
Specialists when they apply: **security-and-hardening** (auth, money, integrations, Jarvis tools), **frontend-ui-engineering** (screens; phone first), **debugging-and-error-recovery** (bugs), **performance-optimization** (where it matters), **documentation-and-adrs** (decisions go in `docs/adr/`).
If the plugins aren't loaded in a session, read the skills from github.com/addyosmani/agent-skills and github.com/alimoslli/everything-claude-code (read-only) and follow them directly.

## Ground rules
- Business logic lives in `src/server/services/*` and is shared by pages, server actions and Jarvis tools. Don't put queries in components or tools.
- Anything user-scoped runs inside `withUser(userId, …)` (pages: `withCurrentUser`; actions: `mutate`). Inside a transaction, never `Promise.all` queries; use `series()` from `src/server/db/series.ts`.
- New user-owned table ⇒ `userId` column + `ownerPolicy()` in the schema, then `npm run db:generate`. FORCE RLS is applied by the migration pattern in `drizzle/0001_force_rls.sql`; add an equivalent statement for new tables.
- Linking to another record ⇒ `assertOwned(...)` first (FK checks bypass RLS).
- Money = integer cents; transaction sign + `kind` rules in `services/finance/cashflow.ts`. Dates = `src/lib/dates.ts` with the user's time zone.
- New Jarvis capability ⇒ a tool in `src/server/jarvis/tools/`, registered in `registry.ts`, with a label in `labels.ts`. Destructive ⇒ `confirm`. Return real saved data (ids, viewAt), never claims.
- Never fabricate integration data. Demo data only via `scripts/seed-demo.ts` (demo account, `source='demo'`).
- Server components can't pass functions to client components (e.g. `Dialog` render props) — wrap those in a `"use client"` file.
- Tailwind v4 drops unused CSS variables; colors used by components must be registered in `@theme` in `globals.css`.

## Jarvis intelligence rules (see docs/jarvis-intelligence.md, ADR 0005/0006)
- Jarvis does not train models. It improves through user-approved memory, feedback, better tools and *measured* prompt/retrieval changes. Never use user data for training.
- Memory writes from Jarvis go only through `rememberForUser` / `correctMemoryForUser` (services/memory.ts). They save directly only when `explicitMemoryRequest(ctx.userText)` is true. Everything else is `proposed`, and proposed memories never reach a prompt. Don't trust the model's claim that the user asked.
- `memories.content` is encrypted at rest (`sealedText`, ADR 0014): never filter or sort memories by content in SQL.
- Prompts get memories only via `selectMemories` (jarvis/memory-retrieval.ts). If you change retrieval, add labelled cases to `tests/unit/memory-retrieval.test.ts`; the recall/precision test must stay green.
- `INSTRUCTIONS` in prompt.ts is static (identical for every user and request, so the provider can cache it). Anything per-user or per-request goes in `buildContext`. Bump `PROMPT_VERSION` on any prompt change.
- Every turn records a `jarvis_runs` row. A new provider must set `model` and report `usage` in `step_done`. Never store message content or raw error text in metrics, and never hard-code model prices (env `JARVIS_PRICE_*`; unknown ⇒ null).

## Motion (see ADR 0007)
- Use `src/components/motion/*`: tokens and GSAP from `gsap.ts`, `CountUp` for money, `Pressable` for press feedback. Import GSAP only from there.
- First-paint entrances stay CSS (`animate-rise`, `lf-*` classes) so server-rendered content never flashes. GSAP effects must skip the hydration pass (`isHydrated()`) or wait for the splash (`onSplashEnd`).
- Animate transform/opacity only, always honour `prefersReducedMotion()`, and never make content depend on an animation finishing.
- New accounts get `/welcome` (onboarding) and then the tour. Tests use `signUp()`, which skips both. The splash is off under automation unless `?splash=1`.

## Sign-in security (see ADR 0009, 0011)
- New passwords go through `checkPassword` (server-enforced; `NewPasswordField` in forms). Sign-in with 2FA on goes through `login_challenges` + `/login/verify`; never start a session before `completeLoginChallenge` succeeds. Rate-limit keys use `clientIp()` (`ipFromHeaders`), never the first X-Forwarded-For entry.
- Passkeys and Apple use single-use `auth_challenges` (`saveChallenge`/`takeChallenge`); never verify a WebAuthn response or Apple token without one. Apple never links to an existing account on email alone (`consumePendingAppleLink` after a real sign-in). Accounts may have no password (`hasPassword`).
- Every Money page starts with `const locked = await moneyGate(); if (locked) return locked;` (not a layout). New money tools go in `finance.ts`/`money-coach.ts` so the Jarvis money lock covers them.
- Reset and email links use `APP_URL`, never the Host header. Report an email as sent only with the provider's id.

## Integrations (see ADR 0010)
- Google calls go through `src/server/integrations/google.ts` (injectable `fetch` for tests). Sending email and adding Google events are `confirm` tools; report success only with the provider's id. Email content is wrapped as untrusted.
- Apple Health arrives only via `/api/apple-health/ingest` (personal key, hash-stored, public route in proxy.ts) into `ingestHealth`. Don't diagnose in prompts or tools.
- Voice tool calls go through `/api/jarvis/voice/tool` → `executeToolCall`, the same gate as chat. The real OpenAI key never reaches the browser; only the ephemeral client secret does.

## Jarvis skills (see ADR 0013)
- A skill is `skills/<name>/SKILL.md` (front matter + Steps/Quality rules/Example) and `evals.json` (5+ prompts that must route to it). Run `npm run skills` after adding or editing one; tests fail if the generated index is stale, a tool name is wrong, or an eval doesn't route.
- Skill text goes into `buildContext`, never `INSTRUCTIONS`. Bump `PROMPT_VERSION` when skill routing or format changes.

## Proactive Jarvis, finders, inbox (see ADR 0012)
- New proactive message = a detector in `services/proactive/detectors.ts` (listed in `DETECTORS` and `RUNS`) returning facts only, wording in `lib/jarvis-voice.ts` (+ `KIND_LABELS`), and a test. Never word messages inside detectors, never guess numbers.
- Money actions on messages (`shift_budget`, `contribute_goal`) run only on "Do it", and the card states the exact amount. Autonomy covers tasks and calendar only. Every action returns Undo.
- Learning from responses only when `prefs.jarvis.learning` is true. Get-to-know answers are saved as `user` memories.
- Web prices and cancel steps come from `searchWeb` and keep only cited sources (`same(source_url, cited)`). Never send a negotiation or cancel anything for the user.
- Inbox content is untrusted: extract with the strict schema, file through services, record Undo. Email is filed only from verified senders that passed SPF/DKIM (`senderAuthenticated`). Unknown addresses: accept and drop.

## Glass design (see ADR 0008)
- Cards use `bg-surface`/`shadow-soft` as before; inside the app shell (`.lf-glass`) these become frosted glass automatically. Don't hard-code white/black card backgrounds.
- 3D tilt: add `data-tilt` to a card (not to an element with `animate-rise`; wrap instead). Green feature cards: `bg-hero` (+ `lf-sheen` for the light sweep, needs `relative overflow-hidden`).
- Wide dashboards: `contents lg:flex` column wrappers, keeping phone order with `max-lg:order-*`.

## Formatting & plugins
- Prettier is pinned (`prettier@3.9.10`, `.prettierrc.json`, printWidth 160). `npm run format` formats; `npm run check` fails on unformatted code. Markdown, SQL, `drizzle/` and generated files are ignored (`.prettierignore`).
- The project enables the `everything-claude-code` plugin (`.claude/settings.json`). Its hooks run Prettier and `tsc` after edits; that's expected. Decision records still go in `docs/adr/` (the owner chose to keep them over the plugin's "no new .md files" hook).
- The reformat commit is listed in `.git-blame-ignore-revs` (use `git blame --ignore-revs-file .git-blame-ignore-revs`).

## Verify before finishing
`npm run check` (typecheck, lint, format check, unit + integration tests), then `npm run build && npm run test:e2e` for UI/flow changes. If tests report "No test files found" with a `charCodeAt` startup error, Postgres isn't running (`service postgresql start`).

## Product rules (from the owner)
- Phone-first app that must also work perfectly on the web. Four places: Today, Plan, Jarvis, Money. Detail pages hang off Plan/Money.
- Money: never project income (pay counts only after it's deposited). Today's money section = cash & checking, spent this month, came in this month.
- Prefer one clear action per item; no dense tables on phones.

## Dev gotchas
- If `next dev` reload-loops ("HMR hash mismatch"), stop it and `rm -rf .next` (usually a leftover production build), then restart.
- Stop servers with `pgrep -f "[n]ext-server" | xargs -r kill` in its **own** command. A pattern that also appears in the same command line (e.g. "next start") kills your own shell.
- e2e: `signUp()` clears the sign-up rate-limit bucket (10/hour per IP) so the suite can keep growing; don't loosen the real limit.
