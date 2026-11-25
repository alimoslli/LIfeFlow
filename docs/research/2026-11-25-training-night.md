# The training night of 2026-11-25: examples made and checked, training cut off, no trained model yet

Owner's ask (direct, in the GPU chat): train our own model tonight on clean, checked examples, the big model with a smaller
set, 350 credits at most. This is what happened, plainly.

## The short version

- **No trained model came out of the night.** Training started at 09:44 UTC and was cut off at 10:31 UTC when the Higgsfield
  account ran out of credits. Nothing in the app changed. The app still runs on OpenAI.
- **What we do have, saved:** 449 recorded turns from the teacher (Skyling 1.1) on made-up lives, 742 training examples after
  the automatic filter, and **435 examples that also passed a full read by eight quality-check agents** (146 of 396 turns were
  dropped). These are on GPU storage, ready to train on.
- **Spent by this chat:** 224.18 credits (97.82 + 126.36), inside the 350 cap.
- **Why the credits ran out:** the account is shared. Another chat spent about 380 credits on video generation the same
  morning (ten MAGI-2 videos at 37.5 each, 07:53 to 09:24 UTC). I planned from the balance I had read before the night
  (601.79) and did not read it again before renting the second box. That is my mistake.

## What ran, in order (all times UTC)

1. **08:16 to 09:05, box 1 (H100, 97.82 credits).**
   - The 27B model with nothing of ours around it (no rules, no cards, no checks) on the 20 test questions: **9 of 20**.
     This is the "before" for any trained model. Skyling 1.1 with our rules scores 18 to 19 on the same questions.
   - The teacher answered a mixed bank of messages (half of them the newer abilities) on 162 made-up lives for 28 minutes:
     449 turns, 396 passed the automatic filter, 742 examples (each tool-calling step is its own example).
   - **Lost the box:** it shut itself down at 09:05, five minutes after generation ended. My session restarted at that
     moment and the "hold the box" loop I had written does not count as activity. The examples were already saved. Lost:
     the box's setup (about 5 minutes of work to redo).
2. **09:27 to 10:31, box 2 (H100, 126.36 credits).**
   - Set itself up, loaded the model into memory, tried four examples.
   - **Quality check, by eight agents in parallel, about two and a half minutes:** every one of the 396 kept turns was read
     against a written brief (`quality-check-brief` below). 141 flagged, plus 5 from my own mechanical checks. The drop list
     with a reason per turn is in `2026-11-25-training-night/quality-check-dropped.txt`.
   - Training on the 435 checked examples (403 to learn from, 24 held back to measure, 8 too long) started at 09:44.
   - **Cut off at 10:31** by the empty account, about 47 minutes in. The script saves the trained part every 200 examples,
     and at the speed measured (below) it had not reached 200. So nothing usable was saved. Not verified: reading the
     training log needs a box, and the account has 0.36 credits.

## What the quality check found (this is worth keeping)

The automatic filter kept 93% of turns. Careful readers kept 63%. The filter is too soft. The two big problem families:

1. **Wrong about the clock.** Things already past talked about as still ahead (an 11 AM class at 9:20 PM), study time offered
   after the deadline, "this evening" at 11:30 PM, a bare "Thursday" for a bill three weeks away.
2. **Specifics from nowhere.** A personal detail no result shows ("you said you study best in the afternoons"), an invented
   price passed to the affordability check, wrong general knowledge after the web search failed (the wrong train line).

Smaller ones: a follow-up answered as if it were a new question ("yes please", "take that back" answered "taken back" with
nothing undone), "I'll nudge you" with nothing saved, five to-dos made unasked where three is the limit, the person greeted
by an internal id ("Hey p2044!"), and a made-up bank charge named after an AI company repeated in answers.

What this means: the teacher itself makes these mistakes in about one turn in three on the newer abilities. Before the next
big generation, the cheap wins are in our code, not in training: a check for times already past, a check that a figure sent
to a tool came from the person or a result, and the made-up lives' data should not carry internal ids or AI company names.
59 of the 146 dropped turns were "unsure" (mostly personal details that may have come from saved memories the readers could
not see); those could be checked against the full prompt and some restored.

The distress message in the set was handled correctly (no tools, glad they told it, a trusted person, the crisis line).

## What we learned about training the big model

- The trainer works on the real model: it loaded in 12 seconds from memory, 40.8 million trainable numbers out of 27.4
  billion (0.15%), and the first example gave a real training signal on all 150 trained parts.
- **It is far slower and hungrier than I estimated.** One 11,700-token example took 27 seconds (I had estimated 5), and
  memory sat at 78 of 80 GB. Examples over about 17,000 tokens do not fit on an H100 at all. At that speed one pass over 435
  examples is about 3 hours, roughly 360 credits. My estimate before the night was wrong by about five times, and I had not
  measured it. The small test I ran beforehand used a tiny copy of the model, which proves the code, not the speed.
- The model library says why: without two optional fast kernels its special layers run a "correct but much slower" path.
  I left them out on purpose (untested, one attempt). One try at installing one of them during the run did not give a
  working module. So the fast path is **not verified**.
- The examples are learned without our rules in the prompt (checked: the rules text appears in none of the 435). That is
  the point: the model should behave well with only what the app sends.
- Held-back loss before any training: 0.396. There is no "after" number.

## What I got wrong

1. Did not re-read the credit balance before renting the second box. The run was planned for 115 minutes and got 63.
2. Estimated training speed without measuring it on the real model. A 5-minute measurement at the start of the night would
   have shown that the 27B does not fit the budget this way, and I would have trained the 8B instead.
3. Wrote a "hold the box" loop that does not hold a box, and lost the first box's setup to it.
4. Said "trained tonight" was reachable. It was not, with these numbers.

## What I recommend next (each needs credits, so the owner's yes)

- **A. Train the small sibling first, about 60 credits.** Qwen3-8B on the same 435 checked examples: measured earlier at
  2.9 seconds an example, so the whole set twice over takes about 45 minutes, then the same 20 questions and the newer
  tests. This gives a real "trained for LifeFlow" model to judge in one sitting, and tells us whether 435 examples move
  anything before more is spent on the big one.
- **B. A 10-minute speed test of the big model with the fast kernels, about 20 credits,** before any big-model training is
  planned again. If it is not at least four times faster, the big model needs a bigger card (H200, 134 credits an hour) and
  a budget of several hundred credits per pass.
- **C. Fix the teacher's two big mistakes in code** (times already past, figures from nowhere) before generating more
  examples. No credits needed for the code; about 60 credits to measure it.

Read the balance first, every time. The account is shared with the video work.

## Files

- `scripts/gpu/chat-train/train_big.py`: trains the upper layers of the 27B and merges the result. Leaves out an example
  that does not fit in memory instead of stopping; stops at a clock time; does real GPU work while it waits for data.
- `scripts/gpu/own-model/train_night.sh`: the unattended box stage (sets up a fresh box, trains, merges, serves, scores, hard stop).
- `scripts/gpu/own-model/gen_box.sh`: the generation stage. `scripts/gpu/chat-data/qc_export.py`: one short record per turn
  for readers. `scripts/gpu/chat-data/make_trainset.py`: kept examples minus flagged turns.
- On GPU storage (`/workspace/ownmodel/`): `gen1/` (the recording, `train-new.jsonl` 742 examples, `qc.jsonl`),
  `night1/train.jsonl` (the 435 checked examples), `night1/drop.txt`, `night1/train.log`, `board.txt` (the 9 of 20 line).
- `2026-11-25-training-night/quality-check-dropped.txt`: every dropped turn with its reason.
- `2026-11-25-training-night/quality-check-brief.md`: what the readers were told to flag.

## Open decisions for the COO and the owner (from the three reviews before the night)

- The app's own instructions say offer first and book only on a yes (autonomy is off by default). The owner's Nov 22
  direction has the skyling give study time a place unasked when someone is behind. Tonight's examples follow the Nov 22
  direction. One of the two has to win before a trained model goes near the app.
- Our documents say nothing on crisis or self-harm messages, mental-health questions, "are you an AI", or 13 to 17 year
  olds. For training only I added teacher rules (distress comes first, not a doctor, says plainly it is an AI and their
  skyling, cannot contact other people). They are my wording, not approved policy.
