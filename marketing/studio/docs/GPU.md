# GPU runbook (Higgsfield GPU Harness)

The GPU work is run by Claude with the Higgsfield tools, always from a plan and only after the owner's yes. The shared Higgsfield account also pays for other chats: read the balance right before anything paid, and tell the COO first about anything over about 100 credits.

## 1. Plan (free)

1. Refresh `gpu/catalog.json` from `gpu_list_gpus` and `gpu_list_models` if it's older than a week.
2. Write the jobs: `{ "jobs": [{ "id", "model", "count", "seconds" }] }`.
3. `node gpu/planner.mjs <jobs.json>` prints the boxes, the model order (one load per model), the estimate, the cap to approve (estimate + 30%), and what the same video seconds would cost on hosted MAGI-2.
4. Show the owner the plan: GPU, price an hour, estimate, cap, the hosted comparison, and the licence of each model. Blocked models (licence) are skipped.

## 2. Run (paid, after the yes)

1. `balance`: stop if it's below the cap.
2. `gpu_rent`: the plan's GPU, `max_credits_per_hour` equal to its price, `auto_pause_minutes: 10`, a new `idempotency_key`. For one-off images `gpu_generate` rents and loads in one call.
3. `gpu_rental` until working, then `gpu_rental_prepare` with the first model, and `gpu_rental` until it's loaded.
4. Batch: `gpu_rental_generate` for every item of that model, then `jobs_wait` in groups of 12. Next model: `gpu_rental_prepare` again on the same box.
5. Custom code (LoRA training, upscaling, ComfyUI, Remotion): `gpu_rental_exec`, with work started under `nohup` and a log, polled every call. Model weights and datasets go in `/workspace` (it persists across boxes); set `HF_HOME=/workspace/hf`.
6. Retrieve: download each result URL into `public/generated/<project>/` with a `.json` next to it (model, prompt, seed, GPU, seconds).
7. **Stop**: `gpu_rental_stop` as soon as the last job is back, then `gpu_my` to read the real credits spent.
8. Log it: a row in `gpu/measured.json` (minutes, credits per item) and a row in the project's `costs.json` (`kind: "gpu"`, credits). The planner uses these speeds from then on.

## 3. Never

- Rent, train or generate without the owner's yes on the plan's cap.
- Leave a box running: always `auto_pause_minutes`, always stop at the end, and check `gpu_my` for live boxes at the start of every session (one H100 ran idle for an hour on Nov 25 and cost 126 credits).
- Use a model whose licence blocks LifeFlow (MiniMax H3, FLUX.2 dev).
