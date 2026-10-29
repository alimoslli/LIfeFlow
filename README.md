# BudgetFlow

BudgetFlow is a personal life operating system: **finances, wealth, school, work, calendar, tasks and notes** in one app, with **Jarvis**, an AI assistant that reads and updates your real records through a set of safe, audited tools.

- **Stack:** Next.js 16 (App Router, TypeScript, React 19) · Tailwind CSS 4 · PostgreSQL 15+ with Drizzle ORM · OpenAI Responses API (server-side) · Vitest + Playwright
- **Status:** first milestone (MVP) complete. See [`PLAN.md`](PLAN.md) for what's done and what's next.
- **Docs:** [architecture](docs/architecture.md) · [schema](docs/schema.md) · [integrations](docs/integrations.md) · [decision records](docs/adr)

---

## What works today

| Area | What you can do |
|---|---|
| **First run** | Opening splash (once per session), a quick skippable setup (classes, job, checking balance, study time, Jarvis style, theme) saved through the normal services, and a 4-step guided tour you can replay from Settings. Calm GSAP motion throughout, and none with "reduce motion" |
| **Accounts** | Sign up / sign in (email + password, strength-checked with a live meter), optional **two-step sign-in** with an authenticator app + one-time backup codes, sessions, password change, sign out other devices, delete account, full data export |
| **Home** | Today's schedule, priority tasks, deadlines, money snapshot, goals, alerts (overdue work, conflicts, budgets over limit) |
| **Jarvis** | Streaming chat with persistent conversations, 100 tools across every module (create, edit and delete for everything), **live voice calls** with a voice you choose, and a name and personality you choose, confirmation step for deletions, file/screenshot attachments, opens from any page with module context (⌘/Ctrl + J). **Memory you control:** Jarvis suggests what to remember and you tap Keep. It saves directly only when you say "remember…". Corrections keep history, and only memories relevant to a request are sent. **Measured:** every request records speed, tokens, tool success and (if prices are set) cost. See [docs/jarvis-intelligence.md](docs/jarvis-intelligence.md) |
| **Proactive Jarvis** | Speaks up on his own from your real data (spending pace, bills you might be short for, late to-dos, deadlines that clash with shifts, goal milestones and forecasts, habit streaks, subscription price increases, trials ending), each with one action: Do it, Snooze, Not now, Don't suggest again, 👍/👎, and Undo. Morning brief, evening wrap-up, Sunday weekly review and monthly review. Learns from your responses only if you agree, asks short get-to-know questions, and Settings → Assistant shows what he learned. Tone (Coach, Friend, Straight to the point), frequency, quiet hours, topics and autonomy with a live preview. Pushes only what's time-sensitive (3 a day by default) |
| **Subscriptions & savings** | Every subscription with monthly and yearly totals, price increases, duplicates, trials about to convert, cancel help with sources, and renewal reminders. "Find cheaper" searches the web live for phone, internet, insurance, streaming and card/loan rates, keeps only prices with a cited source, and writes a negotiation script you send yourself |
| **Inbox & trips** | A private forwarding address plus photo/PDF upload: bills become reminders, receipts become spending, assignments go to the class, flights and hotels go into a trip, pay stubs into Work, all with Undo. Trips with bookings on the calendar, costs vs. budget and clashes with shifts and deadlines. Habits with streaks |
| **School** | Courses, per-course pages, assignments/exams with due dates and views (today, this week, upcoming, overdue, completed), materials, linked notes. Jarvis imports assignments from pasted text or screenshots into real records, skips duplicates, and asks when a course is ambiguous |
| **Tasks** | Tasks with subtasks, priorities, due dates, links to courses and projects |
| **Calendar** | Week grid and agenda combining events (including weekly recurring classes), work shifts, assignment deadlines and task due dates; conflict detection; free-time finder for Jarvis |
| **Finances** | Manual accounts, transactions (add, search, filter, recategorize, hide), idempotent CSV import, CSV export, budgets (including subcategories), bills & subscriptions with automatic recurring detection, savings goals, cash-flow chart and category breakdown |
| **Wealth** | Net worth, investment and retirement accounts, manually entered holdings and allocation |
| **Work** | Jobs and pay rates, scheduled shifts, recorded punches, estimated earnings with weekly overtime, paychecks (kept separate from estimates) |
| **Notes** | Markdown notes with full-text search, tags, and links to projects and courses |
| **Connections** | **Gmail** (search, read, drafts, send only after you confirm), **Google Calendar** (sync, add after confirm), **Apple Health** (daily totals from your own iPhone Shortcut). See [docs/integrations.md](docs/integrations.md) |
| **Legal** | Public Privacy Policy (`/privacy`) and Terms of Use (`/terms`) |
| **Settings** | Profile, time zone, preferences used by Jarvis, memory management, honest integration status, audit log |

**Not built yet (no fake versions exist):** Plaid bank sync, Canvas sync, UKG Pro, Outlook. Each is planned in `PLAN.md`; every module works with manual entry or Jarvis in the meantime.

---

## Install it on your phone

LifeFlow is built as a phone app (a Progressive Web App) and also works fully in any desktop browser.

- **iPhone (Safari):** open your site → Share button → **Add to Home Screen**.
- **Android (Chrome):** open your site → ⋮ menu → **Install app** (or "Add to Home screen").

It then opens full-screen from its own icon, like a native app.

## How money is shown

Only real numbers, never projections. Take-home pay isn't known until it lands, so income counts only once it's in an account. The Money tab shows **cash & checking** (savings excluded), **spent this month** and **came in this month**, plus investment value with its all-time return (from holdings that have a cost basis).

## Quick start (local development)

Prerequisites: **Node.js 22+**, **PostgreSQL 15+**.

```bash
npm install

# 1. Create a database and a NON-superuser role (row-level security is skipped for superusers)
psql -U postgres <<'SQL'
CREATE ROLE budgetflow LOGIN PASSWORD 'budgetflow_dev' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE budgetflow OWNER budgetflow;
CREATE DATABASE budgetflow_test OWNER budgetflow;
CREATE DATABASE budgetflow_e2e OWNER budgetflow;
SQL

# 2. Configure environment (never commit these files)
cp .env.example .env
cp .env.example .env.local
#   then set ENCRYPTION_KEY in both:  openssl rand -base64 32

# 3. Create the tables
npm run db:migrate

# 4. (Optional) load an isolated demo account with sample data
npm run db:seed-demo        # sign in as demo@budgetflow.local / budgetflow-demo

# 5. Run it
npm run dev                 # http://localhost:3000
```

Demo data lives only in a separate account flagged as a demo. Every demo record is marked "Sample data" in the UI. Demo data is never added to a real account.

### Configure Jarvis (OpenAI)

Jarvis needs an OpenAI API key. Everything else works without it.

1. Create a key at <https://platform.openai.com/api-keys> (an OpenAI account with billing enabled is required).
2. Put it in `.env.local` (development) or your host's environment variables (production):
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5.5
   ```
3. Restart the server. **Settings → Jarvis & memory** shows whether Jarvis is connected.

The key is only read on the server. It is never sent to the browser, logged, or stored in the database. `OPENAI_MODEL` can be any Responses-API model that supports function calling; check OpenAI's current model list and pricing before choosing one. The default `gpt-5.5` was picked from the model IDs in the installed SDK (`openai@6.x`); I couldn't test it live from the build environment (see PLAN.md).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest, against `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Browser tests (Playwright) against the production build, an isolated `budgetflow_e2e` database and a local fake OpenAI server. Run `npm run build` first |
| `npm run check` | typecheck + lint + tests |
| `npm run db:generate` | Generate a new migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (and warn if the DB role would bypass row-level security) |
| `npm run db:seed-demo` | Recreate the demo account |
| `npm run db:studio` | Browse the database (Drizzle Studio) |

### Tests

- **Unit** (`tests/unit`): money and date math (including time zones and DST), cash-flow rules (transfers excluded, refunds offset spending), recurring detection, overtime, course matching, recurrence expansion, conflicts, free time, secret detection, encryption, password hashing, CSV parsing, and OpenAI wire-format handling.
- **Integration** (`tests/integration`, real Postgres): row-level-security isolation, ownership checks, assignment import and deduplication, finance summaries, budgets, CSV idempotency, and the Jarvis tool loop (saving records, the confirmation gate, cross-user attacks, invalid tool calls, memory secret refusal, provider failures). Memory: suggest/approve/dismiss, explicit requests, corrections with history, the suggestions-off setting, note-injection and cross-user attempts. Run metrics: tokens, cost, failures, per-user isolation.
- **Retrieval baseline** (`tests/unit/memory-retrieval.test.ts`): labelled requests with the memories that must and must not be sent. Recall and precision must stay at 100% on this set.
- **End-to-end** (`tests/e2e`): sign up → tasks; Jarvis → assignments and tasks appear in School and Tasks; confirmation before deletion; two users can't see each other's data; API auth and cross-site protection; mobile layout. Memory: suggestion → Keep → used, survives reload, appears in Settings; explicit save; Not now; suggestions toggle.

---

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Role must not be superuser or have BYPASSRLS |
| `ENCRYPTION_KEY` | for integrations | 32 random bytes, base64. Encrypts provider tokens at rest |
| `OPENAI_API_KEY` | for Jarvis | Server-only |
| `OPENAI_MODEL` | no | Default `gpt-5.5` |
| `OPENAI_REASONING_EFFORT` | no | `none`/`low`/`medium`/`high` for reasoning models |
| `OPENAI_BASE_URL` | no | OpenAI-compatible gateway; used by e2e tests |
| `JARVIS_PRICE_INPUT_PER_MTOK` / `JARVIS_PRICE_CACHED_INPUT_PER_MTOK` / `JARVIS_PRICE_OUTPUT_PER_MTOK` | no | Model prices (USD per 1M tokens) from your provider's pricing page, used only for cost estimates in Jarvis metrics. Blank ⇒ cost shown as "not configured" |
| `TEST_DATABASE_URL` / `E2E_DATABASE_URL` | tests | Must be different databases; tests wipe them |
| `SEED_TEST_ACCOUNT` | no | On Vercel: `keep` creates the demo/test account once and keeps it; `refresh` recreates it with current dates on the next deploy |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | with `SEED_TEST_ACCOUNT` | Login for the test account (password 10+ chars) |
| `OPENAI_REALTIME_MODEL` | no | Voice model, default `gpt-realtime`. Voice uses `OPENAI_API_KEY` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Gmail + Calendar | From Google Cloud Console, see docs/integrations.md |
| `APP_URL` | for Google | Your site, e.g. `https://lifeflow.example.com`, used for the OAuth redirect |
| `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_STATE` | recommended | Shown in the Privacy Policy and Terms |
| `PLAID_*`, `CANVAS_BASE_URL` | later | Reserved for upcoming integrations |

---

## Deployment

The simplest production setup is **Vercel** (Next.js host) with a **managed Postgres** (Neon or Supabase).

1. **Database:** create a Postgres database. Create a dedicated role without `BYPASSRLS` that owns the tables, for example:
   ```sql
   CREATE ROLE budgetflow_app LOGIN PASSWORD '<strong password>' NOSUPERUSER NOBYPASSRLS;
   GRANT ALL ON SCHEMA public TO budgetflow_app;
   ```
   Use that role's connection string as `DATABASE_URL`. If your provider uses a connection pooler (Supabase "transaction" mode, Neon pooled URL), that works: user context is set per transaction.
2. **Migrate:** from your machine, `DATABASE_URL=<prod url> npm run db:migrate`. It warns if row-level security would be bypassed.
3. **Host:** import the repository in Vercel, set the environment variables (`DATABASE_URL`, `ENCRYPTION_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`), and deploy. Don't run `db:seed-demo` in production.
4. **Check:** `GET /api/health` should return `{"ok":true,"db":"up"}`.

Any Node.js host that runs `npm run build && npm start` also works (Fly.io, Railway, Render, a VPS).

---

## Project layout

```
src/
  app/                 Routes (App Router)
    (auth)/            login, signup, auth server actions
    (app)/             signed-in pages: home, jarvis, finances, wealth, school, work, calendar, tasks, notes, settings
    api/               jarvis chat stream, action confirmation, uploads, export, health
  components/          UI kit (ui/), shell, Jarvis chat, charts
  lib/                 client-safe helpers: dates/time zones, money, utils
  server/
    db/                schema, client, withUser (RLS scoping), series
    auth/              password hashing, sessions, current user
    services/          business logic per module (used by pages AND Jarvis)
    jarvis/            agent loop, tool registry, tools/, prompt, providers (OpenAI, scripted)
drizzle/               SQL migrations
scripts/               migrate, seed-demo
tests/                 unit, integration, e2e
docs/                  architecture, schema, integrations, ADRs
```
