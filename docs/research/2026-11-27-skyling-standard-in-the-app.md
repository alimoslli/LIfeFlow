# The owner's standard in the app (2026-11-27)

The owner graded eight real skyling answers on 2026-11-26 and said what a good answer is. On 2026-11-27 he asked for that
standard to be in the app itself, not only in the training examples ("do 1-9"). This branch (`claude/skyling-standard`,
from main at 8a6da3e) is built and held: no merge, no deploy, until his yes.

## What changed

1. **Answer checks in the skyling's loop** (`src/server/jarvis/answer-checks.ts`). The same checks that guard the training
   examples (`scripts/gpu/chat-eval/reality_checks.py` on `claude/skill-router-pilot`), in TypeScript, with the same cases
   as tests: a time already gone spoken of as still ahead, a save for a time already gone, an amount nobody gave sent to a
   tool, "you said" when they didn't, "I'll remind you" with nothing saved, "taken back" with nothing changed, a record's id
   shown, too long for a quick message, extras after a promise, more than two questions, asking what a look would answer,
   "try again later", "items". When the person's message, or one of their last three, reads like real distress
   (`lib/distress.ts`, broad on purpose), the checks are off for that turn: nothing is judged, held or sent back, and the
   reply streams as it comes, whatever it says (COO review).
   - One setting, `SKYLING_ANSWER_CHECKS`: **off** (default, nothing runs), **watch** (counted on the run, nothing changes,
     no extra model call), **fix** (a failing answer is held back and sent to the model once with what to fix; a save for a
     time already gone, or with a figure nobody gave, is not run the first time it is asked for).
   - At most one retry per answer, ever, and only with a step and enough of the turn's time left. The retry is one more step
     of the same turn: it is set aside and settled through `reserveAi` like every step and counted on the same `ai_usage`
     row. If the retry fails or comes back empty, the person gets the first answer. In fix mode an answer arrives whole
     instead of word by word, because it is checked before it is shown.
   - Each run records what was found (`jarvis_runs.answer_checks`, codes only) and whether the retry came back clean
     (`answer_fixed`). Migration `0076_answer_checks` (`when` 1799500000000, safe to re-run).
2. **His standard in the instructions** (`prompt.ts`, `PROMPT_VERSION` 2026-11-27.1): a quick message gets a quick answer
   (usually under 40 words, at most about 60); real help, a breakdown or the steps have no fixed limit ("as long as it
   needs, and no longer"); after a save, one line and stop; it works here or it doesn't, never "try again in a bit"; name
   things, never "items"; look before asking which exam; at most one open question and one yes-or-no offer; the star when a
   tick earned one; "are you an AI" in its own words, more when asked more, never a model or company. The distress section
   still comes first and overrides all of it. The model's own length setting gives "explain", "break it down" and "how do
   I" more room (`chooseVerbosity`); a week plan stays short (plans belong in the app).
3. **Why a thumbs-down** (`lib/answer-rating.ts`). After a thumbs-down the chat asks one tap more: Too long, Got it wrong,
   Didn't do it, Missed the point. Text buttons, no icons; checked in light and dark mode. Only the reason's code is stored on the run (`rating_reason`), never typed words or
   anything of the chat. Behind `SKYLING_RATING_WHY` (off; the browser tests turn it on). Pictures in
   `docs/research/2026-11-27-skyling-standard-in-the-app/`.
4. **Acting on your own**: already on main (skyling policy, 08f3ce0); checked, not redone.
5. **Three tool fixes**: the budget skill's first step no longer reads as "run money_findings on every question" (one
   `spending_summary` call answers "where did my money go"); `life_load` now speaks in each day's own figure ("8.5 hours",
   not "about 9") and names the nearest light day; `find_subscriptions` now returns the monthly total and the count.
6. A tick that earned a star now says so in the tool's result (`star: true`, read back from their own records, never
   assumed: the day has a limit). The owner's note on g01: "remember the stars?".
7. **A bug fixed on the way (it is on main too):** an answer loaded back from the server had no run id, so its thumbs
   vanished at the first refresh, which happens right after every answer. Loaded answers now keep their thumbs and their
   rating (`answerRuns` in `ui-messages.ts`).
8. The debug screen (`/jarvis?debug=1`, What the skyling knows) shows the checks' numbers per prompt version.

## Turned on or not

Nothing new is on for anyone: both settings default to off. Suggested order once the owner says yes: `watch` for a week of
real use (no cost, shows how often answers miss his standard), then `fix`.

## What costs more even with both settings off

The model's own length setting now gives "explain", "break it down", "walk me through" and "how do I" messages more room
(`chooseVerbosity` in `effort.ts`: medium instead of low). That is on for everyone once this branch ships, with no setting,
and it costs more on those turns: the answers are longer, so more output is billed. How much more is not measured. If the
owner wants it behind a setting too, it is one line.

The answer checks in "fix" add one model step to each answer they send back; in "off" and "watch" they cost nothing.

## Not measured (needs a paid run the owner has not approved)

- Whether the real model follows the new length wording (the old wording was measured: 835 words without the reminder, 52
  with it).
- How often fix mode would send an answer back, and so what it would cost. Each send-back is one more model step.
- That the OpenAI provider accepts the app's note as a `developer` message mid-turn (written to the documented format;
  tested only against the scripted model).

## Privacy read needed before the reason is turned on

The reason is a fixed code on the person's own run (row-level security, deleted with the account, never typed text). The
owner asked for a privacy read before any feedback feature is on: that read is still owed.
