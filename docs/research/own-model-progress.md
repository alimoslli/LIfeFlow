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
