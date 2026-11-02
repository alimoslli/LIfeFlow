# ADR 0003 — User data isolation with Postgres row-level security

**Status:** accepted

**Decision:** every user-owned table has `FORCE ROW LEVEL SECURITY` and a policy `user_id = current_setting('app.user_id')`. All user-scoped work runs through `withUser(userId, fn)`, which opens a transaction and sets `app.user_id` locally (safe with transaction-mode connection poolers). Services *also* filter by `user_id` and verify ownership of referenced records, because foreign-key checks bypass RLS.

**Why:** a forgotten `WHERE user_id = …` in any query, including one inside an AI tool, can't leak another user's data. Tests prove that unfiltered queries, spoofed inserts and cross-user IDs all fail.

**Operational requirement:** the database role must not be a superuser or have `BYPASSRLS`. `npm run db:migrate` warns, and an integration test fails, if it does.

**Trade-off:** queries that run in parallel inside one transaction must be sequential (`series()` helper), since a transaction holds a single connection.

## Exceptions (reviewed)

Nine tables with a `user_id` column are read before anyone is signed in: sessions, recovery codes, passkeys, auth and login challenges, OAuth identities, password resets, the connection registry and health keys. Row-level security can't apply to a lookup by a token hash, so each of them is protected by its queries, which always filter by user id or by the secret's hash. `tests/integration/isolation-every-table.test.ts` lists them, and fails if any other user table loses row-level security. `users` and `error_reports` are not per-user tables.
