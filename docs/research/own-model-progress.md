# Own model: steps 1 and 2, progress notes

Working notes so the work can be picked up if a chat stops (owner, 2026-11-21: "if the limit runs out, stop before that, and we continue tomorrow at 11 am"). Final results go into `docs/research/2026-11-20-skill-router-pilot.md` (step 1) and a new step 2 report.

Owner's go-ahead (2026-11-21, 04:05 UTC): start steps 1 and 2 from the pilot report's next steps. Step 2 GPU limit: 120 credits (the estimate given, 60 to 120). Made-up data only (ADR 0023). No change under `src/`.

## Step 1: simple router on a CPU (no GPU money)

- Script: `scripts/gpu/router/embedding_router.py`. Results: `scripts/gpu/router/embedding_router_results.json`.
- Done: seeds only (153 rows). Best on fresh: all-MiniLM-L6-v2 + small linear classifier, 53/74 (72%), 7 ms a message on a CPU.
- To do: the same with the pilot's 5,284 teacher rows (`data/train.json.gz`, copied from `/workspace/router/out/train.json` on the GPU storage).

## Step 2: an untuned open chat model on the Jarvis eval

- Harness: `scripts/compare-models.ts` (the real skyling loop, the eval student, 18 questions, automatic checks for facts, tools, budget and writes).
- Plan: on one rented H100, serve the model with vLLM (chat format), put a small translator in front that speaks the Responses format the app uses, run Node and a throwaway Postgres on the box, run the harness.
- Models: Qwen3-8B first (on the GPU storage already), then gpt-oss-20b if credits allow.
- Status: not started on a GPU yet.
