# Vercel setup audit (2026-11-08)

Goal: one complete, simple Vercel setup for the owner. Names only; no values appear here.

Short version: the checklist covers about half of the variables the app reads, and the cron setup in `vercel.json` cannot run on Vercel Hobby. Fix this with Vercel Pro, or with a free outside scheduler plus one daily Vercel cron.

Note: vercel.com could not be reached from this session (blocked network), so the price below is from memory and must be checked on https://vercel.com/pricing before you decide.

## 1. Environment variables

Where: Vercel, project, Settings, Environment Variables. Set each for Production (and Preview only if noted). Redeploy after changes.

"Section" is the part of `docs/go-live-checklist.md` that covers it. "None" means the checklist does not mention it.

| Variable | Turns on | Required? | Section |
|---|---|---|---|
| `DATABASE_URL` | The whole app and the build's migrations | Required | 11 (not in table 1) |
| `APP_URL` | Reset and email links, Google, Apple, passkeys, Twilio signing | Required | 1 |
| `ENCRYPTION_KEY` | Encrypts tokens and memories at rest, two-step sign-in | Required | 1 |
| `CRON_SECRET` | All three cron routes (they return 401 without it) | Required | 1 (wrong text, see below) |
| `ADMIN_EMAILS` | The /admin and HQ pages (empty means a 404 for everyone) | Required for the owner | None |
| `OPENAI_API_KEY` | Chat, voice, tidy, inbox reader, web search | Required for the assistant | 1 |
| `OPENAI_MODEL` | Which chat model (default set in code) | Optional | None |
| `OPENAI_REALTIME_MODEL` | Voice model | Optional | 1 |
| `OPENAI_SEARCH_MODEL` | Web search model | Optional | 1 |
| `OPENAI_REASONING_EFFORT` | Fixed thinking level (default auto) | Optional | None |
| `OPENAI_PROMPT_CACHE_RETENTION` | Prompt cache time (default 24h) | Optional | None |
| `OPENAI_BASE_URL` | A gateway instead of api.openai.com | Optional | None |
| `JARVIS_PRICE_INPUT_PER_MTOK`, `JARVIS_PRICE_CACHED_INPUT_PER_MTOK`, `JARVIS_PRICE_OUTPUT_PER_MTOK` | Cost estimate in admin metrics (blank shows "not measured") | Optional | None |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google, Gmail, Calendar | Optional | 1, 2 |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple | Optional | 1, 3 |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Teams and Outlook calendar | Optional | 2b (not in table 1) |
| `MICROSOFT_TENANT` | Account types (default "common") | Optional | None |
| `WEBAUTHN_RP_ID` | Passkeys on a parent domain | Optional | 1 |
| `RESEND_API_KEY`, `EMAIL_FROM` | Password reset, login codes, notice and alert emails | Required for sign-in recovery | 1, 4 |
| `ALERT_EMAIL` | Where error alerts go (falls back to `LEGAL_CONTACT_EMAIL`) | Optional | None |
| `FEEDBACK_EMAIL` | Where feedback email goes | Optional | None |
| `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_STATE` | /privacy and /terms wording | Recommended | 1 |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Bank sync | Optional | 1 |
| `PLAID_REDIRECT_URI` | Bank OAuth on phones | Optional | None |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Push notifications | Optional | 1 |
| `VAPID_SUBJECT` | Push contact (defaults to `LEGAL_CONTACT_EMAIL`) | Optional | 1 |
| `INBOX_DOMAIN`, `INBOX_WEBHOOK_SECRET` | Forward-a-bill inbox | Optional | 1, 9 |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Texting the assistant | Optional | 9b |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp sender | Optional | None |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Paid plan (until all three are set, everything stays unlocked) | Required before charging | 9c |
| `CANVAS_BASE_URL` | Canvas connection card | Optional | None |
| `SEED_TEST_ACCOUNT` (`keep` or `refresh`) with `DEMO_EMAIL`, `DEMO_PASSWORD` (10+ characters) | Demo account made by the production build; build fails if `DEMO_PASSWORD` is short or missing while the seed is on | Optional, leave all blank to skip | None |
| `HQ_DESK_FIRE_URL`, `HQ_DESK_FIRE_TOKEN` | "Start it" button on the HQ desk | Optional | None (see CLAUDE.md) |
| `VERCEL_ENV` | Set by Vercel itself. Do not add it. | Automatic | n/a |

Not for Vercel: `CAP_SERVER_URL` (Mac, iPhone app build, 9d); `HQ_URL`, `HQ_KEY` (Claude Code chats, not the app); `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `PROVIDER_TIMEOUT_MS`, `ACTION_RUN_LIMIT_MS` (tests only; ignored in production); `NODE_ENV` (Vercel sets it).

### What the checklist is missing or has wrong

1. `DATABASE_URL` is not in table 1. It is the first thing needed.
2. `ADMIN_EMAILS` is missing. Without it the owner's admin and HQ pages return 404.
3. The `CRON_SECRET` row says "Nightly bank sync and notifications". Wrong: sync runs every 30 minutes, notify daily or more, promises every 30 minutes (three jobs, see section 2).
4. Section 5 says Vercel Hobby runs jobs once a day, but `vercel.json` asks for every 30 minutes. On Hobby, that makes the deployment fail. Section 5 also names only the notify route; sync and promises need the same treatment.
5. Missing optional variables: `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_PROMPT_CACHE_RETENTION`, `OPENAI_BASE_URL`, `JARVIS_PRICE_*`, `ALERT_EMAIL`, `FEEDBACK_EMAIL`, `PLAID_REDIRECT_URI`, `TWILIO_WHATSAPP_NUMBER`, `MICROSOFT_*`, `CANVAS_BASE_URL`, `SEED_TEST_ACCOUNT`, `DEMO_*`, `HQ_DESK_FIRE_*`.
6. Section 2 lists only the Gmail redirect URI. Sign in with Google also needs `https://<site>/api/auth/google/callback` (the `.env.example` lists both).
7. Table 1 should say which variables are optional (blank means off). Only some rows do.
8. Section 1 says "Database migrations run automatically on deploy." True only for production deploys (section 3 below).
9. Section numbers skip 8. Sections 2 and 3 use `yoursite` or `yoursite.vercel.app` while 2b uses lifeflowweb.com; pick the real domain once.
10. Section 11 (database role) is a hard requirement for `DATABASE_URL`, so table 1 should link to it.

## 2. Cron jobs

All three routes need `Authorization: Bearer <CRON_SECRET>` (Vercel adds it by itself when `CRON_SECRET` is set). All are safe to call often and are public in `proxy.ts` (the secret is the only gate).

| Route | What it does | Scheduled now | How often it needs to run | Hobby | Pro |
|---|---|---|---|---|---|
| `/api/cron/sync` | Refreshes every bank, Google, Outlook and Canvas connection | every 30 min | every 30 to 60 min is fine; daily works but data is up to a day old | Deploy rejected at this schedule; daily only | Fine |
| `/api/cron/notify` | Assistant morning, midday and evening looks; to-do reminders; important pushes; housekeeping (old rate limits, unused HQ pictures) | daily at 15:37 UTC | every 5 to 10 min: reminders fire at the minute the user chose, and the briefing slots fire when due | Daily only: reminders arrive late or at one time of day; morning and midday slots run at 15:37 UTC | Every 5 min works |
| `/api/cron/promises` | Asks "Did you?" for promises whose time has come (default 9 PM); congratulates on finished to-dos | every 30 min | every 30 min (a 9 PM check-in should land within a half hour) | Deploy rejected; daily would ask once at a fixed time | Fine |

What breaks on Hobby: Vercel only accepts cron schedules that run at most once a day. The current `vercel.json` has two `*/30` entries, so a Hobby deploy fails with a cron error. If the schedules were changed to daily, the app would deploy, but reminders would be hours late, promise check-ins would land at the wrong time, and bank balances would be up to a day old. Hobby cron timing is also only accurate within the hour.

## 3. Recommendation

Use Vercel Pro and keep `vercel.json` as is, with one change: move notify from daily to every 10 minutes (`*/10 * * * *`). One place to manage, no secret copied into a third-party site, and failures show in Vercel's logs.

Cost: Vercel Pro was $20 per user per month when last known to this audit, plus usage over the included amount. With one person on the team that is about $20 a month. Confirm at https://vercel.com/pricing (could not be fetched here). Pro also allows more cron jobs and 300 second functions, which these routes already ask for (`maxDuration = 300`).

Free alternative if you want to stay on Hobby for now:
1. Replace `vercel.json` crons with one daily job (`/api/cron/notify`, once a day at any hour), which keeps the deploy valid.
2. On cron-job.org (free), make three jobs with the header `Authorization: Bearer <CRON_SECRET>`:
   - `GET https://<site>/api/cron/notify` every 10 minutes
   - `GET https://<site>/api/cron/promises` every 30 minutes
   - `GET https://<site>/api/cron/sync` every 30 minutes
3. Cost: $0. Tradeoffs: the secret lives on a third party, you must watch that site for failed runs, and Hobby is meant for non-commercial use (a paid app with Stripe belongs on Pro under Vercel's terms).

Because the app charges $9.99 a month, Pro is the better fit.

## 4. Does the build touch the database only for production?

Yes, with one caveat. `package.json` `vercel-build` is `tsx scripts/deploy-db.ts && tsx scripts/build-skills.ts && next build`. `scripts/deploy-db.ts` prints a skip message and does nothing when `VERCEL_ENV === "preview"`. Otherwise it runs migrations, memory encryption and demo seeding. So production deploys run them and preview deploys (any pushed branch) do not.

Caveat: the test is "not preview", not "is production". Vercel's third environment, "development" (used by `vercel dev` and `vercel build` with a development target), would also run the steps. This is acceptable because those are only run locally, but if the owner ever sets a custom environment, it would also run them. Safer: change the test to run only when `VERCEL_ENV` is `production` or unset (local). Not changed here (read-only audit).

Other notes:
- A preview build still needs `DATABASE_URL` set for Preview (the app reads it at runtime). Previews share the production database unless the Neon integration gives them a branch (section 11 says it does, as `neondb_owner`).
- The production build needs `ENCRYPTION_KEY` (memory encryption step), and `DEMO_PASSWORD` if `SEED_TEST_ACCOUNT` is set, or the build fails.
- The deploy log must not show "Row-level security will NOT be enforced" (the role warning from `scripts/migrate.ts`).

## 5. Owner's steps (exact clicks in Vercel)

Do these once. Keep values in Vercel only.

1. Open vercel.com, click your project, then Settings, then Environment Variables.
2. Add these first, for Production: `DATABASE_URL` (the pooled string for `budgetflow_app`, checklist section 11), `APP_URL` (`https://lifeflowweb.com`, no trailing slash), `ENCRYPTION_KEY` (`openssl rand -base64 32`), `CRON_SECRET` (`openssl rand -hex 32`), `ADMIN_EMAILS` (your sign-in email).
3. Add `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, the three `LEGAL_*` values, and `ALERT_EMAIL` (your email).
4. Add the optional groups only for what you have set up: Google, Apple, Microsoft, Plaid, VAPID (three rows), Inbox (two rows), Twilio, Stripe (three rows). Leave anything else blank.
5. Do not add `VERCEL_ENV`, `NODE_ENV`, `HQ_URL`, `HQ_KEY` or any test variable.
6. For the crons, pick one:
   - Pro: click your name or team (top left), then Billing (or Settings, then Billing), then Upgrade to Pro. Then ask the product chat to set notify to `*/10 * * * *` in `vercel.json`.
   - Free: ask the product chat for the one-daily-cron `vercel.json`, then make the three cron-job.org jobs in section 3.
7. Go to Deployments, click the three dots on the newest production deployment, click Redeploy.
8. Open the deployment's Build Logs. Check you see the migrations run and no "Row-level security will NOT be enforced" line.
9. Go to Settings, then Cron Jobs (Pro) and confirm the three jobs are listed as enabled. Click Run on `/api/cron/notify`; it should return `"ok": true`.
10. Open `https://lifeflowweb.com/admin` and check the page loads for you (it is a 404 for anyone else).
11. Open Settings, Git, and confirm Production Branch is `main`, so only that branch runs migrations.

## Follow-ups for the product chat (need no owner yes)

- Update `docs/go-live-checklist.md` sections 1, 2 and 5 with the items above.
- Change `deploy-db.ts` to skip unless `VERCEL_ENV` is `production` or unset.
- Set the final `vercel.json` once the owner picks Pro or free.
