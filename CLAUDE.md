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

## Verify before finishing
`npm run typecheck && npm run lint && npm test`, then `npm run build && npm run test:e2e` for UI/flow changes.
