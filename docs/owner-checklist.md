# LifeFlow: owner to-do list (copy into your notes)

Rules: never paste keys or passwords into chat, GitHub or code. They only go in Vercel (or the service's own dashboard).
Details for each service are in `docs/go-live-checklist.md` in the repo. This list says what to do and in what order.

Tip: after each deploy, open **/admin → Health**. It shows which integrations are "Set up" and which are "Not set up", so you can see what's left.

---

## PART 1. Get the newest code live (do this first, 15 min)

- [ ] 1. **Merge the branch into main.** GitHub → alimoslli/LIfeFlow → Pull requests → New → base `main`, compare `claude/lifeflow-ad-reel-higgsfield-s3r3v1` → Create → Merge. (Or ask me to open the pull request.)
  - It contains: the admin page, "1:00 – 2:15 PM" on the Today card, account suspension, and all the marketing files.
- [ ] 2. Vercel → your project → Settings → Git → confirm **Production Branch = main**.
- [ ] 3. Vercel → Settings → Environment Variables → add (Production):
  - `ADMIN_EMAILS` = the email you sign in to LifeFlow with (e.g. `alimoslli5@gmail.com`)
- [ ] 4. Deployments → ⋯ → **Redeploy**. When it finishes, open the build log and check:
  - [ ] it says "Migrations applied"
  - [ ] it does NOT say "Row-level security will NOT be enforced" (if it does, see PART 8, database role)
- [ ] 5. In LifeFlow (signed in as you): Settings → Face ID & passwords → turn on **two-step sign-in** or **add a passkey**. (The admin page stays hidden until you do.)
- [ ] 6. Open `https://<your-site>/admin`. You should see the dashboard. Open it in a private window while signed out: you should get "page not found".
- [ ] 7. Set up an **uptime monitor** (free): uptimerobot.com → New monitor → HTTP(s) → `https://<your-site>/api/health` → every 5 minutes → alert to your email/phone. (It answers 503 when the database is down.)
- [ ] 8. Production safety check: in Vercel env vars make sure **`SEED_TEST_ACCOUNT` is NOT set** (or, if it is, that `DEMO_PASSWORD` is long and secret). Otherwise a demo account with a known login could exist on your live site.

---

## PART 2. Vercel environment variables (check each one exists, Production)

Vercel → Settings → Environment Variables. After any change: Redeploy.

**Must have before real users**
- [ ] `DATABASE_URL`: the pooled connection string for the `budgetflow_app` role (not `neondb_owner`)
- [ ] `APP_URL`: `https://<your-site>` (no trailing slash; must match exactly)
- [ ] `ENCRYPTION_KEY`: `openssl rand -base64 32`. Don't change it later or saved tokens break
- [ ] `OPENAI_API_KEY`: from platform.openai.com/api-keys (chat + voice). Also set a monthly spend limit in the OpenAI dashboard
- [ ] `CRON_SECRET`: `openssl rand -hex 32`
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` (password-reset emails; see PART 3)
- [ ] `ALERT_EMAIL`: where crash alerts go (your email)
- [ ] `FEEDBACK_EMAIL`: where tester feedback goes (can be the same)
- [ ] `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_STATE`: shown on /privacy and /terms
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: run `npx web-push generate-vapid-keys` once; subject = `mailto:you@yourdomain`
- [ ] `ADMIN_EMAILS`: from PART 1

**Turn on when you're ready for that feature** (blank = feature stays off, no fake buttons)
- [ ] Payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (PART 3)
- [ ] Banks: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox` now, `production` later), optional `PLAID_REDIRECT_URI`
- [ ] Gmail + Calendar + Sign in with Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Sign in with Apple: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (whole .p8 file, with BEGIN/END lines)
- [ ] Texting the assistant: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- [ ] Email forwarding inbox: `INBOX_DOMAIN`, `INBOX_WEBHOOK_SECRET`
- [ ] Optional: `WEBAUTHN_RP_ID` (decide BEFORE people add passkeys), `OPENAI_MODEL`, `OPENAI_SEARCH_MODEL`, `OPENAI_REALTIME_MODEL`, `JARVIS_PRICE_*` (cost estimates), `CANVAS_BASE_URL`

---

## PART 3. Services to set up (in this order)

### 3a. Email: Resend (needed for password resets and crash alerts)
- [ ] resend.com → Domains → add your domain → add the DNS records they show → wait for "Verified"
- [ ] API Keys → create → paste as `RESEND_API_KEY`; set `EMAIL_FROM` = `LifeFlow <no-reply@yourdomain.com>`
- [ ] Test: Forgot password on your site → email arrives → link works

### 3b. Payments: Stripe
- [ ] Product catalog → create product **LifeFlow Pro** with a monthly price → copy the price id (`price_...`) → `STRIPE_PRICE_ID`
- [ ] Developers → API keys → secret key → `STRIPE_SECRET_KEY`
- [ ] Developers → Webhooks → add `https://<your-site>/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → copy signing secret → `STRIPE_WEBHOOK_SECRET`
- [ ] **Student coupon (needed before the posters go up):** Product catalog → Coupons → New → **15% off** → pick how long it lasts (once / months / forever) → after saving, add a **Promotion code** with the exact text `LifeFlowLaspo` (optional: limit the number of uses). Checkout already accepts promo codes.
- [ ] Test in Stripe **test mode** with card `4242 4242 4242 4242` and the coupon, then switch to live mode and repeat with the live keys
- [ ] Stripe → Settings → Business → turn on email receipts and failed-payment emails

### 3c. Scheduled jobs on time: cron-job.org (free)
- [ ] New job every **10 minutes**: `GET https://<your-site>/api/cron/notify`, header `Authorization: Bearer <your CRON_SECRET>`
- (Vercel's own cron for `/api/cron/sync` is already in `vercel.json`.)

### 3d. Google (Gmail + Calendar + Sign in with Google): console.cloud.google.com
- [ ] New project → enable **Gmail API** and **Google Calendar API**
- [ ] OAuth consent screen → External → name LifeFlow → privacy `https://<site>/privacy`, terms `https://<site>/terms` → scopes `gmail.readonly`, `gmail.compose`, `calendar.events` → keep **Testing** → add testers (your Gmail first)
- [ ] Credentials → OAuth client ID (Web) → add BOTH redirect URIs:
  - `https://<site>/api/integrations/google/callback`
  - `https://<site>/api/auth/google/callback`
- [ ] Paste Client ID/Secret into Vercel → redeploy → in LifeFlow Settings → Connected accounts → Connect Google
- [ ] Later, for other people's Gmail: submit the app for **Google verification** (sensitive/restricted scopes; takes weeks, may need a security review). Until then only listed test users can connect Gmail.

### 3e. Banks: Plaid (dashboard.plaid.com)
- [ ] Use **sandbox** first. Test bank login: `user_good` / `pass_good`
- [ ] Before real banks for other people: **request Production access** (they ask about your use case, privacy policy and security), then set `PLAID_ENV=production` with the production secret
- [ ] Optional for bank logins on phones: `PLAID_REDIRECT_URI` = `https://<site>/plaid-oauth` and add the same URL under Allowed redirect URIs in Plaid

### 3f. Sign in with Apple (needs the $99/year Apple Developer Program)
- [ ] Follow `docs/go-live-checklist.md` section 3 (App ID, Services ID, key .p8, Team ID)

### 3g. Texting the assistant: Twilio (optional)
- [ ] Buy an SMS number; register for A2P 10DLC (US business texting; Twilio guides you)
- [ ] Number's "A message comes in" → Webhook POST `https://<site>/api/sms/inbound`
- [ ] Add the three `TWILIO_*` vars → redeploy → Settings → Text → add your number

### 3h. Email forwarding inbox: Postmark (optional)
- [ ] MX record for `in.yourdomain.com` → `inbound.postmarkapp.com` (priority 10); Postmark Inbound webhook `https://<site>/api/inbox/email?key=<INBOX_WEBHOOK_SECRET>`; set `INBOX_DOMAIN`

---

## PART 4. Legal and trust (before strangers sign up)
- [ ] Lawyer (or a service like Termly/iubenda) reviews **/privacy** and **/terms**. The app handles bank, health and email data, so don't skip this.
- [ ] Fill `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_STATE`
- [ ] Make sure the support email in those pages is one you actually read (suspended users are told to contact support)

---

## PART 5. Your database (Neon)
- [ ] Confirm the live app connects as **`budgetflow_app`**, not `neondb_owner` (owner skips the row-level security that keeps users' data separate). Steps: `docs/go-live-checklist.md` section 11.
- [ ] Neon → check backups / point-in-time restore is on and note the retention period
- [ ] Neon → turn on usage alerts so a full or paused database doesn't surprise you

---

## PART 6. Instagram and marketing
- [ ] **Create the `LifeFlowLaspo` coupon in Stripe BEFORE printing anything** (PART 3b), then test it at checkout
- [ ] Re-post grid post 3 ("One assistant. For all of it.") using the full-size crop (the expand icon), so all five chips show
- [ ] Add a caption to every post (copy from the chat; tell me your "why I built this" line and I'll rewrite them with it)
- [ ] Archive the three old, large first-grid posts at the bottom (⋯ → Archive) if you want the profile to show only the new set
- [ ] Profile: bio link = lifeflowweb.com; add the **Instagram QR** and **website QR** to the poster (already done in poster v2)
- [ ] Print the poster: use the PDF in the print zip (18×24 in); do a single test print first and scan both QR codes with a phone
- [ ] Tell testers what you want them to try and where to send feedback (Settings → Send feedback goes to `FEEDBACK_EMAIL`)
- [ ] Check "Spots are limited / may close soon" is really true (or remove that line from posts and the poster)

---

## PART 7. iPhone app (later; needs a Mac with Xcode + Apple Developer Program)
- [ ] Follow `docs/go-live-checklist.md` section 9d (Capacitor, bundle id, icon, TestFlight)
- [ ] Apple requires in-app purchase for subscriptions sold inside the app, so the app hides web checkout for now
- [ ] Bio currently says "Coming soon to the Apple Store": keep that only if you're really doing it

---

## PART 8. Routine (every week or two)
- [ ] Open /admin: check Errors (clear the ones you've dealt with) and Health
- [ ] Check OpenAI usage/spend and Stripe for failed payments
- [ ] Read tester feedback emails
- [ ] Never share the admin login; keep two-step sign-in on

---

## Things I (Claude) can do for you. Just ask
- [ ] Open the pull request from the branch into main (and merge when you say so)
- [ ] Fix the leftover hard-coded name labels ("From Jarvis" filter, "Message Jarvis" box, "Jarvis" page titles) so they use your chosen assistant name
- [ ] Rename "Came in" on the Money screens to something clearer (for example "Money in")
- [ ] Fix the "Build my budget" list where category names get squeezed on narrow phones
- [ ] Add a Microsoft Teams connector (the checklist/story images only show what's built)
- [ ] Add cross-user usage and cost totals and a feedback inbox to /admin (needs a careful change to how that private data is protected)
- [ ] Rewrite the Instagram captions with your personal story
- [ ] Re-render any video/poster/story with new copy or numbers
- [ ] Review your Vercel/Stripe/Google settings if you paste me the NAMES of what's set (never the values)
- [ ] Update this list whenever something changes
