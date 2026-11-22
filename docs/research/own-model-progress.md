# Own model: steps 1 and 2, progress notes

Working notes so the work can be picked up if a chat stops (owner, 2026-11-21: "if the limit runs out, stop before that, and we continue tomorrow at 11 am"). Final results go into `docs/research/2026-11-20-skill-router-pilot.md` (step 1) and a new step 2 report.

Owner's go-ahead (2026-11-21, 04:05 UTC): start steps 1 and 2 from the pilot report's next steps. Step 2 GPU limit: 120 credits (the estimate given, 60 to 120). Made-up data only (ADR 0023). No change under `src/`.

## Step 1: simple router on a CPU (no GPU money)

- Script: `scripts/gpu/router/embedding_router.py`. Results: `scripts/gpu/router/embedding_router_results.json` in the repo holds the seeds-only runs (run here); the full run with the teacher rows is `/workspace/chateval/LIfeFlow/scripts/gpu/router/embedding_router_results.json` on the GPU storage.
- Done. Best: all-MiniLM-L6-v2 + small linear classifier on seeds plus the 5,284 teacher rows: fresh 65/74 (88%), held-out 33/43 (77%), 6 ms a message on a CPU. Seeds only: 53/74. Run on the GPU box's CPU (the teacher rows live on the GPU storage, `/workspace/chateval/train.json.gz`).

## Step 2: an untuned open chat model on the Jarvis eval

- Harness: `scripts/compare-models.ts` (the real skyling loop, the eval student, 18 questions, automatic checks for facts, tools, budget and writes).
- Plan: on one rented H100, serve the model with vLLM (chat format), put a small translator in front that speaks the Responses format the app uses, run Node and a throwaway Postgres on the box, run the harness.
- Models: Qwen3-8B first (on the GPU storage already), then gpt-oss-20b if credits allow.
- Box: L40S `2daac4f5`, 71 credits an hour, rented 04:18 UTC. Setup on `/workspace` (kept): `/workspace/vllm-venv` (vLLM 0.34), `/workspace/node`, `/workspace/chateval/LIfeFlow` (branch clone, npm ci done). Postgres and gcc are apt installs (lost when the box stops).
- Done: Qwen3-8B thinking off, 20 questions: 2 pass. Right tools 13/20, facts 3/20. Results `/workspace/chateval/out-qwen3-8b/`.
- Harness fixes: answer checks for the 2 newer questions (zelle, catchup); the test student's AI counters reset before each question (the 30-a-day testing limit cut the first run short); ai_usage counted as bookkeeping.
- Done: Qwen3-8B thinking on, 4 of 20 (5 in two tries); gpt-oss-20b, 4 of 20 (5 in two tries). Box stopped 05:29 UTC, 84.39 credits. Report: `docs/research/2026-11-21-open-chat-model-eval.md`. Raw results: `/workspace/chateval/out-*` on the GPU storage.

**Steps 1 and 2 are finished.** Nothing is left for the 11 AM pickup except the summary.

## Step 3: training examples for our own model (owner, 2026-11-21: "lets get those examples ... lets push to get a stable model")

- **Done, no GPU:** the weekday fix (every local date a tool returns gets `<field>Weekday`; `src/server/jarvis/serialize-result.ts`, tests `tests/unit/serialize-weekdays.test.ts`; full check passes, 1,807 tests). The generator: `scripts/gpu/chat-data/` (make_lives.py, load-life.ts, build_questions.py, generate.ts, filter.py, run_box.sh), tested end to end here with a stand-in model.
- **Found:** the test database must not run as a Postgres superuser (it skips row-level security). That caused 81 false test failures here and makes the step 2 scores provisional. Fixed in run_box.sh.
- **GPU run 1, H100 `6ba06976`, 05:52 to 06:39 UTC, 94.83 credits, no examples.** On a fresh box, vLLM installed on /workspace (a network volume) never finished starting: its Python files read at about 0.2 MB a second. The teacher (gpt-oss-120b, 61 GB) is downloaded on the GPU storage. run_box.sh now installs vLLM, Node and the app on the box's own disk.
- **Next:** run 1 more time with the new run_box.sh (estimate about 100 credits on one H100: 12 min setup, 5 min teacher test, 30 min examples). Waiting on the owner's budget for it: the cap set for this step was 150 and 95 is spent.

### GPU run 2 (owner: "go", then "I approve all requests, don't stop till the steps of the plan are done")

- Box H100 `95794dd7`, rented 06:47 UTC. Everything installs on the box's own disk now: setup took 3 minutes (was 20+).
- Teacher gpt-oss-120b on the 20 test questions, clean database (no superuser): 6 of 20 first try, 7 in two tries; facts 8, right tools 17, over budget 5. Better than the 8B models, far from perfect, so the filter matters.
- First generation (06:57 to 07:13): 1,620 turns, 1,506 kept. Stopped before training because only 6 of 37 skills had been asked (the per-life random pick clustered) and some answers wrote things nobody asked for. Kept in `/workspace/chatdata-run2a`.
- Fixes: questions spread evenly over the whole bank (each life and slot steps by a prime), "unasked write" filter, em dashes become commas, plain spaces. Training scores only the skyling's own tokens (the full vocabulary scores ran out of memory).
- Now: regeneration (12 questions a life, 1,944 in all; stop 07:58 UTC), then `chat-train/phase2.sh` on the same box: fine-tune Qwen3-8B (LoRA, up to 60 minutes), then score untuned and tuned on the 20 questions. Results land in `/workspace/chattrain`.
- **Result (08:58 UTC):** examples 2,023 kept of 2,261; teacher gpt-oss-120b 6/20; Qwen3-8B untuned 4/20; trained 1/20 (it stopped calling tools: half the examples answered without one, and the long tool-using ones were cut). Report: `docs/research/2026-11-21-own-skyling-model-training.md`.
- **Overspend:** the H100 ran idle with the model server up until 11:47 (599.10 credits for the box, about 340 idle). Scripts now shut the server down at the end.
- **Next, ready:** `scripts/gpu/chat-train/retrain.sh` (every tool-calling step as its own example, no-tool answers capped at 12%, 24k tokens; about 150 credits). Waiting on the owner's go.

## Step 4: Skyling 1.0 (owner, 2026-11-21: "beat at least 15 out of 20 ... a reliable cheaper model ready by tonight", 551 credits; later "lets call it Skyling 1.0")

- **Result:** Qwen3.8-27B (Apache 2.0, untrained) with our house rules, reminders and checks in code scored 20, 19, 19 of 20 (one of them the reworded exam) and 92% on 189 unseen questions. The earlier setup that evening (version 0) scored 19, 16, 18, 18 and 17, 19. Report: `docs/research/2026-11-21-skyling-1-0.md`.
- **Why not training:** the first fine-tune's teacher scored 7 of 20, so a student could not reach 15. A stronger base model plus rules, reminders at the end of the prompt and checks in code got there in one evening. This setup is now a teacher worth distilling from.
- **What is ours:** `scripts/gpu/own-model/skyling-rules.txt`, `skyling-reminders.txt`, and the checks in `scripts/gpu/chat-eval/responses_shim.py --guard`. Run it with `scripts/gpu/own-model/v0_box.sh` (unattended, shuts itself down).
- **Cost:** about 2,060 messages an hour on one H100 (120 credits an hour). The 8-bit copy on an L40S keeps the quality but manages about 260 an hour, so it is the dearer host.
- **Spent:** 490.67 of 551 credits; about 130 of it idle minutes and one lost box while the chat restarted.
- **Found:** the quality filter read "$1,085.59" as a made-up "085.59" (fixed 2026-11-22). The first training set lost good examples to it.
- **Open, each needs the owner's yes:** run OpenAI once on the same 20 questions; build the rules, reminders and checks into the app behind a setting; three fixes to the app's own skills and tools (budget-coach step 1, life_load summary, find_subscriptions monthly total); a room for this work in HQ. Not done: the situation library against Skyling 1.0.

## Step 5: making Skyling 1.0 alive (owner, 2026-11-22: "not just answer my question but actually solve my problems and does things for the user", "continue training it")

- **What "alive" means, in rules** (`scripts/gpu/own-model/skyling-alive.txt`, reminders in `skyling-reminders-alive.txt`): when the person describes a problem (behind, stressed, swamped, a deadline) it looks once, then books the time or adds the to-do itself (create_events, create_tasks, at most three, only in free time a result showed), says what it did with its day and time and that it can be undone. It never moves money, deletes or changes what exists, writes graded work or contacts anyone, and a request that lands on a shift gets a heads-up and no booking. This stays inside the app's own autonomy rule (tasks and calendar only, every action undoable).
- **The test** (`compare-models.ts --exam alive`, six messages: behind on the essay, exam stress, plan my week, rent worry, a class that clashes with a shift, essay intro plus time): the perfect answers pass their own checks. Version 1.0 has not been run on it yet, so how far it is from alive is not known. The 20 old questions must keep passing: a regression test, because "act more" can break "change nothing when only asked".
- **Training data** (`build_alive_questions.py`, `filter.py --alive`): about 40% problem-style messages mixed into the usual bank; the filter now keeps self-booked calendar items and to-dos and still drops every other unasked change.
- **Next, needs credits:** (A) about 60 credits, one H100, `plan-alive.txt`: does the alive rule set pass the alive test and keep the 20, against Skyling 1.0 as it is. (B) about 230 credits: Skyling alive as the teacher, about 900 alive-mix questions on made-up lives, then a LoRA on Qwen3-8B (cheaper to host) and the same tests on the student. Account balance at 08:15 UTC: 1,014 credits. The 551 limit of last night is nearly used, so a new limit is the COO's or the owner's call.

## Step 6: Skyling 1.1, tested on the real model (2026-11-22, owner's cap for the round: 350 credits)

Full report: `docs/research/2026-11-22-skyling-alive.md`. Short version:

- **What it can do now that 1.0 could not:** books the study time when you say you are behind (blocks of 2 hours at most, ending before the exam), speaks first when the app opens, asks one real question, reads money and time together for a "should I", remembers what you tell it, holds you to a promise and follows up, breaks a big thing into dated steps, marks a thing done when you say you finished, says what can slide in a heavy week, undoes its own last thing, takes "not now" for an answer.
- **How:** rules 10 to 25 (`skyling-alive.txt`), reminders, and checks in code (`responses_shim.py --guard`): look before you book, nothing over an exam, no block over 2.5 hours, no "your paycheck will cover it", no change nobody asked for outside a short list, break-it-down saves the steps, two tries at putting an answer right.
- **Two ways of reminding, tested head to head:** every reminder on every message (645 words), or situation cards picked by our code from the person's words (`skyling-situations.txt`). On the old 20 they came out even and noisy (33 against 35 over two runs each).
- **The price:** plain questions got a little worse. Old 20: 15 to 19 where 1.0 gets 19 to 20. Unseen questions: 86% where 1.0 gets 92%. Two causes were my own new rules (fixed in the last round, see the report for the numbers after the fix).
- **Not done:** no training (agreed with the COO: train when the rules stop changing), nothing built into the app.
- **One mistake:** a stop timer left running from an earlier round cut round 4 short (about 8 credits). `runplan.sh` now stops its timer when the plan ends.
