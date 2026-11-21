#!/bin/sh
# Run the skyling's real loop (scripts/compare-models.ts, the 20 test questions) against an open model served by vLLM,
# through responses_shim.py. Made-up data only (the eval student in a throwaway test database).
#
#   [HARNESS_ARGS="--no-retry --exam b"] sh scripts/gpu/chat-eval/run.sh <served model name> <out dir> [shim args...]
#   e.g. sh scripts/gpu/chat-eval/run.sh qwen38-27b /workspace/x/run1 --think on --system-append scripts/gpu/own-model/skyling-rules.txt
#
# Expects: vLLM serving the model on :8000 (chat completions, auto tool choice), Node on PATH, Postgres with the
# migrated budgetflow_test_d database (role not a superuser), npm ci done.
MODEL="$1"; OUT="$2"; shift 2
cd "$(dirname "$0")/../../.."
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do sleep 3; done
mkdir -p "$OUT"
pkill -f "[r]esponses_shim.py" 2>/dev/null; sleep 1
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log "$OUT/shim.jsonl" "$@" > "$OUT/shim.out" 2>&1 &
SHIM=$!
trap 'kill $SHIM 2>/dev/null' EXIT
sleep 2
export TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d CMP_KEY=not-a-real-key
export CMP_LOCAL_URL=http://127.0.0.1:8100/v1 CMP_LOCAL_MODEL="$MODEL" CMP_LOCAL_ID="$MODEL"
node --conditions=react-server --import tsx scripts/compare-models.ts run --model local --out "$OUT" $HARNESS_ARGS
echo "RUN DONE $MODEL"
