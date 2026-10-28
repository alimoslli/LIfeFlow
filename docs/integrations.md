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

## Google: Gmail + Google Calendar (built, ADR 0010)
Setup (once, in Google Cloud Console):
1. Create a project. Enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen: External, app name LifeFlow, your support email, Privacy Policy `https://<site>/privacy`, Terms `https://<site>/terms`. Add scopes `gmail.readonly`, `gmail.compose`, `calendar.events`. Leave it in **Testing** and add yourself as a test user.
3. Credentials → OAuth client ID → Web application. Authorized redirect URI: `https://<site>/api/integrations/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL=https://<site>` and `ENCRYPTION_KEY` on the server.
- Gmail scopes are "restricted". Testing mode is fine for you (refresh tokens for test users expire after 7 days, so you may need to reconnect weekly). A public launch needs Google verification and a security assessment.
- Jarvis searches and reads email (as untrusted content), saves drafts to Gmail, and **sends only after you press Confirm**, reporting Gmail's message id. Calendar: synced mirror of the past 7 / next 60 days; adding events needs Confirm.
- Outlook is not built.

## Apple Health (built, ADR 0010)
- No API key and no Apple account needed: Settings → Integrations → Apple Health → create a key, then follow the in-app Shortcut steps. The Shortcut POSTs daily totals to `/api/apple-health/ingest` with `Authorization: Bearer <key>`.
- A native iOS app (HealthKit) would need the Apple Developer Program ($99/year) and App Review.
