# Training the big model: the runbook (written 2026-11-25, after the night that failed)

For whoever runs the next paid session, most likely the GPU chat. Everything here that could be built and tested without
credits is built and tested. What is left needs a GPU, and each step says what it costs and when to stop.

One H100 costs 120 credits an hour: 2 credits a minute.

## Before any rental, every time

1. **Read the Higgsfield balance** (the `balance` tool), right before renting. The account is shared with the video work; on
   2026-11-25 it was drained by another chat mid-run.
2. **A line to the COO first** for any spend over about 100 credits (COO's rule, 2026-11-25).
3. **Dry run passes** here, no credits: `sh scripts/gpu/own-model/dry_run.sh` (about 3 minutes; add a training python and
   `TINY_MODEL=<folder with the model's config and tokenizer>` to include the trainer). It runs the whole pipeline with a
   stand-in model: made-up lives, the message bank, the app's real loop, the guard, the recording, the filter, the
   quality-check export, the training-set builder, the trainer on a tiny copy. Last run: 0 problems.
4. **The branch is pushed.** The box clones `claude/skill-router-pilot`.
5. **Work out the hard stop from the balance**, not from a plan: minutes = credits to spend / 2, minus 4 minutes for me to stop
   the box. Give that clock time to the script. Set a safety reminder for it.
6. **A box whose GPU is idle is taken away** (5 or 10 minutes). Never leave a gap between stages. The scripts do real work
   while they wait.

## The owner's own grades (2026-11-26)

The owner grades a batch of 30 answers on a private page: Good, Almost or Bad, with a few words of feedback where something
is off. His verdicts are the standard. **His words are feedback, never the answer itself** (owner, 2026-11-26: "what I write
won't be the new answer, I will just give feedback and I will trust the next generation"). 22 of the 30 are turns the agent
readers kept and 8 are turns they dropped; the page does not say which, so his verdicts are not led. Which turn is which is
in `2026-11-25-training-night/grading/key.json`; the page's source is `grading/page.html`.

When his grades are in (read them from the page's saved documents, collection `grades`, or from the text of its
"Copy my grades" button):

```
python3 scripts/gpu/chat-data/apply_grades.py --grades grades.json --key docs/research/2026-11-25-training-night/grading/key.json --out-dir <folder>
```

It writes which turns to leave out of training (Bad and Almost) and a report: his feedback by verdict, and where he and the
readers disagree. Then, before the next generation, each piece of feedback becomes one of three things: a rule or a situation
card for the teacher, a check in code where code can catch it, or a line in the readers' brief. The next generation's answers
are written by the teacher under those. A turn the readers dropped stays dropped even if he likes it: he sees the answer, not
the tool results it has to match.

## The owner score (2026-11-27)

His standard as one number, so every model we try gets the same test: the teacher before it writes examples, and every
trained model next to its old-20 score. 39 made-up chats, each aimed at one thing he said when he graded (a quick answer for
a quick message, the whole answer when he asks for real help, one line after a promise, look before asking, at most one
question, never "try again later", no "items", the star, "are you an AI", both "acting on your own" modes). Every check is
done by code, no judgment call. The probes are in `scripts/gpu/chat-eval/owner_exam.json`, the scorer is
`scripts/gpu/chat-eval/owner_score.py`.

```
python3 scripts/gpu/chat-eval/owner_score.py                          # self-check, no model: must end "SELF-CHECK passed"
npx tsx scripts/compare-models.ts run --exam owner ...                # on the box: gen_box.sh and train_night.sh already do it
python3 scripts/gpu/chat-eval/owner_score.py run <out>/raw-local.json # the score, per rule, into owner-score.json
python3 scripts/gpu/chat-eval/owner_score.py recorded qc.jsonl        # the shared checks alone, over answers already recorded
```

**Stop line:** do not train on what a teacher writes if it scores under 31 of 39, or if any one rule has nothing passed.
Why 31: the readers and the filter take out bad answers, but they cannot add good ones, so the teacher has to be right most
of the time on its own; 31 of 39 is 80%, close to what Skyling 1.1 does on the old 20 (18 to 19 of 20). A rule at zero means
the teacher never does that thing, and no amount of filtering teaches it. `gen_box.sh` says the score in its status and, with
`OWNER_MIN=31`, stops before making any example.

What the self-check proves: every probe's good sample passes and its bad sample fails for the right reason; the fake model's
kinds of wrong answers score 0 to 4 of 39; the scorer agrees with the owner's own reason on 7 of his 8 grades. The one it
does not catch is g02 ("if he asks a lot, explain more"): that needs a second question in the same chat, which the
`own-ai-more` probe covers instead. Not known until a GPU run: what the teacher or any model actually scores.

## The order changed on 2026-11-26: generate first, then train

The owner's first grades (`2026-11-25-training-night/grading/owner-feedback-1.md`) showed that round 1's 435 examples are
not at his standard: 96 of the 250 kept turns fail it in code (too long for a quick message, extras, asking what a look would answer). Training
the big model on them would teach the style he marked down. So:

1. **First box: generation 2** (the section "Step 2" below) with `SPEEDTEST=1`, which also measures what training will cost
   in its first six minutes. The teacher is scored on the 20 questions before any example is made.
2. **No box: the agent read** against the brief (it now carries the owner's standard), and the owner grades a sample.
3. **Second box: training** (the section "Step 1" below, on the new set plus what passes from round 1).

## Step 1: train the big model on the checked examples

The examples are on GPU storage: `/workspace/ownmodel/night1/train.jsonl`. First, rebuild them with the stricter filter (the
clock and made-up-figure checks did not exist when they were filtered). Ten seconds on the box, no GPU:

```
cd /root/job/boot && python3 scripts/gpu/chat-data/filter.py --meta /workspace/ownmodel/gen1/meta.jsonl --dump /workspace/ownmodel/gen1/dump.jsonl \
  --out /workspace/ownmodel/gen1/train-v2.jsonl --report /workspace/ownmodel/gen1/filter-report-v2.json --alive --details /workspace/ownmodel/gen1/details-v2.jsonl
python3 scripts/gpu/chat-data/make_trainset.py --kept /workspace/ownmodel/gen1/train-v2.jsonl --drop /workspace/ownmodel/night1/drop.txt --out /workspace/ownmodel/night1/train.jsonl
```

Then one command, unattended (fresh box: it sets itself up):

```
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git /root/job/boot
cp /root/job/boot/scripts/gpu/own-model/train_night.sh /workspace/ownmodel/night1/
nohup sh /workspace/ownmodel/night1/train_night.sh <training minutes> <hard stop, UTC, like 14:30> > /workspace/ownmodel/night1/train_night.log 2>&1 &
```

What it does, in order, and what to read:

| Minutes | What | Where to look |
| --- | --- | --- |
| 0 to 6 | sets up the box, the model goes straight into memory | `steps.log` |
| 6 to 12 | **speed test**: 5 examples the plain way, the same 5 with the fast kernels | `/workspace/ownmodel/speed.txt` |
| 12 to T | trains; saves the trained part every 4 minutes | `night1/train.log`, `night1/adapter/progress.json` |
| last 24 | merges, serves, scores (bare and with our rules) | `board.txt`, `night1/status.txt` |

**The speed test decides the price.** It prints one line to act on:

- `USE fast: same losses and N times faster`: the fast kernels are used. This is the hoped-for case.
- `USE plain: ...`: the fast kernels failed, or gave different numbers, or were not faster. Training goes on the plain way.

What a full pass over the 435 costs, by what the speed test says (training only; add about 70 credits for setup, the test,
merging and scoring):

| Seconds an example | One pass | Credits for one pass |
| --- | --- | --- |
| 27 (the plain way, measured 2026-11-25) | about 3 hours 15 minutes | about 390 |
| 14 | about 1 hour 40 minutes | about 200 |
| 7 | about 50 minutes | about 100 |
| 4 | about 30 minutes | about 60 |

**Nothing is lost if the money or the time runs out.** The trained part is on storage every 4 minutes, and the same command on
the next box carries on from there (`RESUMED at example ...` in the log). A run can be bought in pieces.

**When to stop and report instead of going on:**

- the speed test says `USE none`, or training stops with an error: the script shuts itself down; report, do not retry;
- the held-back loss goes up between two saves (`holdout loss` lines in `train.log`): stop, something is wrong;
- before training the held-back loss should read about 0.396 the plain way (measured 2026-11-25). A very different first
  number means the examples or the model are not what they were.

**What counts as a result.** The bare model scored 9 of 20 with nothing of ours. Skyling 1.1 (same model, our rules around it)
scores 18 to 19. The trained model is scored both ways:

- bare, well above 9: the training took. This is the number that says "trained for LifeFlow" honestly.
- with our rules, at least 18: nothing was broken.
- bare, near 9: 435 examples were not enough or the pass was too short. Say so; go to step 2.

## Step 2: a bigger, cleaner set (generation 2)

The message bank is rebuilt (2026-11-25): 755 written messages in four voices plus the generic lines, every message tagged
with the lives and hours it fits, follow-ups that match what the first answer did, real weight on opening the app, sick days
and undo (all three had no examples left in round 1). The teacher is told the time and has the clock and made-up-figure checks.

```
SPEEDTEST=1 RUN=gen2 nohup sh /root/job/boot/scripts/gpu/own-model/gen_box.sh <generate minutes> <hard stop minutes> 9 24 > /workspace/ownmodel/gen.log 2>&1 &
```

- Two lives in three are in "acting on your own: on", one in three in "off" (owner's decision of 2026-11-26); the mode line is
  in every recorded prompt.
- It first scores the teacher with the new checks on the 20 questions (`...-teacher-cards-old20` on the board). **Below 17,
  stop:** the new checks hurt and must be looked at before any examples are made.
- About 950 turns an hour were measured with 24 at a time. One hour is about 130 credits with setup.
- Round 1 kept 63% of turns after the read. With the fixes the hope is more; it is not measured.
- It refuses to write over an earlier recording. It shuts itself down at the end; the box then idles out.

What changed in the bank and the generator on 2026-11-27 (owner's items 8 and 9, no credits):

- **Longer chats.** A third of chats (`--long-share`, default 0.33) now run 3 to 5 messages. Each message after the first is
  picked from what the skyling really did in the turn before (`messages/after.json`, shared with the bank builder): an offer
  gets a yes or a no (always a yes or a no when acting on its own is off), a saved block gets "make it an hour later" or
  "undo it", a question gets an answer, a promise gets "check on me after", and now and then the person moves on to another
  message from the bank or ends with a thanks. Each turn records what happened (`did`) and where the next line came from
  (`nextFrom`).
- **One rule for long chats in training:** a turn is kept only when every turn before it in the same chat was kept, by the
  filter and by the readers (`filter.py`, `make_trainset.py`). Its history holds the earlier answers; the training loss is on
  the last answer only, but a model trained to go on from a bad answer learns to expect one. Earlier answers in the history
  get the same clean-up as the final one (no em dashes, no bold).
- **Every skill reached.** 1,500 messages, 1,261 different (894 before), and every one of the 43 skills (37 here plus 6 only
  on main) reached by at least 12 different messages, counted with the app's own routing rule (`skill_coverage.py`). 84
  messages are for the 6 skills that exist only on main; the generator skips them (`needsSkill`) until this branch is rebased.
- **New written messages:** 166 spoken-style (what a person says after speech-to-text: no punctuation, "um", restarts, a
  misheard word), 62 weeks and schedules told or pasted in one message (the set-up flow, a pasted syllabus list, a pasted
  shift list), 239 for skills the bank barely reached. All made up.
- **Not possible as text, so not faked:** real photos of a schedule and real voice. Photos would need a teacher that reads
  images (Qwen3.8-27B reads text only) and made-up schedule pictures rendered from the made-up lives; a model trained on our
  text examples learns nothing about reading a picture. Real voice goes through the voice service, not this model, so the
  spoken-style messages cover what reaches the model: the words after speech-to-text.

Then, with no box running and no clock ticking: upload `qc.zip`, read every kept turn with agents against
`2026-11-25-training-night/quality-check-brief.md`, build the drop list, and write the checked set to
`/workspace/ownmodel/night2/train.jsonl` on the next box with `make_trainset.py`.

## Step 3: round 2 training

Same script, a new folder, starting from round 1's trained part:

```
NIGHT=night2 MODE=on INIT=/workspace/ownmodel/night1/adapter nohup sh /workspace/ownmodel/night2/train_night.sh <minutes> <hard stop> > ...
```

Put round 1's examples into round 2's training set as well (`cat` the two files): a model trained only on new examples
forgets some of the old.

## What is not known yet (so nobody promises it)

- How fast the fast kernels are, and whether they work at all with this training setup. Measured in the first 12 minutes of step 1.
- Whether 435 examples move the bare score. Measured at the end of step 1.
- Whether the merged model loads in the model server. The trained part is saved either way.
- Whether the teacher's scores hold with the new checks. Measured at the start of step 2.
- How the trained model does in the real app. Nothing is built into the app; that is a separate decision (ADR 0023).

## Files

`scripts/gpu/own-model/`: `dry_run.sh`, `gen_box.sh`, `train_night.sh`, `runplan.sh`, the rule, reminder and card files.
`scripts/gpu/chat-train/`: `train_big.py` (the trainer), `speed_verdict.py`.
`scripts/gpu/chat-data/`: `build_alive_questions.py` (the bank), `messages/voice-*.json`, `generate.ts`, `load-life.ts`,
`filter.py`, `qc_export.py`, `make_trainset.py`.
`scripts/gpu/chat-eval/`: `responses_shim.py` (the translator and the guard), `reality_checks.py`, `fake_model.py`.
