# BudgetFlow — Plan & Status

Last updated: 2026-10-28. Status keys: ✅ done and tested · 🟡 partial · ⬜ not started · 🔑 blocked on credentials/access

## Voice, Google, Apple Health, legal pages, custom assistant ✅ (2026-10-28, ADR 0010)
Privacy Policy and Terms (public, operator details from `LEGAL_*`), customizable assistant (name, personality, notes, voice), live voice calls (OpenAI Realtime over WebRTC, same tools and Confirm gate), Google OAuth with Gmail search/read/draft/send-with-confirm and Calendar sync/add-with-confirm, Apple Health via the user's iOS Shortcut (personal keys, daily totals, `get_health_summary`). Verified: 173 unit/integration tests and 20 e2e tests, against fake Google/OpenAI. **Not yet verified live:** needs deployment with real Google and OpenAI credentials.

## Premium feel — splash, onboarding, tour, motion ✅ (2026-10-28, ADR 0007)
GSAP-based motion system (`src/components/motion`), opening splash, `/welcome` first-run setup (one transaction through existing services), guided tour (replay in Settings), count-ups, sliding tab indicator, animated sheets/drawer, page cross-fades, shimmer skeletons. Verified: 124 unit/integration tests, 15 e2e tests (desktop + phone), and phone recordings in light and dark. Base44 feature review still pending: `budgetflow.studio` is not reachable from the build workspace.

## Current focus — Jarvis intelligence (details: [docs/jarvis-intelligence.md](docs/jarvis-intelligence.md))

| Phase | Scope | Status | Verification |
|---|---|---|---|
| 1 | Memory you control (suggest → approve, explicit requests checked server-side, basis, corrections with history, archive-forget, instructions, suggestions toggle), relevance retrieval, static-first versioned prompt, per-turn metrics (`jarvis_runs`), Settings memory review + personal stats, chat Keep/Not now cards | ✅ | 119 unit/integration tests (incl. labelled retrieval set, injection and cross-user cases), 12 e2e incl. 2 memory flows; phone screenshots light/dark. **Not yet run against the real OpenAI API** (network blocked here, no key) |
| 2 | Feedback & learning (👍/👎, error categories, corrections → proposed rules, learned-preferences review) | ⬜ | |
| 3 | Evaluation suite + safe prompt experiments, anonymized consented aggregates | ⬜ | |
| 4 | More actions (recategorize, edit everything, plan day/week, bulk with confirmation) | ⬜ | |
| 5 | Context & continuity (life snapshot, summaries, resume chats, web search, PDFs) | ⬜ | |
| 6 | Privacy & ops (retention settings, consent, **production DB role without BYPASSRLS**) | ⬜🔑 | needs a one-time Neon + Vercel step by the owner |

## Milestone 1 — Foundation & MVP ✅

| # | Item | Status | Verification |
|---|---|---|---|
| 1 | Auth (email/password, DB sessions, rate-limited login), user isolation via Postgres RLS + service checks | ✅ | integration + e2e isolation tests |
| 2 | App shell, navigation, responsive layout, design system | ✅ | e2e mobile overflow test, manual screenshots |
| 3 | Home dashboard (modular widgets) | ✅ | e2e |
| 4 | Jarvis chat UI (streaming, history, attachments, confirmations, follow-ups, module context) | ✅ | e2e with fake OpenAI server |
| 5 | Server-side OpenAI integration (Responses API, tool calling, store=false) | 🟡 | Request/stream format tested against SDK types and a simulated stream. **Not yet run against the real OpenAI API**: the build environment's network policy blocks api.openai.com and no key was provided |
| 6 | Persistent conversations and memory (with secret filter, expiry, user editing; approval flow added in Jarvis intelligence phase 1) | ✅ | integration tests |
| 7 | Tasks | ✅ | integration + e2e |
| 8 | Calendar (recurrence, unified agenda, conflicts, free time) | ✅ | unit tests + screenshots |
| 9 | School (courses, assignments, views, materials, Jarvis ingestion with dedupe) | ✅ | integration + e2e |
| 10 | Finance (manual accounts, transactions, CSV import/export, budgets, recurring detection, goals, insights) | ✅ | unit + integration |
| 11 | Jarvis tools for all implemented modules (48 tools) | ✅ | integration |
| 12 | Tests for critical workflows | ✅ | 50 unit/integration + 6 e2e |
| — | Wealth (net worth, investment accounts, manual holdings) | ✅ | screenshots |
| — | Work (jobs, shifts, punches, overtime estimates, paychecks) | ✅ | unit tests |
| — | Notes & projects (full-text search) | ✅ | manual |
| — | Settings (profile, memory, integrations, export, delete account, security/audit) | ✅ | e2e export test |

### Known gaps / follow-ups in the MVP
- Run Jarvis against the real OpenAI API with your key and tune the system prompt and tool descriptions from real conversations.
- Jarvis attachments: images go to the model directly; text files go through `read_attachment`. **PDF syllabi are not supported yet**. Next step: pass PDFs as `input_file`, or extract their text server-side.
- Assignment ingestion from screenshots depends on the model's vision quality. Imports always report what was saved, what was skipped, and what needs a course.
- Editing single occurrences of recurring events isn't supported (edit or delete the whole series).
- No email verification or password reset flow yet (needs an email-sending provider).
- Rate limits are per user and per IP in Postgres. Tune the limits once real usage is known.
- Notes editor is a Markdown textarea with preview; there's no rich-text editing.

## Milestone 2 — Bank & investment data (Plaid) ⬜🔑
Needs: Plaid account, `PLAID_CLIENT_ID`, `PLAID_SECRET`; production access requires Plaid's approval.
1. `/link/token/create` + Plaid Link (client) → `/item/public_token/exchange`; store the access token encrypted (`integrations.encrypted_credentials`).
2. `/transactions/sync` with cursor (idempotent; handles added/modified/removed; pending→posted via `pending_transaction_id`), stored in `transactions` with `source='plaid'` and `provider_transaction_id`.
3. Webhook endpoint (`SYNC_UPDATES_AVAILABLE`, item errors) with signature verification → `sync_jobs`.
4. Balances (`/accounts/balance/get` or the balances returned by sync).
5. Investments (separate product + consent): `/investments/holdings/get`, `/investments/transactions/get` → `holdings`. Re-verify that the Robinhood crypto, brokerage and Roth IRA accounts expose holdings, not just balances.
6. Category mapping from Plaid's categories to BudgetFlow categories; transfer detection between linked accounts.
7. Re-auth (update-mode Link), item removal, error states in Settings.

## Milestone 3 — Canvas ⬜🔑
Needs: your school's Canvas URL and either a personal access token (if your school allows them) or an institution-issued developer key for OAuth.
- Sync courses, assignments (due dates, points, URLs), and planner items into `courses`/`assignments` with `source='canvas'` and provider IDs (dedupe against manual entries).
- Connection card at the bottom of School (placeholder already there).

## Milestone 4 — Calendar providers 🟡
Google Calendar ✅ (sync + add with confirm). Outlook and ICS subscription import as a no-OAuth fallback.

## Milestone 5 — UKG Pro ⬜🔑
API access is normally issued to the employer, not to individual employees. Plan: ICS/schedule export import if your employer's UKG enables it; otherwise keep Jarvis screenshot import plus manual entry. Build a direct integration only if employer-issued credentials become available.

## Milestone 6 — Email 🟡
Gmail ✅ (ADR 0010). Outlook still to do. Gmail/Outlook OAuth: search, summarize, find deadlines, turn messages into tasks, draft replies. Sending only after explicit confirmation and provider-confirmed success. Gmail restricted scopes need Google verification for anything beyond personal testing use.

## Milestone 7 — Polish & scale
Notifications/reminders (web push, email digest), background jobs for syncs, report exports (PDF), forecasting improvements, portfolio history, recurring event exceptions, accessibility audit, observability (error tracking), backups.

## Milestone 8 — Voice ✅ (ADR 0010)
The provider interface (`src/server/jarvis/providers`) and the event stream are transport-agnostic. Add speech-to-text input and text-to-speech output (or OpenAI's realtime API) on top of the same tools and agent loop.
