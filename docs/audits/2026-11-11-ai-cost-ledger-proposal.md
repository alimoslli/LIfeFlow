# AI costs: one usage record, allowances and spending limits (proposal)

Date: 2026-11-11. Engineering backlog item 4 (`docs/backlog/2026-11-11-audit-and-waitlist.md`). Status: proposal only, nothing built. Read from main at 3c5df747 plus the then-unmerged `claude/voice-sms-guard`. Voice facts about OpenAI come from search results and must be checked against OpenAI's docs before building.

## In short (for the owner)

- Today only typed chat has a measured cost, and only when model prices are set. Texting, voice, web search, document reading and tidying transactions aren't counted in dollars; some aren't counted at all.
- The $4-a-month testing cap has holes: texting skips it, deleting a chat resets it, and without prices it counts nothing. Requests running at the same time can all pass. After paid plans turn on there is no dollar limit at all.
- The plan page says "Unlimited messages", and an error says "Pro has no daily limit". Both are false: everyone is held to 400 messages a day. (The plan page is hidden until Stripe is set up.)
- Proposal: one record of every paid AI use; a monthly allowance per person; a company-wide monthly and daily ceiling. Before any paid AI work starts, the app sets the estimated cost aside in one database step; if that would go over a limit, the work doesn't start. Voice calls are ended by our server at the time limit. Once a month we compare our record with OpenAI's bill.
- Nothing changes for people until you say yes to the numbers in section 8.

## 1. What is measured today (evidence on main at 3c5df747)

| Feature | Recorded | Missing | Limits |
| --- | --- | --- | --- |
| Chat (and files in chat) | `jarvis_runs` row per turn (`jarvis/agent.ts:341-359`), tokens from OpenAI, cost only when the six `JARVIS_PRICE_*` are set (`agent.ts:355`, `metrics.ts:25-30`) | tokens of a failed step (`agent.ts:255-261`); the row is lost if saving fails (`agent.ts:360-363`) | 20/min, 400/day everyone (`api/jarvis/chat/route.ts:40-41`); free 15/day; testing 30/day, 300 per 30 days, $4 per 30 days, admins skipped (`:44-52`) |
| SMS | `jarvis_runs` via `runJarvisTurn` (`jarvis/sms.ts:78`) | no prices passed, so cost is always empty; Twilio cost not recorded | only 30 texts/hour per number; none of the testing limits, outside the $4 |
| Voice | one row per call from numbers the browser reports at hang-up (`voice-call.tsx:124-137, 199-206`) | cost always empty (`voice.ts:227`); audio and text tokens added together; transcription not counted; a closed tab = no row; the browser can report anything | 4/min, 40/day; testing 2/day, 10 per 30 days; length (3 min testing, 15 otherwise) enforced only by the browser timer |
| Web search | only the tool name in `jarvis_runs.tool_names` | the search's tokens and per-search fee (`integrations/web-search.ts:75-92`); searches from voice, the monthly savings check and cancel help leave no trace | AI consent only; no count limit on cancel help |
| Document reading (inbox) | the inbox row's outcome | cost (`services/inbox/extract.ts:100-108`); uses the main model; the model call runs inside an open DB transaction (`inbox/index.ts:609`) | uploads/share 30/hour; forwarded email no count limit (5 files each); Gmail filing 10 each morning |
| Tidying | rows changed | the AI call (`finance/tidy.ts:38-69`) | small model, 40 vendors per call; runs after every bank sync and on the button, no count limit |

The holes that matter most:
1. Unknown cost counts as $0 in the cap (`metrics.ts:194-199`), so without prices the $4 cap never trips.
2. Deleting a chat deletes its cost rows and resets the cap (`schema.ts:1619-1621`).
3. SMS is outside every testing limit and has no cost.
4. Nothing is set aside before work starts (`chat/route.ts:50-51`), so concurrent turns all pass; a turn has up to 8 steps and no output cap.
5. No dollar cap after launch (`billing.ts:47`).
6. Two different "months": fixed 30-day blocks for counters, a rolling 30 days for dollars.

## 2. One usage record

**`ai_usage`** (one row per paid call; a chat or text turn is one row): `id`, `user_id` (private, `ownerPolicy()` + FORCE RLS), `created_at`, `settled_at`, `feature` (chat, sms, voice, web_search, document, tidy), `door` (chat_route, sms_inbound, voice_session, voice_tool, chat_tool, savings_check, cancel_help, upload, share, email_in, gmail_filing, plaid_sync, tidy_button), `provider`, `model`, `state` (held, settled, expired, failed), links (`run_id`, `conversation_id` set null on chat delete — never deleted with it, `parent_id`, `hold_id`), usage columns each empty when not reported (input, cached input, output, reasoning, audio in, audio out, search calls, seconds, SMS segments, steps), `usage_from` (provider, server_clock, browser — browser numbers never lower a charge), `cost_micros` (empty = unknown, never 0), `price_key`, `counted_micros` (what counted against allowances: measured cost, else the estimate set aside, else empty), `units`. No content ever: no prompts, queries, file names, vendor names, phone numbers or error text. `jarvis_runs` stays as the quality record; the caps read the new table.

All writes go through `services/ai-usage.ts` (`reserveAi`, `settleAi`, `recordAi`):
- Chat and SMS: `runJarvisTurn` reserves before each model step and settles after; SMS gets prices passed in.
- Voice: `startVoiceSession` reserves the call's maximum seconds (and dollars once voice prices exist) before creating the client secret; settles with seconds from our server clock; browser token counts kept but marked.
- Web search, documents, tidying: a required context argument (`{ userId, door, parentId? }`), read OpenAI's reported usage, one row per call; the document hold is taken outside the inbox transaction.
- SMS sending: a Twilio row with segments; cost empty until the Twilio bill is imported.

Unknown stays unknown: prices only from `JARVIS_PRICE_*` (add: search model, web search per 1,000 calls, voice text/audio in/out, transcription, SMS per segment, and `JARVIS_PRICE_MODEL`/`JARVIS_PRICE_SMALL_MODEL` naming the model each price was copied for — a different running model leaves the cost empty). Totals read "known $X plus N calls with unknown cost". Without prices, limits still work through counts.

Operations tables with no content and no RLS (like `rate_limit_buckets`): `ai_budgets` (counters), `ai_holds` (open holds), `ai_provider_usage` (imported bills), `ai_usage_daily` (anonymous daily summary). Retention: ledger rows 13 months then folded into the daily summary; holds deleted on settle, expired ones kept 7 days; counters 13 months; bills 25 months. Deleting an account removes that person's rows and counters.

Bill check: Admin › App › AI use gets an upload of OpenAI's usage-and-cost file by day and model (`requireAdmin()`, `admin_actions`, re-import changes nothing), compared by day and model; flags a difference over 10% and days with unknown-cost calls. Later, optionally, a daily pull with an OpenAI admin key. A separate OpenAI project for production makes it exact.

## 3. Allowances, ceilings and setting money aside

- Per person per calendar month (and per day where noted): one dollar allowance across every AI feature ($4 in testing), plus count limits that always apply (messages, chat and texts together, 30/day and 300/month; voice 2 calls/day, 10/month, 30 minutes/month; searches, documents, tidy batches per section 8). Admins skip the per-person allowance but count toward the company ceiling, as does the demo account.
- Company: monthly and daily dollar ceilings (`AI_GLOBAL_MONTH_DOLLARS`, `AI_GLOBAL_DAY_DOLLARS`) plus count ceilings for unpriced features; warnings at 50%, 80%, 100% (once each per period, through the alert email path); at 100% paid AI stops for everyone except admins, the rest of the app keeps working.
- After launch the same mechanism runs with Pro numbers.

**Setting aside, one statement:** a Postgres function `ai_reserve(user, feature, keys[], micros, units, ttl)` (the project's first; `CREATE OR REPLACE`, safe to re-run). Inside: create missing counter rows; lock them in key order (`for update`); release expired holds on those keys (their estimate counts as used with cost unknown); if any key would go over, return null and change nothing; otherwise add the estimate to "held" and return the hold id. It runs on its own short connection, never inside the person's `withUser` transaction, so a rollback can't erase a hold for work that ran. Estimates use the configured prices only (prompt size as an upper token count plus a new per-step output cap; per-search fee; document size; 40-line batch; voice maximum seconds).

**Settling:** `ai_settle(hold_id, actual_micros, units)` deletes the hold once (a repeat does nothing) and moves the amount from held to used (the real cost, or the estimate marked unknown). Going over is limited to one step's estimate error.

**Crashes:** every hold expires (chat 330 s: the 280-s turn limit plus margin; voice the call length plus 2 minutes; others 2 minutes); the next request releases it; the daily cron marks the ledger row expired.

**Where the check sits** (the one place every caller passes): `runJarvisTurn` before each step (chat route, SMS, future callers; the chat route's own dollar check is removed, cheap rate limits stay); `startVoiceSession` before `clientSecrets.create`; inside `searchWeb`; inside `extractDocument`; the AI pass in `tidyTransactions`; inside `sendSms`. The context argument is required by type, and a guard test fails if `new OpenAI(`, `.responses.create(` or `clientSecrets.create(` appears outside the allowed files.

**What people see:** the existing limit messages with the date the allowance frees up; at most one "limit reached" text a day; web search says it can't look it up right now; documents are saved and read once the allowance frees up; tidying's rules still run and the AI part waits; at the company ceiling the assistant "isn't available right now".

## 4. Voice limits on the server side

The 120-second secret expiry only limits when a call can start; a started session keeps running (OpenAI's own hard limit is 60 minutes). Proposal: keep the secret short and reserve the maximum seconds; connect through our server (the browser's offer goes to a new route, which forwards it to OpenAI's calls endpoint and keeps the call id with the deadline on `voice_sessions`); a one-minute cron hangs up calls past their deadline plus 30 seconds (`POST /v1/realtime/calls/{call_id}/hangup`; check the paths, a newer guide shows `/v1/live/sessions/...`); voice tools stop at the deadline (already on the voice branch); set `max_output_tokens`; call length from our clock. Later: a server-side listener on the call to read per-reply usage (needs a long-lived connection, so deferred).

## 5. What stays

Cheaper-model routing (small model for quick turns and tidying, main model on refusal), caching (per-user cache key, 24 h, static `INSTRUCTIONS`, fixed tool groups — ADR 0021), bounded loops (8 steps, 280 s, 40 vendors and 600 changes per tidy, 10 Gmail a morning, 5 files per email; new: an output cap per step), deterministic calculations (money answers from services, costs in whole micro-dollars from settings; the model never computes a cost or a limit), and no double spending on retries (`clientMessageId`, SMS de-dup and voice call-id claims).

## 6. "Unlimited" claims

| Where | Says | Reality | Fix (owner's yes) |
| --- | --- | --- | --- |
| `app/(app)/settings/plan/page.tsx:16` | "Unlimited messages with your skyling" | 20/min and 400/day for everyone; voice 15 min a call, 40 calls a day; page hidden until Stripe | "More messages with your skyling", or the exact allowance |
| `app/api/jarvis/chat/route.ts:43` | "LifeFlow Pro has no daily limit" | 400/day | "LifeFlow Pro has a much bigger daily allowance" |
| `server/billing.ts:10-12`, ADR 0018, `docs/plan-v2.md:239` | "unlimited Jarvis (and voice)" | as above | update once Pro numbers are picked |

No "unlimited" on the landing page, the waitlist page or marketing.

## 7. Step plan (each its own branch, tested, migrations take the next free number and `when`)

1. Ledger table and price lookup (`ai_usage`, FORCE RLS, `recordAi`). Tests: privacy, unknown price → empty cost, stale price → empty cost, deleting a chat keeps rows.
2. Record chat and SMS (SMS gets prices). Tests: SMS row has a cost with prices; a failed step still records reported usage.
3. Record web search, documents and tidying (required context). Tests per door.
4. Record voice from the server clock. Test: no "end" from the browser still leaves a row (held, then expired).
5. Guard test for paid clients.
6. Counters and holds, watch only (`ai_budgets`, `ai_holds`, `ai_reserve`, `ai_settle`). Tests: 20 at once with room for 5 → exactly 5; settle twice counts once; expired hold released and counted.
7. Connect the check at every choke point, watch only. Tests: a refusal means the fake model is never called.
8. Admin view: per person and company totals per feature; unknown never shown as $0.
9. Turn on per-person allowances with the owner's numbers (replaces the chat route's and voice route's dollar checks; SMS inside; months reset on the 1st). After `claude/voice-sms-guard` is merged.
10. Company ceilings with warnings and the stop at 100%.
11. Voice on the server side (connection through our server, call id, one-minute hang-up cron, `max_output_tokens`).
12. Bill import and comparison.
13. Retention: daily summary and clean-up.
14. Fix the "unlimited" wording after the owner's yes.
15. Later: per-reply voice usage from the server; Twilio bill import.

## 8. Owner decisions (yes or no, with a recommendation)

**Owner's answers, 2026-11-12:** yes to 1, 2, 3, 4, 5, 6, 7, 8 and 10. **No for now** to 9 (the monthly bill check) and 11 (copying the missing prices into production settings). So the bill check is not built, no price values are added or assumed, and with prices unset the counted limits in decision 4 apply; money ceilings count only where a price is configured (`JARVIS_PRICE_*`; unknown is empty, never 0). Recorded in `docs/adr/0035-ai-usage-and-limits.md`.

1. Keep the $4-a-month testing allowance and count texting, web search, document reading and tidying inside it. **Yes.** (Answer: yes.)
2. Keep 30 messages a day and 300 a month, texts counting as messages. **Yes.** (Answer: yes.)
3. Voice stays at 2 calls a day, 10 a month, 3 minutes each, now ended by our server. **Yes.** (Answer: yes. Built: the limits and the minutes are counted on the server; the hang-up on our side is not built yet, see step 11.)
4. Limits when prices aren't set: 60 web searches and 100 documents a month, 10 tidy runs a day per person. **Yes**, adjusted from real use. (Answer: yes.)
5. Company ceiling for the 10-student test: $50 a month and $10 a day; warnings at 50% and 80%; at 100% the assistant pauses for everyone except admins. **Yes** (your numbers). (Answer: yes.)
6. Allowances reset on the 1st of the month. **Yes.** (Answer: yes.)
7. After launch, Pro keeps a monthly allowance (number picked before launch) instead of no limit. **Yes.** (Answer: yes. Built as a switch that is off until a number is set; no number was invented.)
8. Replace "Unlimited messages" and "no daily limit" with honest words. **Yes.** (Answer: yes.)
9. Bill check by uploading OpenAI's usage file once a month: **yes**; an automatic daily pull with an admin key: **not yet**. (Answer: **no for now**. Not built.)
10. A separate OpenAI project for production. **Yes.** (Answer: yes. An account step for the owner, listed in `docs/PLAN.md` section 10, not code.)
11. Copy the missing prices into production settings (small model, search, voice, web search fee, SMS). **Yes.** (Answer: **no for now**. Until then, only work whose model has a configured price is counted in dollars; everything else is held to the counted limits.)

Sources (verify when building): OpenAI's Realtime conversations guide (60-minute session limit), server-side controls (`?call_id=`), the Realtime calls reference (hang-up; call id from the `Location` header), client secrets create (`expires_after` only limits starting), the client-secrets typings (`max_output_tokens`), and the telephony/SIP guide (newer `/v1/live/sessions/...` paths).
