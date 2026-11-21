# Our own skyling model, first training run (2026-11-21)

Owner, 2026-11-21: "lets get those examples to train our model on ... lets push to get a stable model for the alternative subscription, our model that can fully control a users skyling", then "go" and "I approve all requests, don't stop working till the steps of the plan are done". This is ADR 0023 level 2, started early as a measured experiment. Made-up data only. Nothing ships: the app still uses its current model, and switching the skyling to our own model needs the owner's yes and the conditions in `docs/PLAN.md` (the 2026-11-12 pricing line).

## Short answer

RESULT_SUMMARY

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

TRAIN_TABLE

## What went wrong on the way (and what changed)

- **Shared storage is slow for software.** The first H100 run (94.83 credits) never got its model server started: vLLM was installed on the network volume and its files read at about 0.2 MB a second. Everything now installs on the box's own disk: setup went from 20+ minutes to 3.
- **The test database ran as a Postgres superuser,** which skips row-level security. That made 81 tests fail here for no real reason, and it means the open-model scores from this morning are provisional (rows of several test students were visible). Every run now drops superuser after the migrations.
- **The first batch of examples asked only 6 of the 37 skills** (a per-life random pick clustered). Fixed by spreading the bank evenly; the first batch's good examples were kept, capped per skill.
- **Some teacher answers changed things nobody asked for** (a to-do added for "any tips?"). The filter now drops writes the person didn't ask for.
- **Training ran out of memory** scoring the whole vocabulary on 16,000-token examples; it now scores only the skyling's own tokens.

## What this proves and what it does not

PROVES

## Credits

CREDITS

## Next steps

NEXT
