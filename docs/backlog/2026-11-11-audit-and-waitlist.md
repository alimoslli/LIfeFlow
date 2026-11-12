# Audit and waitlist backlog (owner, 2026-11-11)

The owner's brief from an outside audit, kept whole so nothing is lost. Work it **one small step per session**, on its own branch, and stop. Nothing here is merged, deployed, switched on for real users, sent or charged until the owner says so. Owner: LF COO (with LF Main for app screens).

## The owner's answers (2026-11-11)

- **Order:** the waitlist first, then the engineering items.
- **People who already have accounts** join the waitlist in sign-up order. The owner accepts the ones he wants in HQ before he switches the waitlist on, so nobody loses access until he flips it. He, the other admins and the demo account are always in. "The first person will be the first person that signed up after them. From there on, first, second, third, fourth." He approves people from HQ and everyone below moves up.
- **Price line on the waitlist page:** a free trial and a student offer are planned (no dates, amounts or codes). This replaces "no free term" in the price rule.
- **Referrals count only after the friend confirms a 6-digit email code** at sign-up (sign-up doesn't check emails today).

## How this fits our rules

- The waitlist page and the preview are new screens: a picture first, built after the owner's yes (CLAUDE.md, product rules).
- Accounts and access live on `users` (no RLS, like invites); per-user content stays behind RLS. Admin reads go through `services/admin.ts`, every admin change writes `admin_actions` and refuses the demo account.
- Migrations on a long-lived branch take a number and a `when` with room (0061, `when` 1798000000000) and are renumbered at merge if main has passed it (Drizzle skips an older `when`).
- Tests use local databases, fixtures and the fake model. No paid calls, no production data.

## Waitlist steps (in order)

1. **Foundation** (data and rules, no screens, nothing switched on): `users.access` (`waiting`/`in`), `waitlist_rank`, `accepted_at`; existing accounts ranked by sign-up; new accounts at the end; the owner switch `app_access.waitlist_on` (off). `services/waitlist.ts`: has access, position, accept (atomic, safe to retry), move up one place. Tests.
2. **HQ: accept people** in People: counts, search, the queue with referrals, the next batch preview, batch size, explicit confirm, accept one by hand, audit history, the switch and the launch note (still off).
3. **The gate**: waiting people reach only their waitlist page and account, security, privacy and deletion controls. Enforced on pages, APIs, actions, AI tools (chat, voice, SMS, background), integrations and crons. Admin and accepted users unaffected. Tests for each door.
4. **Waitlist page**: picture first. Position, referrals (counted and pending), invite link with copy and share, top 10 and their own place separately, the rules in plain words, real counts only, tentative launch note, a link to the preview, reduced motion and screen-reader text.
5. **Email code at sign-up and referral boosts**: each confirmed friend moves the referrer one place up (ahead of the person just above; first stays first; nothing banked), once, atomically under concurrent sign-ups; no self, duplicate or recycled accounts; rate-limited; attribution kept through Google/Apple sign-up.
6. **Leaderboard privacy**: anonymous labels and avatars by default, optional nickname; never emails, full names or a list of everyone.
7. **Read-only preview**: picture first. The wheel, timeline, sky and characters with labelled sample days (classes, shifts, deadlines, bills connecting), scrub time, a clear way back to their place. No shared demo account, real records, live integrations or paid AI; scripted assistant lines are labelled examples.
8. **Notification previews and the full check**: prepared, never sent automatically. Tests: access, redirects, admin/beta access, referrals, first place, batch retries, privacy, preview isolation, no paid calls; phone layouts, keyboard, contrast, screen readers, reduced motion. Rollout and migration instructions for the owner.

Goal: close public access while building excitement for a tentative January 2027 App Store launch, then let people in in batches. Access is separate from the subscription: being accepted gives app access, never a paid plan.

## Engineering backlog (after the waitlist; check each still exists first)

1. **Money totals and exports.** `queryTransactions` defaults to 500 rows and caps at 5,000 (checked 2026-11-11: still true, `services/finance/transactions.ts`; budgets in `planning.ts` pass no limit, others ask for 20,000 and get 5,000). 6,000 one-dollar expenses showed $500 in Budgets and $5,000 in Money. Separate complete sums (in SQL) from paginated lists, keep the transfer, refund, reimbursement, pending and excluded rules, test 500/501 and 5,000/5,001, and stream complete CSV exports.
2. **Authorization and retries.** Voice tools need an authenticated server-issued voice session bound to the user and conversation, plus consent, plan, account and spending checks; a repeated voice `callId` returns the first result without doing it twice. Suspended accounts can't use SMS; incoming provider message ids are de-duplicated. The same limits across chat, voice, SMS and background AI. Keep RLS, ownership checks and confirmations.
3. **Offline reliability and privacy.** Replay in creation order, batches within the server's 100-operation limit, keep dependencies, retry temporary failures instead of dropping unsaved work, scope operations to the account and refuse replay after an account switch, await transactions and close IndexedDB, handle blocked deletion and several tabs at sign-out. Review private-page caching, session expiry, account switches and the Money lock. A clear way to recover failed changes.
4. **AI costs.** One usage ledger for chat, SMS, voice, web search, document reading and transaction tidying; per-account allowances, global spending thresholds and atomic budget reservations before paid work; unknown costs stay unknown; reconcile with provider billing; voice limits enforced server or provider side. Keep cheaper-model routing, caching, bounded loops and deterministic math. Check "unlimited" claims.
5. **Scale and operations.** Crons as durable bounded work units with retries, idempotency, progress and failure reports; chat history bounded in SQL with incremental recovery polling; profile Today and Money with realistic histories and prefetch cost; fewer network waits inside transactions; review connection budgets, log retention and monitoring. Keep the architecture unless measurements say otherwise.
6. **Verification and maintenance.** The two full-suite failures in `plaid-cron-webhook.test.ts` (all six pass alone: order or isolation; on 2026-11-11 the full suite passed, 179 files, so it's intermittent). CI checks; stale docs. Focused checks per step, broader checks at milestones, exact results.
7. **Product and UX proposals** (separately, as pictures, before any design change): useful outcomes earlier in onboarding, product proof above the long mascot section, a clearer Today agenda and action view, prominent manual entry, balance freshness and forecast explanations, visible sync and reconnect states, contrast fixes. Correct claims like "always asks before changing anything" to match what happens. Later: activation, cohort retention and cost per active user in the existing analytics, focused on working students and classes, shifts and bills. No speculative growth features.

## Working rules for this backlog

Keep it intact and say what's deferred; one small step per session; concise explanations and meaningful tests; flag big infrastructure or product decisions first; a dedicated branch, never merged, deployed, switched on, accepted, sent or charged without the owner; at review milestones show screenshots, test results, risks and rollout steps; never invent results, credentials, prices or performance claims.

## Progress

| Step | Where | Status |
| --- | --- | --- |
| Waitlist 1. Foundation | main | live 2026-11-11 (switch off until the owner turns it on in HQ) |
| Waitlist 2. HQ: let people in | main | live: People › Waitlist (counts, the line, next batch with confirm, one at a time, switch, launch line, history) |
| Waitlist 3. The gate | main | live: after setup, someone waiting reaches only /waitlist and their account, security and privacy pages; pages, APIs, actions, jobs, texts, Apple Health and forwarded email skip them |
| Waitlist 4. The page | main | live: the night page with the line of skylings, the front of the line (anonymous), the rules, the invite card at the bottom; admin preview `?preview=1` |
| Waitlist 5. Email code and referral boosts | main (2026-11-12) | live. Owner: yes, keep a deleted account's email fingerprint (one privacy line); no, friends who joined through a link before launch don't count (`users.referral_counts`). Security review: no blockers, its two fixes in. Check 1,559/1,559, desktop e2e 72/72, phone specs 9/9. |
| Waitlist 6. Nicknames | `claude/waitlist-nicknames` | in progress: an optional nickname on the page; anonymous labels stay the default; reviewed before any merge |
| Waitlist 7. Read-only preview | `docs/design/2026-11-11-preview/` | picture ready (four pictures and three questions for the owner's yes); nothing built |
| Waitlist 8. Notification previews and the full check | | next |
| Engineering 1. Money totals and exports | `claude/money-totals` | reviewed twice, fixes in; screen tests running |
| Engineering 2. Voice and texting | `claude/voice-sms-guard` | reviewed, fixes in; full suite rerunning |
| Engineering 3. Offline | main | live (reviewed; 23 screen tests) |
| Engineering 4. AI costs | `docs/audits/2026-11-11-ai-cost-ledger-proposal.md` | proposal; 11 yes/no decisions for the owner |
| Engineering 5. Scale | `docs/audits/2026-11-11-scale-measurements.md` | measured; recommendations listed |
| Engineering 6. Tests and CI | main | live (flaky Plaid test fixed at the cause, GitHub check workflow) |
| Engineering 7. UX proposals | `docs/design/2026-11-11-proposals/` | 7 pictures and 9 claims to correct, for the owner's yes |
