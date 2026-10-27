# ADR 0006 — Per-turn metrics (`jarvis_runs`) and cost accounting

**Status:** accepted (2026-10-27)

**Context.** We couldn't say whether a change made Jarvis faster, cheaper or more reliable: nothing about a turn was recorded except the messages themselves.

**Decision**
- Every turn writes one `jarvis_runs` row (RLS-isolated like all user data) with:
  - total latency and time to first streamed text;
  - model steps;
  - tool calls, failed tool calls, and confirmations requested (kept separate from failures);
  - distinct tool names;
  - input, cached, output and reasoning tokens as reported by the provider (`TokenUsage` from each `step_done`);
  - outcome (`ok`, `error`, `cancelled`, `step_limit`) and a coarse `error_kind`, never raw error text;
  - provider, model, `PROMPT_VERSION`, and the ids of the memories sent.
- **No content** is stored in metrics, so they can be analysed without reading conversations.
- **Cost is never guessed.** `estimateCostMicros` only computes cost when `JARVIS_PRICE_INPUT_PER_MTOK` and `JARVIS_PRICE_OUTPUT_PER_MTOK` (plus an optional cached price) are set from the provider's current price list. Otherwise cost is null and the UI says "cost not configured".
- Recording failures are logged and swallowed: metrics never break a turn the user already received.
- Users see their own 30-day summary in Settings → Jarvis & memory (requests, median reply time, time to first words, share of actions that worked, tokens, cost if configured). The rows are included in the data export and deleted with the account.

**Next.** Phase 2 links 👍/👎 and corrections to `jarvis_runs` and messages. Phase 3's evaluation runner records the same fields per scenario, so offline evals and real usage are measured the same way. Cross-user reporting will use an aggregate, content-free view limited to users who consent.
