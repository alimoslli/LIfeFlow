# Skill router pilot (GPU)

Pilot from 2026-11-21. Results: `docs/research/2026-11-20-skill-router-pilot.md`. Nothing here is used by the app.

Made-up data only (the repo's skill evals plus teacher rewrites of them), per ADR 0023.

| Step | Where | Command |
|---|---|---|
| 1. Split the 196 eval prompts into seeds and a held-out set | anywhere | `python3 build_split.py` |
| 2. Teacher writes rewrites, dedup, drift filter | GPU box | `python gen.py Qwen/Qwen2.5-14B-Instruct` |
| 3. Fresh test set | written by hand | `data/fresh.json` (74 messages, 2 per skill) |
| 4. LoRA fine-tune | GPU box | `python train.py HuggingFaceTB/SmolLM3-3B smol 2` |
| 5a. Score a model | GPU box | `python evalm.py HuggingFaceTB/SmolLM3-3B smol-base` and `... smol-tuned out/adapter-smol` |
| 5b. Score the app's keyword router | repo root | `npx tsx scripts/gpu/router/keyword_router.ts` |

On the box the files sit in `/workspace/router` (with `data/` beside them); outputs go to `/workspace/router/out`.
Tested with Python 3.12, torch 2.13, transformers 5.23, peft 0.22 on one H100.
