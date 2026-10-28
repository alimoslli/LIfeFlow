# BudgetFlow — notes for Claude Code

@AGENTS.md

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
- Prompts get memories only via `selectMemories` (jarvis/memory-retrieval.ts). If you change retrieval, add labelled cases to `tests/unit/memory-retrieval.test.ts`; the recall/precision test must stay green.
- `INSTRUCTIONS` in prompt.ts is static (identical for every user and request, so the provider can cache it). Anything per-user or per-request goes in `buildContext`. Bump `PROMPT_VERSION` on any prompt change.
- Every turn records a `jarvis_runs` row. A new provider must set `model` and report `usage` in `step_done`. Never store message content or raw error text in metrics, and never hard-code model prices (env `JARVIS_PRICE_*`; unknown ⇒ null).

## Motion (see ADR 0007)
- Use `src/components/motion/*`: tokens and GSAP from `gsap.ts`, `CountUp` for money, `Pressable` for press feedback. Import GSAP only from there.
- First-paint entrances stay CSS (`animate-rise`, `lf-*` classes) so server-rendered content never flashes. GSAP effects must skip the hydration pass (`isHydrated()`) or wait for the splash (`onSplashEnd`).
- Animate transform/opacity only, always honour `prefersReducedMotion()`, and never make content depend on an animation finishing.
- New accounts get `/welcome` (onboarding) and then the tour. Tests use `signUp()`, which skips both. The splash is off under automation unless `?splash=1`.

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
