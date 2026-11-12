# 0035: One record of AI use, allowances, and company ceilings

Date: 2026-11-12. Status: built on `claude/ai-cost-limits`, held for the owner (not merged or deployed). Spec: `docs/audits/2026-11-11-ai-cost-ledger-proposal.md`.

## Owner's answers (2026-11-12)

Yes to decisions 1, 2, 3, 4, 5, 6, 7, 8 and 10. No for now to 9 (the monthly bill check against OpenAI's usage file) and 11 (copying the missing prices into production settings). The owner also said not to test the voice: no test, script or manual check makes a real voice call or any real OpenAI request; tests use injected fakes and the e2e fake model server.

## Context

Only typed chat had a measured cost. Texting, voice, web search, document reading and tidying were not counted in dollars; the $4 testing cap was skipped by texting, reset when a chat was deleted, counted nothing without prices, and let concurrent requests all pass. After paid plans turn on there was no dollar limit, and two pages claimed "unlimited".

## Decisions

1. **One usage record** (`ai_usage`, migration 0066, user-owned, FORCE RLS): one row per paid use (chat, sms, voice, web_search, document, tidy) with the entrance (`door`), the model, reported usage, `usage_from`, and `cost_micros`. Numbers only, never content. Unknown cost is empty, never 0. A deleted chat keeps its rows (`conversation_id` set null). `jarvis_runs` stays as the quality record.
2. **Prices only from settings.** `JARVIS_PRICE_*` as before, plus `JARVIS_PRICE_MODEL` / `JARVIS_PRICE_SMALL_MODEL` (the model each price was copied for; unset means the configured `OPENAI_MODEL` / `OPENAI_MODEL_SMALL`) and `JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS`. A price for another model, or a missing fee, leaves the cost empty. No price is in code.
3. **Setting aside before work starts, in one database step** (`ai_budgets`, `ai_holds`, and the functions `ai_reserve`, `ai_settle`, `ai_release`, `ai_sweep`, migration 0067). One statement locks the counters in key order, lets expired holds go (counted as used, cost unknown), refuses when any counter would pass its limit and changes nothing then, otherwise adds the estimate to "held". It runs on its own connection, never inside the person's transaction. Settling works once. Every hold expires (chat 330 s, voice length plus 2 minutes, others 150 s); the cron sweeps stale ones. Counters are operations data with no RLS and no content; per-person keys start `u:<id>:` and are removed with the account.
4. **The one choke point** is `services/ai-gate.ts` (`reserveAi`): inside `runJarvisTurn` before every model step (chat and SMS; the first step also counts the message), in `startVoiceSession` before the client secret, in `searchWeb`, `extractDocument` and the tidy AI pass. A refused piece of work never reaches the provider. The chat route and the voice route keep only a read-only friendly check (`peekAi`) and their cheap rate limits. A guard test fails if a new file creates a paid client.
5. **Per person** (testing, no Stripe): $4 a month counted where a price is configured; 30 messages a day and 300 a month (chat and texts together); voice 2 calls a day, 10 a month and 30 minutes a month (counted on the server; our own clock settles the minutes); 60 web searches and 200 documents a month (raised from 100 by the owner on 2026-11-12, so Gmail's reading fits; Gmail's first look reads up to 50), 10 tidy runs a day. Months and days are the person's own, resetting on the 1st. Admins and the demo account skip the per-person limits but count toward the company's. A provider that refuses before doing any work gives the hold back uncounted.
6. **After launch** (decision 7): a Pro person's monthly dollar allowance is a switch, `AI_PRO_MONTH_DOLLARS`. It is off until the owner sets a number. No number was invented.
7. **Company ceilings**: $50 a month and $10 a day (the owner's numbers; `AI_GLOBAL_MONTH_DOLLARS` / `AI_GLOBAL_DAY_DOLLARS` change them), counted only where a price is configured; optional count ceilings (`AI_GLOBAL_MONTH_CALLS` / `AI_GLOBAL_DAY_CALLS`, off by default) cover unpriced work. Warnings by email at 50%, 80% and 100%, once each per period, to the same address as error alerts. At 100% the skyling pauses for everyone except admins (all paid features, voice included); the rest of the app keeps working.
8. **Wording**: "More messages with your skyling" and "a much bigger daily allowance". Limit messages say the date an allowance opens. Nothing names a model, a setting or tokens.
9. **Per-step output cap**: every model step is sent with `max_output_tokens` (25,000: thinking counts inside it), and the estimate uses the same number, so it is a real upper bound. A step that comes back incomplete is kept, said plainly in the skyling's voice ("ask for a smaller piece"), recorded as an error (`output_cap`), and its half-written tool calls never run. There is no automatic retry with a larger cap (it would double the cost of the biggest requests).
10. **Voice minutes**: the browser's "end" is only a request (the session secret keeps working), so an early end frees nothing: a call counts as long as it could have run (`TESTING_LIMITS.voiceCallMinutes`). The server never sees the call close; that waits for the server-side connection (step 11).
11. **Daily guard after launch**: one person may use at most 20% of the company's daily dollar ceiling in a day (`PERSON_DAY_SHARE`, my choice, not a price and not the monthly allowance number), counted only where priced, so one account can't use up the day for everyone. Not applied in testing (decision 1 stays as answered). The admin AI panel says when dollar limits aren't counting and lists the kinds of work with no price (voice always).
12. **Removal**: the under-13 lock, account deletion and an admin delete all clear a person's counters and holds (`deleteUserBudgets`); an admin reset of limits clears the holds of the counters it resets.

## Not built (by the owner's answers, or later steps)

- The monthly bill check and any automatic pull from OpenAI (decision 9). Prices stay unset in production (decision 11): until then dollars are counted only for work whose model has a configured price, and the counted limits hold the rest.
- Voice through our server (a call id on our side and a one-minute hang-up cron), proposal step 11. It needs the exact OpenAI paths checked and a real call, which the owner ruled out testing. The server already reserves and counts the call's minutes and refuses new calls past the limits; the call's length on the phone is still ended by the browser timer.
- Twilio sending cost, per-reply voice usage, retention folding into a daily summary (the cron removes counters after 13 months), and an admin panel of per-person and company totals.

## Known risk, for later

- **Connection pool.** Document reading and tidying take a second database connection (for the hold) while the caller's transaction holds one, and the pool is 10. Under heavy concurrency this could contend. Worth a load check before many people use it; not changed here.

## Consequences

- With prices unset, dollar limits count nothing and the counted limits hold. Setting the six prices (and the search fee) turns the dollar allowance and ceilings on with no code change.
- Settling can pass a limit by one step's estimate error at most; the next request is refused.
- The old per-person testing counters in `rate_limit_buckets` are no longer written; the admin AI-use panel and "reset limits" read and clear the new counters.
- Migrations: 0066 `ai_usage` (when 1798500000000) and 0067 `ai_budgets` (when 1798600000000), both safe to re-run.
