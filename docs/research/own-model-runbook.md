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

The owner grades a batch of 30 answers on a private page: Good, Almost or Bad, with his own wording where he would say it
differently. His verdicts are the standard. 22 of the 30 are turns the agent readers kept and 8 are turns they dropped; the
page does not say which, so his verdicts are not led. Which turn is which is in
`2026-11-25-training-night/grading/key.json`; the page's source is `grading/page.html`.

When his grades are in (read them from the page's saved documents, collection `grades`, or from the text of its
"Copy my grades" button):

```
python3 scripts/gpu/chat-data/apply_grades.py --grades grades.json --key docs/research/2026-11-25-training-night/grading/key.json --out-dir <folder>
```

It writes which turns to leave out, his own wording as the answer to train on (`make_trainset.py --rewrites`), and a report of
where he and the readers disagree. Each disagreement is a change to the readers' brief or to a rule, before the next read.
A turn the readers dropped stays dropped even if he likes it: he sees the answer, not the tool results it has to match.

## Step 1: train the big model on the 435 checked examples (round 1)

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
RUN=gen2 nohup sh /root/job/boot/scripts/gpu/own-model/gen_box.sh <generate minutes> <hard stop minutes> 9 24 > /workspace/ownmodel/gen.log 2>&1 &
```

- Two lives in three are in "acting on your own: on", one in three in "off" (owner's decision of 2026-11-26); the mode line is
  in every recorded prompt.
- It first scores the teacher with the new checks on the 20 questions (`...-teacher-cards-old20` on the board). **Below 17,
  stop:** the new checks hurt and must be looked at before any examples are made.
- About 950 turns an hour were measured with 24 at a time. One hour is about 130 credits with setup.
- Round 1 kept 63% of turns after the read. With the fixes the hope is more; it is not measured.
- It refuses to write over an earlier recording. It shuts itself down at the end; the box then idles out.

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
