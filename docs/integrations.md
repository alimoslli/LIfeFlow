# Integrations — requirements & plan

Nothing in this file is implemented yet, and the app never shows these as connected. These notes are from prior knowledge of each provider. **Re-check them against current official docs when implementing**: the build environment couldn't reach provider documentation.

All integrations will follow one pattern:
- A provider client in `src/server/integrations/<provider>/` behind a small interface, plus a **mock implementation for tests only**. Mock data is never written with a real `source` value.
- Credentials stored encrypted in `integrations.encrypted_credentials` (AES-256-GCM, `ENCRYPTION_KEY`).
- Each sync writes a `sync_jobs` row (status, counts, error). Upserts use provider IDs so repeated syncs never duplicate data.
- Status, last successful sync, and an actionable error appear in Settings → Integrations and in the module.

## Plaid (Finances, Wealth)
- **You need:** a Plaid account → Dashboard → Developers → Keys: `PLAID_CLIENT_ID`, `PLAID_SECRET`. Start in **Sandbox**; using your real banks requires applying for **Production** access.
- **Products:** `transactions` for spending. **`investments` is a separate product** with its own consent. A Transactions connection does not give holdings. Request `investments` in Link for brokerage/IRA/crypto accounts, and verify Robinhood's coverage at implementation time.
- **Flow:** server creates a link token → browser opens Plaid Link → server exchanges the public token for an access token (stored encrypted) → `/transactions/sync` with a stored cursor (added / modified / removed) → webhooks trigger re-sync.
- **Integrity rules already in the schema:** unique `provider_transaction_id`, `pending` flag and `pending_transaction_id` for pending→posted replacement, and `kind = transfer` for movements between your own linked accounts.

## Canvas LMS (School)
- **You need:** your school's Canvas URL (e.g. `https://canvas.<school>.edu`). Then either a **personal access token** (Canvas → Account → Settings → "New Access Token", if your school allows it) or an **OAuth developer key** issued by your school's Canvas admins (needed for a multi-user app).
- **Data:** REST API `/api/v1/courses` (active enrollments), `/api/v1/courses/:id/assignments`, planner items/upcoming events. Paginated via `Link` headers.
- **Mapping:** `courses.provider_course_id`, `assignments.provider_assignment_id`, `source='canvas'`; link to manually created matching assignments rather than duplicating them.

## UKG Pro (Work)
- UKG APIs are licensed to **employers**. They need a customer API key and service-account credentials. A personal UKG login doesn't grant API access.
- **Realistic options:** (1) if your UKG mobile app or web portal can export or sync your schedule to a calendar (ICS), import that feed; (2) screenshot or paste the schedule into Jarvis, which already calls `add_shifts`; (3) a direct API connection only with employer-issued credentials.
- Scheduled shifts, recorded punches, estimated wages, and actual paychecks/deposits are stored separately and must stay that way.

## Google Calendar / ICS (Calendar)
- Google Cloud project → OAuth client (web) → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; scope `calendar.readonly` first. Public ICS feeds can be imported without OAuth.

## Email (Gmail / Outlook)
- Gmail read scopes are "restricted". For personal use, the OAuth app can stay in Testing mode with you as a test user. A public launch needs Google verification and a security assessment.
- Jarvis may search, summarize, extract deadlines, and draft. **Sending** requires your confirmation and is reported only after the provider confirms it. Today the `draft_email` tool only prepares text and says plainly that nothing was sent.
