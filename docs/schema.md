# Database schema

Source of truth: [`src/server/db/schema.ts`](../src/server/db/schema.ts). Migrations live in [`drizzle/`](../drizzle). Every user-owned table has `user_id → users.id ON DELETE CASCADE` and a forced row-level-security policy `owner_isolation` (`user_id = app.user_id`).

## Conventions
- UUID primary keys, `created_at` / `updated_at` timestamps (`timestamptz`).
- Money in integer cents (`bigint`); transaction amounts are signed (+ in, − out).
- `source` on records: `manual | jarvis | import | demo | plaid | canvas | ukg` (where it came from).
- Provider IDs (`provider_*_id`) plus partial unique indexes make syncs idempotent.

## Tables

| Group | Table | Purpose / key relationships |
|---|---|---|
| Identity | `users` | email (unique), scrypt hash, name, time zone, `account_kind` (`standard`/`demo`), preferences (JSON). **No RLS** (needed before login) |
| | `sessions` | SHA-256 of session token, expiry. No RLS |
| | `rate_limit_buckets` | fixed-window counters. No RLS |
| | `audit_events` | actor (user/jarvis/system), action, entity, metadata |
| Integrations | `integrations` | provider, status, encrypted credentials, last sync/error; unique (user, provider, external_id) |
| | `sync_jobs` | per-run status, cursor, stats, error |
| Finance | `financial_accounts` | type (depository/credit/loan/investment/cash), balances, source, provider account id |
| | `categories` | per-user tree (`parent_id`), kind expense/income/transfer; defaults seeded at signup |
| | `transactions` | account, date, signed amount, **kind** (income/expense/transfer/refund/reimbursement/investment/adjustment), category, pending, excluded, provider id (unique), pending→posted link |
| | `budgets` | month + category + limit; unique (user, month, category) |
| | `recurring_items` | bills/subscriptions/income with frequency and next due date |
| | `financial_goals` | target, saved, date; optional linked account (tracks its balance) |
| | `holdings` | per investment account; quantity, value, cost basis, source |
| School | `courses` | code, term, instructor, meeting info, color, provider id |
| | `assignments` | course, kind (assignment/exam/quiz/…), due_at + due_all_day, status, source + source_ref, **dedupe_key unique** (course + normalized title + local due date) |
| | `course_materials` | links/files per course and module |
| Calendar & tasks | `calendar_events` | start/end, all-day, kind, recurrence (JSON: daily/weekly, byDay, until, interval), optional course |
| | `tasks` | status, priority, due, `parent_id` (subtasks), optional project/course |
| Knowledge | `projects` | name, status |
| | `notes` | Markdown body, tags, project/course links, generated `tsvector` + GIN index for search |
| Work | `employers` | pay type, hourly rate, overtime rules |
| | `work_shifts` | **scheduled** start/end + break, separately **recorded** punches, status |
| | `paychecks` | actual pay; optional link to the bank deposit transaction |
| Jarvis | `conversations` | title, module context, last activity |
| | `messages` | ordered by `seq`; role user/assistant/tool; tool name, args, result, status |
| | `attachments` | uploaded files (base64), checksum, type |
| | `memories` | content, category, source, status, expiry |
| | `pending_actions` | tool calls awaiting user confirmation (expire after 30 min) |

## Changing the schema
1. Edit `src/server/db/schema.ts`.
2. `npm run db:generate -- --name <change>` and review the SQL in `drizzle/`.
3. `npm run db:migrate` (and the tests migrate their own databases automatically).
Migrations are additive and preserve data; never edit an applied migration.
