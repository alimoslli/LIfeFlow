# Our own skyling model, first training run (2026-11-21)

Owner, 2026-11-21: "lets get those examples to train our model on ... lets push to get a stable model for the alternative subscription, our model that can fully control a users skyling", then "go" and "I approve all requests, don't stop working till the steps of the plan are done". This is ADR 0023 level 2, started early as a measured experiment. Made-up data only. Nothing ships: the app still uses its current model, and switching the skyling to our own model needs the owner's yes and the conditions in `docs/PLAN.md` (the 2026-11-12 pricing line).

## Short answer

The first trained model is worse than the model it started from: Qwen3-8B passes 4 of 20 skyling test questions untuned and 1 of 20 after training. The cause is found and is in our data, not the method: half the training examples were answers that called no tool, and the long examples that did call tools were cut by a length limit, so the model learned to ask or guess instead of looking things up. The data to fix it already exists (every step of every conversation was recorded), the fix is written and tested, and retraining needs no new examples.

The run also cost far more than planned: 599.1 credits on one H100 instead of about 100, because the model server left running at the end kept the box billing for almost 3 hours after the work was done. Every job script now shuts the server down when it finishes.

## What was built

1. **The weekday fix** (in the app, on the branch): every local date a tool returns now carries its weekday (`"due": "2026-11-04 23:59"` gets `"dueWeekday": "Wed"`), so no model has to work the day out. `src/server/jarvis/serialize-result.ts`, tests in `tests/unit/serialize-weekdays.test.ts`. Full check passes (1,807 tests).
2. **Made-up lives:** 162 normal weeks from the library's 27 personas (24 students), each a new seed and a moment between September and November, through the library's own simulator (`scripts/gpu/chat-data/make_lives.py`). Each life has about 170 transactions, 200 calendar events, a term of classes and assignments, shifts and memories.
3. **Loading them like real accounts:** `load-life.ts` saves a life through the app's own services, so the skyling reads it exactly as it would a connected account.
4. **The questions:** 5,437 student messages over all 37 skills, the router pilot's seeds and teacher rewrites, 15% with a short follow-up ("ok do that", "why?"). The 20 test questions and the router's test sets are left out.
5. **The examples:** the real skyling loop (`runJarvisTurn`: the same prompt, skills, tool groups and tools), answered by a teacher model, gpt-oss-120b (Apache 2.0), on one H100. The translator records exactly what the model was sent and what it answered, in chat format.
6. **The filter** keeps a turn only if it finished cleanly with no failed tool; every money amount and decimal in the answer is in the tool results or the person's words; every weekday named next to a date is right; it changed nothing the person didn't ask for; and it follows the skyling's own rules (about 100 words at most, no headings, no app paths, no drama words, no narrating, never "assistant" or "Jarvis"). Em dashes become commas and odd spaces plain ones, since those are style, not mistakes.
7. **Training:** LoRA (rank 16, all layers) on Qwen3-8B (Apache 2.0), thinking off as the app runs it. The model learns only from the skyling's own turns (its tool calls and answers), never from the prompt or tool results.
8. **Testing:** the same 20 questions as before (`scripts/compare-models.ts`), on a clean database, untuned against tuned.

## Results

| | Passed first try (of 20) | Right tools | Answer had every fact | Seconds per question |
|---|---|---|---|---|
| Teacher gpt-oss-120b (writes the examples) | 6 | 17 | 8 | 3.4 |
| Qwen3-8B, untuned | 4 | 13 | 4 | 1.1 |
| **Qwen3-8B, trained (ours, first try)** | **1** | **1** | **1** | 0.5 |

All three on a clean database with a normal user (no superuser), so these replace this morning's provisional numbers for Qwen3-8B.

The examples: 2,261 turns generated over two batches (12 workers, about 40 minutes of teacher time), 2,023 kept by the filter (211 of them from the first batch, capped per skill), covering all 37 skills. Most common reasons for dropping a turn: a number in the answer that no tool returned (588), a tool that failed (104), too long (76), a change nobody asked for (53), narrating (33), a wrong weekday (15).

Training: 1,524 of the 2,023 were usable (459 were over the 16,384-token limit), 1,240 seen in the 60 minutes allowed (155 steps, LoRA rank 16). The loss on 40 held-back examples fell from 2.98 to 0.81, so the model did learn what it was shown. What it was shown was the problem:

- 1,011 of the 2,023 examples are answers with no tool call at all (the teacher answered "any tips?" and general questions straight from its own knowledge, which is right for those).
- The examples with tool calls are the long ones (they carry the tool results), so most of the 459 cut by the length limit were tool-using.
- Only the last step of each conversation was used, so the model never saw the short first step where the skyling decides to call a tool.

What the trained model did on the test (its own answers): "Which savings goal are you asking about?", "How much cash do you have available this weekend?", "I'm not seeing any subscriptions tracked in your account yet", and once it invented data ("Math 101: Problem Set 3"). It called a tool on 1 of 20 questions.

## What went wrong on the way (and what changed)

- **Shared storage is slow for software.** The first H100 run (94.83 credits) never got its model server started: vLLM was installed on the network volume and its files read at about 0.2 MB a second. Everything now installs on the box's own disk: setup went from 20+ minutes to 3.
- **The test database ran as a Postgres superuser,** which skips row-level security. That made 81 tests fail here for no real reason, and it means the open-model scores from this morning are provisional (rows of several test students were visible). Every run now drops superuser after the migrations.
- **The first batch of examples asked only 6 of the 37 skills** (a per-life random pick clustered). Fixed by spreading the bank evenly; the first batch's good examples were kept, capped per skill.
- **Some teacher answers changed things nobody asked for** (a to-do added for "any tips?"). The filter now drops writes the person didn't ask for.
- **Training ran out of memory** scoring the whole vocabulary on 16,000-token examples; it now scores only the skyling's own tokens.

## What this proves and what it does not

- **The pipeline works end to end:** made-up lives loaded like real accounts, the skyling's real loop with a self-hosted teacher, a filter that enforces the skyling's own rules, LoRA training, and a clean test, all unattended on one rented GPU. Everything is reusable.
- **Training moves the model, a lot, in about an hour.** It just moved it the wrong way, because of what the examples taught. That is the useful lesson: the mix of examples matters more than their number.
- **The teacher is the ceiling.** gpt-oss-120b passes 6 of 20 on its own. A student trained only on its filtered answers will not beat the current OpenAI model on this test. To get there, the examples need a better teacher, or the filter has to keep only the teacher's best answers (it already drops the worst), or both.
- **It does not prove** that a tuned 8B model can run the skyling. That needs the retrain below and, most likely, a stronger teacher.

## Credits

| Box | What it did | Credits |
|---|---|---|
| H100 `6ba06976`, 05:52 to 06:39 | First attempt: model server never started (software on the slow shared volume) | 94.83 |
| H100 `95794dd7`, 06:47 to 11:47 | Setup, teacher test, two batches of examples, training, both tests (work done by 08:58), then about 2 hours 50 minutes idle with the model server still running | 599.10 |
| L40S `ed27eda1`, 19:24 | Reading the results to find the cause | 0.67 |
| **Total for this step** | | **694.60** |

About 340 of the 599.10 were the idle hours: my job script left the model server running, which counts as busy, so the box's idle timer never fired, and this chat restarted before it could stop the box. Every script now shuts the server down at the end, so a finished box goes idle and stops itself within its idle timer.

## Next steps

1. **Retrain from the examples already made** (`scripts/gpu/chat-train/retrain.sh`, about 75 minutes on one H100, about 150 credits; no teacher, no new generation). The filter now keeps every tool-calling step as its own example (the short "decide what to look up" step that was missing), keeps answers without a tool call to 12% of the mix, and the length limit is 24,000 tokens. Ready to run; waiting on the owner's go, given this run's overspend.
2. **If the retrained model beats the untuned one clearly** (well over 4 of 20), make more examples with a stronger teacher. The candidates that fit our boxes: a bigger open model on 2 to 4 GPUs, or the current OpenAI model as the teacher for a few hundred of the hardest cases (a paid run, needs the owner's yes and a cost estimate first, per the AI spend rule).
3. **Make the test fairer before comparing to OpenAI:** accept equivalent wording in the few strict checks, and score the current model on the same 20 questions (about 40 paid calls).
4. **Nothing changes in the app** until a model passes the Jarvis eval and the situation library on our own servers (`docs/PLAN.md`, 2026-11-12), with the owner's yes.
