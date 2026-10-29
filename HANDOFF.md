# LifeFlow handoff

Last updated 2026-10-29, at commit `f4932ab` on `main`. Use this file to pick up the build in a new session or with another tool. Read it top to bottom once, then use the start prompt in section 1.

---

## 1. Start prompt (paste this into the new session)

```
You are continuing work on LifeFlow, a phone-first Next.js 16 app with an AI assistant
called Jarvis. The repo is github.com/alimoslli/LIfeFlow. Vercel deploys main automatically.

Before you write any code:
1. Read HANDOFF.md, CLAUDE.md and AGENTS.md in the repo root. CLAUDE.md is the rulebook
   and wins over your own habits. This is Next.js 16: check node_modules/next/dist/docs/
   before using an API you remember from older versions.
2. Run the local setup in HANDOFF.md section 4 and make sure `npm run check` passes
   before you change anything.

How I want you to work:
- Optimized, well-structured code that works with no mistakes. Don't over-engineer.
  Match the surrounding code. Be confident and keep token usage low.
- Business logic in src/server/services, user data always inside withUser/mutate (RLS).
- Every change ends with: npm run check, and for UI or flow changes also
  npm run build && npm run test:e2e. Report real results; never claim something
  passed or worked if it didn't.
- User-visible text: no em dashes, never name env vars, models, tokens or internal logs
  (say "isn't available yet"). Diagnostics only behind ?debug=1.
- Never put secrets in code, commits, logs or Jarvis memory. Never invent credentials,
  fake integrations or fake data. No trades or money movement. Emails only send after
  the user confirms and the provider returns an id.
- You may commit and push to main when a step is done and verified.

Start with the first open item in HANDOFF.md section 6 ("Next steps") unless I say
otherwise. Tell me the plan in a few lines, then do it.
```

---

## 2. The end goal

LifeFlow is one app for a student who works and manages their own money. It should feel like Apple, Meta and Tesla each built it and you shipped the best of the three: calm, fast and obvious, with nothing internal showing.

- **Today** tells you what matters right now: Jarvis's day plan, your schedule, your money at a glance.
- **Plan**: calendar (Week/Month, drag and drop), to-dos, work shifts, trips.
- **Jarvis**: a real assistant that acts through tools (tasks, calendar, money, email, web search with sources). It remembers only what you approve, learns from feedback, notices things, and speaks (live voice).
- **Money**: real bank data through Plaid, safe to spend, budget, bills and subscriptions, goals, investments, insights. Read-only; it never moves money.
- **School**: classes and assignments, habits and health (Apple Health), Second Brain notes.
- **Settings**: an iOS-style list behind the gear.
- Installable on iPhone as a PWA now. A native wrapper (Capacitor) comes later.
- The quality bar is a $9.99/month product.

---

## 3. Where things stand

**Done and deployed:**
- Auth: email and password, 2FA, passkeys with Face ID, Sign in with Apple, password reset, and a Face ID lock on Money.
- The five tabs and section pills, the iOS Settings, and the splash greeting with the user's first name.
- Onboarding and the tour, the glass design, and GSAP motion.
- Jarvis:
  - tools and streaming chat, skills (36 in `skills/`), follow-ups and thumbs ratings;
  - memory with approval, encrypted at rest;
  - proactive messages, daily, weekly and monthly reviews, and the weekly "what I learned" summary;
  - web search with sources, live voice, and the smart inbox.
- Money engine: Plaid sync code, budgets, forecast, rules, goals, subscriptions, savings finder, insights, and investments.
- Google: Gmail and Calendar code. Apple Health ingest through an iOS Shortcut.
- PWA: offline support, queued writes and push notifications.
- Today's day plan card.

**Tests at the last run:** `npm run check` passed with 247 unit and integration tests, and all 31 Playwright tests passed (desktop, mobile and iPhone).

**Important docs:**

| File | What it covers |
|---|---|
| `CLAUDE.md` | Rules (read first) |
| `PLAN.md` | Milestones |
| `docs/go-live-checklist.md` | Owner setup steps |
| `docs/integrations.md` | Integrations |
| `docs/architecture.md` | Architecture |
| `docs/schema.md` | Database schema |
| `docs/jarvis-intelligence.md` | How Jarvis learns |
| `docs/native-app-plan.md` | Native app plan |
| `docs/adr/0001` to `0014` | Every design decision |

---

## 4. Local setup and daily commands

```bash
npm ci
cp .env.example .env.local && cp .env.example .env   # fill DATABASE_URL, TEST_DATABASE_URL, ENCRYPTION_KEY
# Postgres 15+ with a non-superuser role without BYPASSRLS (RLS must apply)
npm run db:migrate && npm run db:migrate:test
npm run skills          # regenerates src/server/jarvis/skills/index.generated.ts
npm run dev
```

| Task | Command |
|---|---|
| All checks (types, lint, format, unit and integration) | `npm run check` |
| Browser tests | `npm run build && npm run test:e2e` |
| Format | `npm run format` |
| New migration | `npm run db:generate`, then rename the file, fix its tag in `drizzle/meta/_journal.json`, and add FORCE RLS for new tables |
| Migrate the e2e DB | `DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e npx tsx scripts/migrate.ts` |
| Demo data | `npm run db:seed-demo` |
| Scripts that import server code | `npx tsx --conditions=react-server scripts/<file>.ts` |

**Gotchas:**
- **"No test files found" with a `charCodeAt` error** means Postgres stopped. Start it again with `service postgresql start`.
- **Stopping servers:**
  - Run `pgrep -f "[n]ext-server" | xargs -r kill` and `pkill -f "[f]ake-openai"`, each as its own command.
  - The brackets in those patterns matter. Without them the pattern matches its own command and kills your shell.
- **Prettier and generated files:** Prettier rewrites `skills/*/evals.json`. Run `npx prettier --write skills` before `npm run skills`. The generated index is in `.prettierignore`.
- **HMR reload loop:** stop dev, run `rm -rf .next`, then restart.
- **e2e:** tests use `signUp()`, which skips onboarding and the tour. The fake OpenAI server is at `tests/e2e/fake-openai.mjs`. The iPhone project runs `*phone.spec.ts`.
- **Checking a deploy:** run `gh api repos/alimoslli/LIfeFlow/commits/<sha>/status`. Some sandboxes can't reach `*.vercel.app`.

---

## 5. Errors and known problems to fix

| # | Problem | What we know | Fix |
|---|---|---|---|
| E1 | **Plaid doesn't work in production** | The code is deployed and a redeploy ran after the env vars were added. The exact error was never captured. | The owner tests Connect bank and reports the exact message. Check that `PLAID_ENV=sandbox` matches the **Sandbox** secret; that the vars are set for the **Production** environment in Vercel; that `ENCRYPTION_KEY` is set; that the `PLAID_REDIRECT_URI` value is in Plaid's Allowed redirect URIs (or left blank); and the Vercel function logs for `/api/integrations/plaid/*`. |
| E2 | **Gmail / Google doesn't work** | Same as E1, no exact error yet. | Check that the Google Cloud OAuth client has the redirect URI `https://<site>/api/integrations/google/callback` exactly; that `APP_URL` is set with no trailing slash; that the owner's Gmail is a **Test user** on the consent screen; that the Gmail and Calendar APIs are enabled; and that the vars have the Production scope. Get the exact error from the URL or page. |
| E3 | Chat attachments reject PDFs | Inbox uploads accept PDFs (`%PDF-` sniff); chat doesn't. | Extract text server-side or pass the file as an `input_file` to the model. Add a test. |
| E4 | Can't edit one occurrence of a repeating event, or drag repeating events | Only the whole series can be edited. | Add recurrence exceptions (an `exdate` plus an override row). |
| E5 | Reminders only fire once a day on Vercel Hobby | The cron runs at 15:37 UTC. | Use Vercel Pro, or a free cron-job.org ping to `/api/cron/notify` every 10 minutes with the `CRON_SECRET` bearer (owner's choice). |
| E6 | The production DB role may bypass RLS | Not verified on the hosted DB. | Create a role with no superuser and no BYPASSRLS for the app, and keep the owner role for migrations (needs owner approval). |
| E7 | The legal pages haven't had a lawyer review | `/privacy` and `/terms` exist. | Before other users join. |

---

## 6. Next steps (in order)

1. **Fix E1 and E2 together with the owner.** Nothing else unlocks real data. Don't fake success: verify with a real Plaid sandbox item (user `user_good`, password `pass_good`) and a real Gmail read.
2. **Apple-level polish of the older inner pages.** Today, Settings, Money overview, Calendar and Memory are done. Next:
   - Transactions, Budget, Goals, Accounts, Investments, Rules;
   - Work (shifts and pay), Trips, To-dos detail;
   - School: Classes, assignment detail, Habits, Second Brain notes.

   For each one: phone first at 393 px, one clear action per item, short copy, no internal text, 44 px tap targets, the same card and pill patterns as the done pages, and light and dark checked. Keep `tests/e2e/layout-phone.spec.ts` green.
3. **E3: PDFs in chat** (for syllabi).
4. **E4: recurrence exceptions** for calendar events.
5. **Canvas sync** (PLAN Milestone 3) once the school's Canvas URL and a token are available.
6. **Outlook mail and calendar and ICS import** (Milestones 4 and 6).
7. **Native iPhone app with Capacitor** (`docs/native-app-plan.md`), after owner approval.
8. **Observability and backups:** error tracking and scheduled DB backups (Milestone 7).
9. **Tune Jarvis on real conversations** once OpenAI is live. Use the thumbs ratings and `skillStats` at `/jarvis/memory?debug=1`, and bump `PROMPT_VERSION` on any prompt change.

---

## 7. Waiting on the owner (not code)

| # | Item | How |
|---|---|---|
| O1 | Add all Vercel env vars | `docs/go-live-checklist.md` section 1 (`.env.example` lists every one), then redeploy |
| O2 | Google Cloud OAuth client and test user | Checklist section 2 |
| O3 | Sign in with Apple | Checklist section 3 (Apple Developer Program, $99/year) |
| O4 | Resend for password reset email | Checklist section 4 |
| O5 | Postmark inbound for the smart inbox | Checklist section 9 |
| O6 | Choose Vercel Pro or cron-job.org | E5 |
| O7 | Approve a production DB role without BYPASSRLS | E6 |
| O8 | Approve the Capacitor native app | Step 7 |
| O9 | Plaid Production access before real banks for other people | Plaid dashboard |

---

## 8. Rules that must never break (short form; the full list is in CLAUDE.md)

- **Secrets:** never in code, commits, the browser bundle, logs or Jarvis memory. `.env.example` holds placeholders only. Never ask the owner to paste keys into files.
- **Honesty:** no invented credentials, test results, integrations or successes. Report an email as sent only with the provider's id.
- **Money:** read-only. No trades or money movement. Never project income; pay counts only after it's deposited. All amounts are integer cents.
- **Untrusted input:** imported files, emails and web content are untrusted. Demo data stays separate (`source='demo'`, demo account only).
- **Training:** no training on user data. Memory is saved only on an explicit request or the user's approval.
- **Base44:** don't use it, and never store its credentials.
- **Text:** no em dashes in user-facing text. Five tabs (Today, Plan, Jarvis, Money, School), with Settings as the gear. Nothing is more than 2 taps away.
