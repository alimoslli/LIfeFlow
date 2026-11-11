# Scale measurements (2026-11-11)

Measured, not changed: no production path was touched. Recommendations at the end are for the COO to turn into missions.

## How it was measured

- A made-up student (never production data): 2 years of transactions on 2 accounts (786 rows; real accounts may have 3 to 5 times that), a job with a shift every
  other day for a year (about 150 to 300 shifts), 6 classes (a weekly lecture each plus 20 assignments each), 80 open to-dos, 150 one-off events.
- Postgres 16 on the same machine (budgetflow_test_f), so the network between app and database is about 0 ms. Every number below is therefore the floor:
  real cost = these numbers + (queries x round-trip time to the production database).
- Each function ran 5 times inside one `withUser` transaction, like a page does. Queries were counted and timed by wrapping `pg.Client.query`.
- The measuring test was throw-away (not committed); it used `createTransaction`, `createShift`, `createEvent`, `createAssignment` and friends to seed.

## Today and Money server calculations

| Calculation | Median | Queries (all in one transaction, run in sequence) |
| --- | --- | --- |
| `dayClockData`, Money locked | 44 ms (30 to 83) | 19 |
| `dayClockData`, Money open | 78 ms (69 to 101) | 28 |
| `moneyOverview` | 9 ms | 9 |
| `cashForecast` (30 days) | 29 ms | 11 |
| `collectSnapshot` (briefing) | 49 ms | 35 |
| `withUser` with nothing inside (begin, set_config, commit) | under 1 ms | 4 |

Slowest single queries (each 1 to 6 ms in total, nothing above 6 ms at this size): the `calendar_events` and `work_shifts` reads inside `getAgenda` (6 ms the
first time in `dayClockData` with Money open), the `transactions` reads (2 to 9 ms in total across 2 to 8 calls), and the `assignments` reads. No query was
slow on its own: the cost is the number of sequential round trips. `series()` is required inside a transaction, so these cannot be parallel.

What that means in production: with a database 5 ms away, `dayClockData` with Money open is about 28 x 5 = 140 ms of waiting plus 78 ms of work; at 20 ms away
(for example a database in a different region from the function) it is about 560 ms plus the work, and the briefing's 35 queries about 700 ms. Today and the
briefing are the screens to put next to the database (same region as the Vercel functions) first.

Transactions over 2 years did not matter yet (the transactions queries stayed at 1 to 3 ms each with the user index); the day's cost grows with the number of
agenda and task reads, not with history. Re-measure with 5,000+ transactions before treating the Money page as safe.

## Network waits inside database transactions (found by reading the code)

A transaction holds one of the pool's connections while it waits for a provider. Found:

- `src/app/api/cron/sync/route.ts`: Google runs `syncGoogleCalendar` and `syncGoogleEmail` inside one `withUser`, and Canvas runs `syncCanvas(s, fetch, ...)`
  inside `withUser`. Each provider call can take up to 20 s (`DEFAULT_PROVIDER_TIMEOUT_MS`), and Gmail makes many calls, so a connection can be held for
  a minute or more.
- `src/server/integrations/plaid.ts` `syncConnection`: `withUser(userId, (s) => syncItem(...))` keeps the transaction open across all of Plaid's calls
  (transactions/sync pages, accounts, balance, investments, liabilities). By design the sync is one transaction so a failed sync rolls back (documented there).
- `src/server/integrations/microsoft.ts` `syncMicrosoftConnection` (`withUser` around `syncMicrosoftCalendar`).
- Token refresh in `google.ts` and `microsoft.ts` correctly uses a separate short `withUser` after the fetch.
- The model call in the assistant's turn is the other place to check (tool calls run inside `mutate`/`withUser`); not measured here.

Pool: `src/server/db/client.ts` has one pool per process, `max: 10`, `connectionTimeoutMillis: 10_000`, no idle or statement timeout (statement timeouts of
5 s exist only for admin/HQ reads and the export). On Vercel each function instance has its own pool of up to 10, so the database's connection limit is
instances x 10 unless a transaction-mode pooler sits in front (ADR 0003 assumes one). Tests also open one pool per file.

## Crons that walk every user one after another

| Cron | Schedule | Loop | Cost per user (local, no network) |
| --- | --- | --- | --- |
| `/api/cron/notify` | every 10 min | every user in `users`, 3 separate transactions each (`runDueSlot`, `runNotifications`, `pushImportant`) | 11 queries, about 8 ms outside a slot; a user whose slot is due runs the whole detector set (not measured, heavier) |
| `/api/cron/promises` | every 30 min | every user, `runProactive` (+ `pushImportant` when something was made) | 6 queries, about 5 ms |
| `/api/cron/stars` | every 5 min | every user, `pushStars` | 3 queries, about 6 ms |
| `/api/cron/sync` | every 30 min | every connection in `connection_registry`, one after another; each Plaid connection under its own lease | not a database cost: a provider round trip per connection (Plaid, Google, Outlook, Canvas), each up to 20 s |

All four have `maxDuration = 300` and a `job_locks` lease, so a slow run makes the next one skip instead of overlapping, and a run killed at 300 s simply
stops part-way: users late in the list are the ones never served. Rough ceilings at 5 ms of network per query: notify about 60 ms a user, so about 5,000 users
in 300 s; stars and promises are lighter. The sync cron is the first to break: 300 s divided by an average 1 to 3 s per connection is 100 to 300 connections
per run, and one slow Gmail account takes the time of many.

## Recommendations (not built)

1. Put the app and the database in the same region and say so in `docs/go-live-checklist.md`; this is worth more than any query change at this size.
2. Sync cron: split into a batch per run (order by `last_synced_at`, stop at about 240 s, continue next run) or fan out one request per connection;
   at minimum, order connections so the oldest-synced go first. Move provider fetches out of the Google and Canvas `withUser` (fetch first, write in a short
   transaction), as the token refresh already does.
3. Notify, promises and stars: do one cheap read per user first ("is anything due for this user?") before opening three transactions, and process users in
   groups with a time budget like the sync cron.
4. Add an idle-in-transaction timeout (for example `idle_in_transaction_session_timeout`) on the database role so a stuck provider call can never pin a connection.
5. Re-run these measurements with 5,000 transactions and a 20 ms simulated round trip (`tc netem` or a remote database) before launch.
