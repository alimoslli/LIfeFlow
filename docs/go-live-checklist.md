# Go-live checklist (owner)

Everything below is already built in the code. These are the settings to add so it connects for real.
Never paste these values into code, chat, or GitHub. They go only in Vercel.

## 1. Vercel environment variables
Vercel → project → Settings → Environment Variables. Set each for **Production** (Preview only needs `DATABASE_URL`). Then Deployments → ⋯ → Redeploy.
Every name the app reads is below (checked against the code on 2026-11-10). Anything left blank stays off and the app says so (no fake buttons).

**A. Required: the app doesn't run properly without these**

| Variable | What to put | Turns on |
|---|---|---|
| `DATABASE_URL` | The pooled connection string for the `budgetflow_app` role (section 11), not the owner role | Everything; production deploys also run the migrations with it |
| `APP_URL` | `https://lifeflowweb.com` (no slash at the end) | Reset and email links, Google, Apple, passkeys, Plaid on phones, Twilio |
| `ENCRYPTION_KEY` | Run `openssl rand -base64 32` once and paste it. **Never change it later**: saved connections and memories become unreadable | Connections, memories, two-step sign-in |
| `CRON_SECRET` | `openssl rand -hex 32` | The four scheduled jobs (bank sync and promises every 30 min, reminders every 10, stars every 5); without it they return 401 |
| `ADMIN_EMAILS` | Your sign-in email (several: separate with commas) | /admin and HQ (empty means a 404 for everyone) |

**B. The assistant (OpenAI)**

| Variable | What to put | Turns on |
|---|---|---|
| `OPENAI_API_KEY` | Your OpenAI key | Chat, voice, the inbox reader, tidying, web search |
| `OPENAI_MODEL` | Optional. Leave blank for `gpt-5.5` | The model for planning, money decisions and anything unclear |
| `OPENAI_MODEL_SMALL` | Optional. Leave blank for `gpt-5.4-mini` | The cheaper model for small things (lookups, adds) |
| `JARVIS_PRICE_INPUT_PER_MTOK` | `5` | The cost per question in Admin › App (blank shows "not measured") |
| `JARVIS_PRICE_CACHED_INPUT_PER_MTOK` | `0.5` | Same |
| `JARVIS_PRICE_OUTPUT_PER_MTOK` | `30` | Same |
| `JARVIS_PRICE_SMALL_INPUT_PER_MTOK` | `0.75` | Same, for the small model |
| `JARVIS_PRICE_SMALL_CACHED_INPUT_PER_MTOK` | `0.075` | Same |
| `JARVIS_PRICE_SMALL_OUTPUT_PER_MTOK` | `4.5` | Same |
| `OPENAI_REALTIME_MODEL` | Optional, blank for `gpt-realtime` | Voice |
| `OPENAI_SEARCH_MODEL` | Optional, blank for the main model | Web search (prices, cancel steps) |
| `OPENAI_REASONING_EFFORT` | Optional, blank for `auto`. Only `auto`, `none`, `minimal`, `low`, `medium` or `high` | How hard it thinks |
| `OPENAI_PROMPT_CACHE_RETENTION` | Optional, blank for `24h`. Only `24h` or `in_memory` | Cheaper repeated questions |
| `OPENAI_BASE_URL` | Leave blank (only for a gateway) | — |

Prices are US dollars per million tokens, numbers only (no `$`, no commas). Check them against openai.com/api/pricing once.

**C. Sign-in**

| Variable | What to put | Turns on |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 2 | Sign in with Google, Gmail, Google Calendar |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | From step 3. The key can be pasted with real line breaks or with `\n` | Sign in with Apple |
| `WEBAUTHN_RP_ID` | Leave blank (only for passkeys across a parent domain) | Passkeys |

**D. Email**

| Variable | What to put | Turns on |
|---|---|---|
| `RESEND_API_KEY` / `EMAIL_FROM` | From step 4. `EMAIL_FROM` like `LifeFlow <hello@lifeflowweb.com>`, on a domain verified in Resend | Password reset, sign-in codes, notices |
| `ALERT_EMAIL` | Your email | Error alerts (falls back to `LEGAL_CONTACT_EMAIL`) |
| `FEEDBACK_EMAIL` | Your email, optional | A copy of feedback by email |
| `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_STATE` | Your name, contact email, US state | /privacy and /terms |

**E. Connections**

| Variable | What to put | Turns on |
|---|---|---|
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | dashboard.plaid.com → Developers → Keys (the secret must match the environment) | Banks |
| `PLAID_ENV` | `sandbox` now; `production` once Plaid approves. Anything else counts as sandbox | Banks |
| `PLAID_REDIRECT_URI` | Optional, `https://lifeflowweb.com/plaid-oauth`, also added in Plaid's dashboard | Banks that sign in on their own site, on phones |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | From step 2b (after Entra) | Teams and Outlook calendar |
| `MICROSOFT_TENANT` | Leave blank (`common`) | — |
| `CANVAS_BASE_URL` | Optional, your school's Canvas address | The Canvas card |

**F. Notifications, inbox, texting, payments**

| Variable | What to put | Turns on |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Run `npx web-push generate-vapid-keys` once. **Don't change them later**: everyone's notifications stop | Push notifications |
| `VAPID_SUBJECT` | `mailto:` plus your email | Push notifications |
| `INBOX_DOMAIN` / `INBOX_WEBHOOK_SECRET` | Step 9; the secret from `openssl rand -hex 24` | Forward-a-bill inbox |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Step 9b | Texting the assistant, phone sign-in |
| `TWILIO_WHATSAPP_NUMBER` | Optional | WhatsApp |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Step 9c. Until all three are set, everything stays unlocked | Pro payments |

**G. Owner tools (optional)**

| Variable | What to put | Turns on |
|---|---|---|
| `HQ_DESK_FIRE_URL` / `HQ_DESK_FIRE_TOKEN` | From the "LifeFlow desk task starter" scheduled task's API trigger | The "Start it" button on HQ's desk |
| `SEED_TEST_ACCOUNT` / `DEMO_EMAIL` / `DEMO_PASSWORD` | `keep` or `refresh`, an email, a password of 10+ characters. Leave all three blank to skip. A short or missing password with the seed on fails the deploy | The demo account |

**Don't add:** `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NODE_ENV`, `NEXT_RUNTIME` (Vercel sets them); `HQ_URL`, `HQ_KEY` (Claude Code chats, not the app); `CAP_SERVER_URL` (the iPhone build on a Mac); `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `PROVIDER_TIMEOUT_MS`, `ACTION_RUN_LIMIT_MS` (tests only).

**Mistakes that break things quietly:** a `$` or comma in a price (the assistant stops with "Invalid server environment"); a model setting that isn't one of the listed values; a slash at the end of `APP_URL`; a new `ENCRYPTION_KEY` or VAPID pair after people use the app; a Plaid secret from the other environment; `DATABASE_URL` with the owner role (the deploy log then says "Row-level security will NOT be enforced"). The scheduled jobs run every 5 to 30 minutes, which needs Vercel Pro.

## 2. Google Cloud (console.cloud.google.com)
1. New project → APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen → External → name LifeFlow → Privacy `https://yoursite/privacy`, Terms `https://yoursite/terms` → scopes `gmail.readonly`, `gmail.compose`, `calendar.events` → keep **Testing** → add your Gmail as a **test user**.
3. Credentials → Create OAuth client ID → Web application → redirect URI `https://yoursite/api/integrations/google/callback`.
4. Copy Client ID and Secret into Vercel, redeploy.
5. In LifeFlow: Settings → Integrations → Connect Google (keep all boxes checked).

Testing mode may ask you to reconnect about weekly. Other users' Gmail needs Google verification.

## 2b. Microsoft Teams and Outlook (entra.microsoft.com)
1. Sign in at entra.microsoft.com with a Microsoft account (create a free one if needed). App registrations → New registration.
   - Name: LifeFlow
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Web, `https://lifeflowweb.com/api/integrations/microsoft/callback`
2. Overview: copy the **Application (client) ID** → Vercel `MICROSOFT_CLIENT_ID`.
3. Certificates & secrets → New client secret (24 months) → copy the **Value** right away → Vercel `MICROSOFT_CLIENT_SECRET`. Put a reminder in your calendar to renew it before it expires.
4. API permissions → Add → Microsoft Graph → Delegated: `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Calendars.Read`. (No admin-only permissions, so most students can connect themselves.)
5. Branding & properties: name LifeFlow, logo, home page `https://lifeflowweb.com`, privacy `https://lifeflowweb.com/privacy`, terms `https://lifeflowweb.com/terms`.
6. Optional but recommended: Branding → Publisher verification (needs a Microsoft Partner Network ID). Without it, users see "unverified" on the consent screen, and some schools block unverified apps.
7. Redeploy. Settings → Connected accounts → Connect Microsoft. If a school blocks it, the user sees a message to ask IT or send a screenshot instead.

## 3. Sign in with Apple (developer.apple.com, needs the $99/year Apple Developer Program)
1. Certificates, Identifiers & Profiles → Identifiers → **App IDs** → new → enable **Sign in with Apple**.
2. Identifiers → **Services IDs** → new, e.g. `app.lifeflow.web` (this is `APPLE_CLIENT_ID`) → enable Sign in with Apple → Configure:
   - Primary App ID: the one from step 1
   - Domains: `yoursite.vercel.app` (no https)
   - Return URLs: `https://yoursite.vercel.app/api/auth/apple/callback`
3. Keys → new → enable **Sign in with Apple** → download the `.p8` (only once). The Key ID is `APPLE_KEY_ID`.
4. Your Team ID (top right of the developer site) is `APPLE_TEAM_ID`.
5. In Vercel, paste the whole `.p8` file contents (including the BEGIN/END lines) as `APPLE_PRIVATE_KEY`. Redeploy.
6. The "Sign in with Apple" button then appears on the sign-in and sign-up pages, and Settings → Security can link it.

## 4. Password reset email (resend.com, free tier is enough)
1. Add and verify your domain (Resend shows the DNS records). Without your own domain, use Resend's test sender, which can only email you.
2. API Keys → create → `RESEND_API_KEY`. Set `EMAIL_FROM` to e.g. `LifeFlow <no-reply@yourdomain.com>`.

## 5. Notifications on time (optional, free)
Vercel Hobby runs scheduled jobs once a day. For reminders at the minute you pick:
1. cron-job.org → create a job every 10 minutes: `GET https://yoursite/api/cron/notify`
2. Add a request header `Authorization: Bearer <your CRON_SECRET>`.
(Vercel Pro can run `/api/cron/notify` every few minutes instead.)

## 6. Apple Health (iPhone)
Settings → Integrations → Apple Health → Create a key (shown once) → follow "How to set up the Shortcut" → add a daily Automation.

## 7. On your iPhone
1. Open the site in Safari → Share → **Add to Home Screen** → open LifeFlow from the icon.
2. Settings → Notifications → **Turn on notifications** → Send a test.
3. Settings → Security → **Add a passkey** (Face ID). Optionally turn on **Lock Money with Face ID**.

## 9. Smart inbox email forwarding (postmarkapp.com, free tier is enough to start)
1. Pick a subdomain just for this, e.g. `in.yourdomain.com`. In your DNS, add an **MX** record for it pointing to `inbound.postmarkapp.com` (priority 10).
2. Postmark → Servers → your server → **Inbound** stream → Settings:
   - Inbound domain: `in.yourdomain.com`
   - Webhook URL: `https://inbox:<your INBOX_WEBHOOK_SECRET>@yoursite/api/inbox/email` (Postmark sends the part before `@` as basic auth, so the secret stays out of access logs; the old `?key=` form still works for now but is deprecated)
3. In Vercel set `INBOX_DOMAIN=in.yourdomain.com` and `INBOX_WEBHOOK_SECRET`, redeploy.
4. In LifeFlow: Plan → Inbox shows your address. Add the email you'll forward from (Apple sign-in emails are trusted automatically; others get a 6-digit code, which needs step 4's Resend setup).
5. Forward a bill to the address. It shows up in the Inbox as Filed, with Undo. Mail from any other sender, or mail that fails SPF/DKIM, shows as Ignored with the reason.

## 9b. Text Jarvis by SMS (twilio.com)
1. Create a Twilio account and buy a phone number that can send SMS (US numbers need A2P 10DLC registration for business texting; Twilio walks you through it).
2. In Vercel add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (Console home) and `TWILIO_PHONE_NUMBER` (like +14045550134). `APP_URL` must be set.
3. In Twilio, open the number → Messaging → "A message comes in" → Webhook, HTTP POST: `https://<your-site>/api/sms/inbound`.
4. Redeploy. In LifeFlow: Settings → Text Jarvis → add your number → enter the code.

## 9c. LifeFlow Pro payments (stripe.com)
1. Create a Product "LifeFlow Pro" with a monthly price (and a student coupon if you want one). Copy the price id (`price_...`).
2. Developers → API keys: copy the secret key. Developers → Webhooks: add `https://<your-site>/api/billing/webhook` with `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret.
3. In Vercel add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, then redeploy. Settings → Plan appears. Test with Stripe's test card 4242 4242 4242 4242 in test mode first.

## 9d. iPhone app (needs a Mac with Xcode and the $99/year Apple Developer Program)
1. On the Mac, in the project folder: `npm ci`, then `CAP_SERVER_URL=https://<your-site> npx cap add ios` (first time only, commit the new `ios/` folder).
2. `CAP_SERVER_URL=https://<your-site> npm run ios` opens Xcode. Set your Team, the bundle id (`app.lifeflow` or your own, it can't change after the first upload) and the app icon.
3. Run on your iPhone, then Product → Archive → upload to TestFlight for friends.

## 10. Check it works
- Chat with the assistant, then tap the mic for a voice call.
- Google card shows "Connected"; ask "what's in my inbox?"
- Money → Connect a bank (Plaid sandbox: `user_good` / `pass_good`).
- Sign out, then sign in with Face ID, and with Apple.
- Forgot password → the email arrives → the link sets a new password.
- Money → Save money → Find cheaper on a phone or internet bill: options appear only with a source link.
- Plan → Inbox: forward a bill and add a photo of a receipt; both are filed and Undo works.
- Today shows a Jarvis card; Settings → Assistant changes his tone and the preview follows.
- Apple Health card shows "Receiving data" after the Shortcut runs.

## 11. Database role (done for production on 2026-10-29)
The app must not connect as Neon's `neondb_owner`: it has BYPASSRLS, so row-level security is skipped. Production uses `budgetflow_app` instead. For a new Neon project, run as `neondb_owner` in the SQL Editor:
1. `CREATE ROLE budgetflow_app LOGIN PASSWORD '<long random>';` (created with SQL, so it gets no BYPASSRLS).
2. `GRANT budgetflow_app TO neondb_owner WITH INHERIT TRUE, SET TRUE;` (Postgres 16+ needs this before ownership can be handed over).
3. `GRANT CONNECT, CREATE ON DATABASE neondb TO budgetflow_app;` (CREATE because the migrator runs `CREATE SCHEMA IF NOT EXISTS "drizzle"` on every deploy), `GRANT USAGE, CREATE ON SCHEMA public TO budgetflow_app;`, `ALTER SCHEMA drizzle OWNER TO budgetflow_app;`
4. `ALTER TABLE … OWNER TO budgetflow_app` for every table and sequence in `public` and `drizzle`.
5. Set Vercel `DATABASE_URL` (Production) to the pooled connection string with `budgetflow_app` and its password, and redeploy. The deploy log must not show "Row-level security will NOT be enforced".

Preview branches made by the Neon integration still connect as `neondb_owner`; that's fine for test data.

## Later
- Lawyer review of /privacy and /terms before other users join.
- Plaid Production access before connecting real banks for other people.
- Update git remote to `alimoslli/LIfeFlow` (GitHub redirect works meanwhile).
