# ADR 0031: Promises

Date: 2026-11-08. Status: accepted (owner asked for it, 2026-11-08).

## Why
People feel good when they say they will do something and then do it. The assistant can make that moment real: it remembers what the user said, checks back once, and answers in its own voice.

## Decision
- A `promises` table (user-owned, forced RLS) with a text, a check-in time, a status (open, kept, broken, dropped), an optional linked to-do, and how many times it was moved.
- The assistant saves a promise only from a clear first-person commitment (`make_promise`) and records how it went only because the user said so (`resolve_promise`).
- A detector asks "Did you do it?" once at the time, with three answers. Notifications that are wrong are worse than none, so nothing is ever kept or broken by guessing: only the user's answer or a finished linked to-do counts. Unanswered promises are dropped after a week and never counted as broken.
- Wording lives in `lib/promise-voice.ts`. Three broken promises in 14 days give the assistant a firmer, playful attitude (never shaming) and an offer of a smaller promise.
- Opening Today and a 30-minute cron (`/api/cron/promises`) run the check. The cron loops accounts like `/api/cron/notify`; at larger scale it should select only accounts with a due promise.

## Not now
Detected done moments (a shift ending, a Canvas submission) and the after-shift message. They follow the same accuracy rule.
