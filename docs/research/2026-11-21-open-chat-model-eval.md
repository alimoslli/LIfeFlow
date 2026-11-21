# Can an open chat model run the skyling? First measurement (2026-11-21)

Step 2 of the own-model plan (owner, 2026-11-21: "you can start with 1 and 2"). The question: how far is an open model we could host ourselves from doing the skyling's real job today, untuned? Made-up data only (the eval student, Maya Chen, in a throwaway test database; ADR 0023). No app code changed. Nothing here ships.

## Short answer

Far. Untuned, on the skyling's real loop, Qwen3-8B passes 2 of 20 questions with thinking off and 4 of 20 with thinking on. It usually picks the right tool (13 to 15 of 20), so the tools and prompt work with an open model. What fails is the answer: wrong weekdays and dates, wrong counts, and numbers it was given but left out. gpt-oss-20b (OpenAI's open model, Apache 2.0) also passes 4 of 20: it picks the right tools almost every time (19 of 20) and gets dates right more often, but calls more tools than needed (9 of 20 over budget) and still drops totals.

For scale: the same harness measured OpenAI's gpt-5.5 (the current model) on 2026-11-07 at 13 of 18 answers with the right facts and 16 of 18 with the right tools (`docs/research/2026-11-07-model-comparison.md`; 18 questions then, 20 now, so not a like-for-like score).

## How it was measured

- **The harness** is the repo's own `scripts/compare-models.ts`: the real skyling turn (`runJarvisTurn`: the same prompt, skills, tool groups and tools), the eval student seeded into a fresh test database, 20 questions (the 12 of the Jarvis eval plus 8 harder ones: several needs in one question, a quiet "nothing to do" case, a vague ask, a follow-up, a tempting write, an integrity case, a two-part money question). A question passes only if the answer has every required fact, the right tools were called, it stayed within its tool budget, it wrote nothing it shouldn't, and nothing errored. A failed question gets one retry.
- **The model** ran on one rented L40S with vLLM 0.34 (chat format, tool calls parsed by vLLM). The app speaks OpenAI's Responses format, so a small translator (`scripts/gpu/chat-eval/responses_shim.py`, standard library only) turns each request into a chat request and streams the answer back the way the app expects. It was tested end to end on a stand-in model first.
- **Three fixes to the harness**, all in `scripts/compare-models.ts`, none to the app: answer checks for the 2 newer eval questions (zelle, catchup), taken from their perfect answers; the per-turn `ai_usage` bookkeeping row is no longer counted as the model writing; and the test student's AI counters are reset before each question, because the app's testing limit (30 messages a day) otherwise ended the first run after 16 questions.

## Results

| | Qwen3-8B, thinking off | Qwen3-8B, thinking on | gpt-oss-20b |
|---|---|---|---|
| Passed, first try | 2 of 20 | 4 of 20 | 4 of 20 |
| Passed within 2 tries | 2 | 5 | 5 |
| Answer had every required fact | 3 | 5 | 6 |
| Called the right tools | 13 | 15 | 19 |
| Over the tool budget | 2 | 1 | 9 |
| Wrote something it shouldn't | 1 | 0 | 1 |
| Errors | 0 | 0 | 1 |
| Seconds per question (median) | 2.5 | 24.7 | 5.2 |

Typical mistakes (Qwen3-8B, thinking off, from its own answers):

- **Days and dates.** BIO 110 "at 9:00 AM" (it is 10); the essay "due Thursday, November 4" (Wednesday); shifts "Wednesday, Friday, and Sunday" (Monday, Wednesday, Saturday); the advisor to-do "Friday, November 5" (Friday is Nov 6).
- **Counts and totals.** "12 subscriptions" (8); left out the $108.43 monthly total and October's $2,328.26 spent and $1,304.13 in, though the tools returned them.
- **Reading a tool result wrong.** "I didn't find any transactions" for the Zelle question, when the search returned the July 18 payment.
- **Saying it did something it didn't.** For "does a Tue/Thu 8 AM gym routine fit?" it called `set_up_schedule` and said the routine "has been added". The question only asked whether it fits.
- gpt-oss-20b's misses are milder: it found the Zelle payment, counted 8 subscriptions, and booked study time in real free slots, but it wrote times as "16–21", put the essay on Thursday in two answers, and often fetched extra data it didn't need.
- What went right (Qwen3-8B): the integrity case (it refused to write the essay and offered to coach), the to-do, mostly the right tools, and no errors from the translator or the tools.

The day and date mistakes are the most telling: the tools return dates, and the model re-derives weekdays wrongly. That is exactly what fine-tuning on our own made-up conversations should fix, and it also points at a cheap app-side fix that helps any model: have the tools return the weekday next to every date ("Wed Nov 4"), so the model never has to work it out.

## What this proves and what it does not

- **Proves:** the skyling's loop, prompt and tools run unchanged on a self-hosted open model through a thin translator, on one mid-range GPU, with no errors. The plumbing for level 2 of ADR 0023 is not the problem.
- **Proves:** untuned, these open models are nowhere near good enough to replace the current model. This is the starting line, not a verdict on a tuned model.
- **Does not prove** anything about a fine-tuned model, about bigger open models, or about cost per message at real traffic (one question at a time on one GPU, no batching).
- **The checks are strict text checks.** A few failures are wording the checker doesn't accept (for example "You don't have any overdue assignments" against the expected "nothing/none/no"), so a person would score a little higher. Most failures are real mistakes, listed above.
- **One run each**, with one retry on failure. Small differences (4 against 5) are noise.

## Credits and time

| Box | What it did | Credits |
|---|---|---|
| 2daac4f5 (L40S, 71 an hour, 04:18 to 05:29 UTC) | Setup (vLLM, Node, Postgres, the app's packages), step 1 on its spare CPU, Qwen3-8B twice, gpt-oss-20b | 84.39 |

Limit for steps 1 and 2: 120 credits. About 15 minutes of box time went to two restarts of this chat and to setup mistakes (a missing C compiler, a command that stopped itself).

## Next steps (proposals)

1. **Add the weekday to every date the tools return** (one small change in the tools' output format, with tests): it should help the current model too, and it removes the most common open-model mistake. Needs the owner's yes, since it changes what the skyling reads.
2. **Grow the training set for level 2:** have a strong teacher write thousands of full skyling conversations, with tool calls and the real tool results, on simulator lives (ADR 0023 says 5,000 to 10,000). Check each against the same facts the eval uses before keeping it.
3. **Fine-tune Qwen3-8B on them** (LoRA, the same way as the router pilot) and run these same 20 questions again. Only a big jump (well over half passing) makes it worth going further.
4. **Make the checks fairer before comparing:** accept equivalent wording in the few strict checks, and score the current model on the same 20 questions (it needs the owner's yes, since it is a paid run: about 40 calls).
