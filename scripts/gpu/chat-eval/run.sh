#!/bin/sh
# Step 2 on a rented GPU box: run the skyling's real loop (scripts/compare-models.ts, all 18 questions) against an open
# model served by vLLM, through responses_shim.py. Made-up data only (the eval student in a throwaway test database).
#
#   sh scripts/gpu/chat-eval/run.sh <served model name> <out dir> [--no-think]
#
# Expects: vLLM serving the model on :8000 (chat completions, auto tool choice), Node on PATH, Postgres with the
# migrated budgetflow_test_d database, npm ci done. See docs/research/own-model-progress.md for the setup used.
set -e
MODEL="$1"; OUT="$2"; THINK="$3"
cd "$(dirname "$0")/../../.."
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do sleep 3; done
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log "$OUT/shim.jsonl" $THINK &
SHIM=$!
mkdir -p "$OUT"
sleep 2
export TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d CMP_KEY=not-a-real-key
export CMP_LOCAL_URL=http://127.0.0.1:8100/v1 CMP_LOCAL_MODEL="$MODEL" CMP_LOCAL_ID="$MODEL"
node --conditions=react-server --import tsx scripts/compare-models.ts run --model local --out "$OUT"
kill $SHIM
echo "RUN DONE $MODEL"
