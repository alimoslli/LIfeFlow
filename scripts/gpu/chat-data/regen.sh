#!/bin/sh
# Generate the examples again on a box where run_box.sh already set everything up (vLLM, Node, the app, the teacher,
# the lives and the question bank in /root/job). Keeps the earlier outputs in <W>-<tag>.
#   nohup sh regen.sh <served name> <per life> <stop at HHMM UTC> <tag for the old outputs> > /workspace/chatdata-regen.log 2>&1 &
set -x
NAME="$1"; PER="${2:-12}"; STOP_AT="${3:-2359}"; TAG="${4:-old}"
W=/workspace/chatdata; L=/root/job; REPO=$L/LIfeFlow
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
mkdir -p $W-$TAG
for f in $W/meta-*.jsonl $W/dump.jsonl $W/shim.jsonl $W/gen-*.log $W/done $W/train.jsonl $W/filter-report.json; do [ -e "$f" ] && mv "$f" $W-$TAG/; done
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $W/steps.log; }
cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD; git log --oneline -1

step regen-serve
nohup $L/venv/bin/vllm serve $L/teacher --served-model-name "$NAME" --port 8000 --max-model-len 32768 \
  --gpu-memory-utilization 0.92 --enable-auto-tool-choice --tool-call-parser openai > $W/vllm-regen.log 2>&1 &
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do sleep 3; done
# a fresh database, so earlier runs' to-dos and events don't pile up in the same accounts
su postgres -c "dropdb --if-exists budgetflow_gen_test" && su postgres -c "createdb -O budgetflow budgetflow_gen_test"
su postgres -c "psql -c \"alter role budgetflow superuser\""
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test npm run db:migrate:test > $W/migrate-regen.log 2>&1
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""

step regen-generate
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log $W/shim.jsonl --dump $W/dump.jsonl > $W/shim.out 2>&1 &
SHIM=$!
sleep 2
PIDS=""
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions.json \
    --per-life "$PER" --worker $i --workers 12 --model "$NAME" --out $W/meta-$i.jsonl > $W/gen-$i.log 2>&1 &
  PIDS="$PIDS $!"
done
(until [ "$(date -u +%H%M)" -ge "$STOP_AT" ]; do sleep 20; done; kill $PIDS 2>/dev/null; echo "STEP deadline $(date -u +%H:%M:%S)" >> $W/steps.log) &
wait $PIDS
sleep 5
kill $SHIM
step regen-filter
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump $W/dump.jsonl --out $W/train.jsonl --report $W/filter-report.json > $W/filter.log 2>&1
step regen-done
echo DONE > $W/done
