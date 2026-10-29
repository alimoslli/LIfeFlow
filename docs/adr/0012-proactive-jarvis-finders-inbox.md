# ADR 0012: Proactive Jarvis, subscriptions and savings finders, smart inbox, trips

**Status:** accepted (2026-10-29)

**Context.** The owner asked for Jarvis to act like a coach that speaks up on its own:
- messages from the user's real data, each ending in one clear action
- buttons that change what Jarvis does next
- reviews: morning, evening, Sunday weekly, monthly
- a subscription finder and a savings finder with real, sourced prices
- a forwarding inbox that files bills, receipts, school work, bookings and pay stubs
- personality settings

It had to stay honest: no guessed numbers, no claims without the saved record, money only with explicit confirmation.

**Decision**

- **Detectors, then wording.**
  - Detection: `services/proactive/detectors.ts` (and `reviews.ts`) turn data into `Candidate`s: a kind, real facts, an action, a priority, and a `dedupeKey`.
  - Wording: `lib/jarvis-voice.ts` writes the text from the facts in the chosen tone (Coach, Friend, Straight to the point). It is pure, so Settings previews it live.
  - Scheduling: `RUNS` maps slots (morning, midday, evening) and events (transaction, shift, goal, task) to detectors.
  - Uniqueness: `jarvis_messages.dedupe_key` is unique per user, so nothing repeats.
- **When it runs.**
  - Today calls `runDueSlot` (once per slot per day, keyed in `notification_log`).
  - The daily cron runs it for everyone.
  - `mutate()` runs event detectors in `after()` for transactions, shifts, goals and to-dos.
  - Daily caps: Low 2, Normal 4, High 7. Reviews and urgent alerts don't count.
  - Pushes go out only for urgent messages, priority 75 or more, or reviews. Never during quiet hours, never twice, and at most the user's limit per day (default 3).
- **Actions.**
  - "Do it" carries out the action stored on the message, and returns the result and an Undo.
  - Money actions (`shift_budget`, `contribute_goal`) run only on "Do it", and the button states the exact amount.
  - The autonomy settings may allow `block_time`, `create_task` and `move_tasks` without asking. Money never runs without asking.
- **Learning** (only with consent, asked once on a card).
  - Every response is stored on the message: do, snooze, not now, mute, 👍/👎, and ignored for 2+ days.
  - `learnedStats` (last 60 days, or since "Reset what I learned"):
    - stops a kind after 3 negative outcomes in a row with none acted on;
    - boosts kinds acted on at least twice and half the time;
    - makes messages brief after 3 or more 👎.
  - "Don't suggest this again" mutes a kind.
  - Settings → Assistant shows the per-kind stats, muted kinds ("Bring back"), a learning switch and a reset.
- **Get-to-know questions.**
  - At most one every 3 days, each asked once, only with learning on.
  - The user picks an answer chip.
  - The answer is saved as a memory with source `user`, editable and deletable in Settings; Undo removes it.
- **Live web search** (`integrations/web-search.ts`).
  - Uses the OpenAI Responses API `web_search` tool with `tool_choice: required` and `store: false`.
  - Sources come only from the response's citations and search actions.
  - **Savings finder:** a price is kept only if its `source_url` is one the search actually cited, and only if it is cheaper than the user's current price. Results show the source link, the time checked, the yearly saving, and a negotiation script that the user sends themselves.
  - **Cancel help** uses the same search; Jarvis never cancels anything.
- **Subscriptions** are computed from tracked recurring items and their matching transactions:
  - price increases (latest vs. previous charge);
  - duplicates (same service, or several in one family);
  - trials ending within 7 days;
  - "not using".
- **Smart inbox.**
  - Each user gets a forwarding address `u-<token>@INBOX_DOMAIN`.
  - The webhook `/api/inbox/email?key=INBOX_WEBHOOK_SECRET` takes Postmark's inbound JSON.
  - Mail is filed only when it comes from one of the user's verified addresses **and** passed SPF or DKIM for that domain. Otherwise it is recorded as ignored, with the reason.
  - Unknown addresses are accepted and dropped, so senders can't probe which addresses exist.
  - Content is untrusted. The LLM extracts into a strict JSON schema, and services file it:
    - bill → recurring + reminder
    - receipt → transaction, with duplicate check
    - assignment/exam → course
    - flight/hotel → trip + calendar
    - pay stub → paycheck
  - Every filing has Undo.
  - Uploads and the Android share sheet use the same path.
- **Trips:** dates, bookings on the calendar, costs against budget, and clashes with shifts and deadlines.

**Consequences**

- Adding a proactive message means adding a detector to `DETECTORS`/`RUNS`, wording in `jarvis-voice.ts` (plus a `KIND_LABELS` entry), and a test.
- Provider limits:
  - Web search and document reading need `OPENAI_API_KEY` (optionally `OPENAI_SEARCH_MODEL`).
  - The inbox needs `INBOX_DOMAIN`, an inbound mail provider and `INBOX_WEBHOOK_SECRET`. Without them, those features say so instead of pretending.
- iOS Safari has no Web Share Target, so on iPhone the inbox takes uploads and forwarded mail; the share sheet works on Android installs.
- Vercel Hobby runs the cron once a day. Today's own `runDueSlot` covers the other slots when the app is opened, and an external pinger (go-live checklist) makes them punctual.
- Tests use injected or fake providers (`tests/e2e/fake-openai.mjs`). The real OpenAI search and Postmark have to be checked once keys and DNS are set.
