# Skill router pilot: our first own fine-tuned model (2026-11-20 night, finished 03:57 UTC on 2026-11-21)

A pilot run on a rented GPU. It does not ship and nothing in the app changed. Made-up data only (the repo's own skill evals and rewrites of them), as ADR 0023 section 5 requires. Scripts: `scripts/gpu/router/`. Results and the trained adapter: `/workspace/router/out` on the owner's GPU storage.

## Short answer

A small open model (SmolLM3-3B), taught for 13 minutes on 5,437 made-up student messages, picks the right skill for a message far more often than the app's keyword router does on messages neither has seen:

| Who picks the skill | Held-out evals (43) | Fresh messages (74) |
|---|---|---|
| The app's keyword router (`routeSkills`, first pick) | 42 of 43 (98%), not a fair test, see below | 23 of 74 (31%) |
| SmolLM3-3B, untuned | 19 of 43 (44%) | 21 of 74 (28%) |
| **SmolLM3-3B, tuned (ours)** | **38 of 43 (88%)** | **70 of 74 (95%)** |
| For reference: Qwen3-8B, untuned | 33 of 43 (77%) | 59 of 74 (80%) |
| For reference: Qwen2.5-14B-Instruct (the teacher), untuned | 36 of 43 (84%) | 67 of 74 (91%) |

The keyword router found no skill at all for 36 of the 74 fresh messages (49%). It gets the held-out set right only because the repo's tests force it to pass those exact prompts: they are in `skills/*/evals.json`, and its trigger words were written for them. So the fresh set is the fair comparison.

## What was trained, on what

1. **Split.** The 196 prompts in `skills/*/evals.json` were split per skill (fixed seed): 153 seeds and 43 held out (about 1 in 4, at least 1 per skill). The held-out prompts were never shown to the teacher or used in training. `build_split.py`, `data/seeds.json`, `data/heldout.json`.
2. **Teacher rewrites.** Qwen2.5-14B-Instruct (Apache 2.0) on the GPU wrote 1,135 batches: 8 rewrites of each seed in 5 styles (texting with typos, chatty with made-up details, polite, stressed and rambling, indirect), plus 10 new messages per skill per style from the skill's description. That gave 6,757 rows. Near-duplicates (more than 80% the same words within a skill) and any exact copy of a test message were dropped (2 rows), then a drift check: the teacher, shown only the list of skills, had to pick the same skill for the row, or it was dropped (1,471 rows dropped). 5,284 rows were kept (3,477 rewrites, 1,807 new), 45 to 223 per skill (fewest: web-research 45, app-operator 60, study-coach 63, memory-manager 64). `gen.py`.
3. **Fresh test set.** 74 messages, 2 per skill, written in a student's voice without looking at the trigger words, before any training data existed (`data/fresh.json`). Examples: "can u move my dentist thing to friday at 4", "airpods are $179 rn, is that dumb with rent coming up", "there's a $23.40 charge from SQ *BLUEBIRD, idk what category that is".
4. **Fine-tune.** LoRA (rank 16, all linear layers, 30 million trainable weights, under 1% of the model) on SmolLM3-3B (`HuggingFaceTB/SmolLM3-3B`, Apache 2.0, thinking switched off) with the 5,284 rows plus the 153 seeds: 2 passes, batch 8, learning rate 0.0002, 1,360 steps, **759 seconds (12.7 minutes) on one H100**. The model reads a fixed instruction with all 37 skills and their one-line descriptions, then the message, and answers with the skill name. `train.py`. The adapter is 116 MB (`out/adapter-smol`).
5. **Scoring.** The same instruction for the untuned and tuned models, greedy answers, exact skill name (`evalm.py`). The keyword router was run locally with tsx on the same messages (`keyword_router.ts`, `keyword_router_results.json`).

Qwen3-8B was the second model on the shortlist. It exists on Hugging Face (`Qwen/Qwen3-8B`, Apache 2.0) and its untuned score is above, but I did not fine-tune it: there was not enough room left under the credit limit.

## Worst confusions

Tuned SmolLM3-3B, all 9 misses:

| Should be | Picked | Message |
|---|---|---|
| app-operator | habit-builder | Remove the gym habit |
| app-operator | smart-scheduler | can u move my dentist thing to friday at 4 |
| daily-planner | smart-scheduler | Can you time-block my day? |
| smart-scheduler | shift-manager | Which day this week is going to be the hardest? |
| study-coach | exam-prep | Help me study for my exam |
| exam-prep | smart-scheduler | two finals the same week (stats and bio), map out the days before |
| life-admin | reminders-follow-up | Book a doctor's appointment reminder |
| career-helper | meeting-prep | i have a phone screen with target on thurs and idk what they're gonna ask |
| task-breakdown | life-admin | moving out of my dorm next month, what are all the steps |

Most of these are pairs where a person could argue either way (study-coach or exam-prep for "Help me study for my exam"; app-operator or smart-scheduler for moving an event). The clearest weak spot is **app-operator**: plain "change this record" requests get pulled to the skill the record belongs to. It also had one of the smallest training sets (60 rows).

The untuned model leaned on a few skills for everything (budget-coach for any money message, wellbeing-check-in for anything with feelings in it). The keyword router's misses are mostly no match at all: every fresh message for daily-planner, fact-checker, meal-planner, meeting-prep, message-drafter, purchase-advisor, savings-goals, subscription-hunter, transaction-review and weekly-review found nothing, because students don't use the trigger words.

## What this proves

- The method works end to end on our own GPU budget: made-up data from the repo, an open teacher, a LoRA fine-tune and an honest score, in about one GPU hour.
- On fresh student-style messages, a tuned 3B model picks the right skill 95% of the time, against 31% for the keyword router and 28% for the same model untuned. The tuned 3B also beat its 14B teacher (91%) and an untuned 8B model (80%).
- The keyword router misses half of natural messages entirely. That is a real gap in the app today, separate from any model.

## What it does not prove

- **The fresh set is small and was written by an AI (me), not by students.** 74 messages, 2 per skill: one message is 1.4 points. The 95% could easily be 90% or 98% on another 74. Real students will write things neither of us thought of.
- **Overlap in authorship.** The teacher, the fresh set and the drift check all come from AI models with similar habits, so the test may be easier for the model than real messages would be. The teacher never saw the test messages, and exact copies were removed, but similar phrasing can still slip through.
- **One run, one seed.** No repeat runs, so there is no spread on the numbers.
- **One skill per message.** The app's router can return 2 skills; this model returns 1. Messages that need two skills were not tested.
- **Not tested inside the app.** Nobody measured whether a better skill pick makes the skyling's answers better on the Jarvis eval or the situation library, which is what counts.
- **Speed and cost per message were not measured.** The keyword router costs nothing; a 3B model needs a GPU or a slow CPU and reads about 815 words of instruction per message (the skill list). Hosting it is a real cost the pilot did not price.
- **Nothing about a full own language model (ADR 0023 level 2).** Picking a skill is a much easier job than wording a good answer.

## Next steps toward ADR 0023

ADR 0023 says each model uses the simplest method that passes its tests first, and a heavier method only when it beats the simple one. So, in this order:

1. **Try the simple methods on the same tests, for no GPU money.** The app already runs all-MiniLM-L6-v2 for memory. A nearest-match on the 5,437 rows with those embeddings, or a small classifier on top of them, runs on a CPU in milliseconds. If it gets close to 95% on the fresh set, it wins.
2. **A bigger, fairer fresh set.** At least 5 messages per skill (about 185), some needing two skills, ideally written by the test students in their own words (made up by them, not their real data) or drawn from the situation library's student cases.
3. **Measure the effect inside the skyling.** Run the Jarvis eval and the situation library with the keyword router and with the best new router (fake model for the words, so no AI cost), and see whether better skill picks change the answers.
4. **Cheap fix for today's router, if the owner wants it:** the 36 messages with no match show which trigger words are missing (in `keyword_router_results.json`). That change would go through the normal skill flow (`npm run skills`, the owner's yes), not this pilot.
5. **Only then think about hosting a tuned model**, with its cost per 1,000 messages measured, and the second shortlist model (Qwen3-8B) tuned if the 3B one is not enough.

## Credits and time

| Box | What it did | Credits |
|---|---|---|
| 4cb30a25 (H100, 120 an hour) | Setup and model downloads; stopped itself for inactivity at 03:26 while this chat's worker restarted, so about 10 minutes of it was idle | 47.14 |
| de88bd27 (H100, 120 an hour, rented at 03:27 to replace it) | Teacher rewrites (about 9 minutes), untuned scores, one failed first training try (out of memory at batch 16), training (12.7 minutes), tuned scores; stopped by hand at 03:57 | 59.06 |
| **Total** | | **106.20 of the 150 limit** |

No call went to OpenAI or Groq. Boxes f05637c5 and 43bc092a were not touched.

## Files

- `scripts/gpu/router/`: `build_split.py`, `gen.py`, `common.py`, `train.py`, `evalm.py`, `keyword_router.ts`, `README.md`, `data/` (skills, seeds, held-out, fresh), `keyword_router_results.json`.
- On the GPU storage, `/workspace/router/out`: `adapter-smol/` (the trained adapter), `train.json` (the 5,284 kept rows), `raw.json`, `dedup.json`, `gen_stats.json`, `train-smol.json`, `eval-smol-base.json`, `eval-smol-tuned.json`, `eval-qwen-base.json`, and a copy of the scripts and data.

## Follow-up, 2026-11-21: the simple methods (next step 1)

Owner: "start with 1 and 2". ADR 0023 says the simplest method that passes its tests wins, so before any hosting I tried simple routers on the same two test sets. Script: `scripts/gpu/router/embedding_router.py`. CPU only, no model calls; it ran on the GPU box's spare CPU because the teacher rows are stored there.

| Method (small embedding model, no fine-tuning) | Trained on | Held-out (43) | Fresh (74) | Time per message on a CPU |
|---|---|---|---|---|
| Nearest skill description, all-MiniLM-L6-v2 | nothing | 28 (65%) | 37 (50%) | 6 ms |
| Small classifier, all-MiniLM-L6-v2 | the 153 seeds | 28 (65%) | 53 (72%) | 6 ms |
| Nearest 5 messages, all-MiniLM-L6-v2 | seeds + 5,284 teacher rows | 27 (63%) | 61 (82%) | 6 ms |
| **Small classifier, all-MiniLM-L6-v2** | **seeds + 5,284 teacher rows** | **33 (77%)** | **65 (88%)** | **6 ms** |
| Small classifier, bge-small-en-v1.5 | seeds + 5,284 teacher rows | 33 (77%) | 59 (80%) | 11 ms |
| For comparison: keyword router (today) | | (not fair) | 23 (31%) | under 1 ms |
| For comparison: tuned SmolLM3-3B | seeds + teacher rows | 38 (88%) | 70 (95%) | needs a GPU (not measured) |

What it says:

- The teacher rows matter more than the model: the same small classifier goes from 72% to 88% on fresh messages when it learns from them.
- The best simple router gets 88% of fresh messages right in 6 ms on an ordinary CPU, with nothing to host. The tuned 3B model is better (95%, and 88% against 77% on the held-out evals) but needs a GPU.
- Its misses are the same kind as the 3B model's: app-operator edits pulled to the skill they touch, and reminders against message drafting.
- On these small test sets, 5 messages of difference is about 7 points, so the gap between 88% and 95% is real but not precisely measured.

My recommendation: the small classifier is the one to try in the app first, because it costs nothing to run and triples the keyword router's hit rate on natural messages. It would sit beside the keyword router (keywords first when they match, the classifier when they find nothing), behind a switch, with the owner's yes, since it changes how the skyling picks skills. The tuned 3B model is worth it only if the classifier's misses show up in real use.

## What changed because of this report

Nothing in the app yet. It is a pilot; the next steps above are proposals.
