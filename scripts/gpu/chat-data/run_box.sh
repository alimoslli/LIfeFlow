#!/bin/sh
# The whole training-example job on one rented GPU box, unattended (owner, 2026-11-21: fewer approvals).
#   nohup sh scripts/gpu/chat-data/run_box.sh <teacher hf id> <served name> <generation minutes> > /workspace/chatdata/box.log 2>&1 &
# Steps: system packages and Postgres, the app's packages, the teacher model, the teacher's score on the 20 test
# questions, made-up lives and the question bank, the examples (12 workers, stopped at the time limit), the filter.
# Everything durable goes to /workspace (kept when the box stops). Made-up data only (ADR 0023).
set -x
TEACHER="$1"; NAME="$2"; GEN_MIN="${3:-35}"
W=/workspace/chatdata; REPO=/workspace/chateval/LIfeFlow
mkdir -p $W; cd $REPO
export PATH=/workspace/node/bin:$PATH HF_HOME=/workspace/hf
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $W/steps.log; }

step packages
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $W/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $W/apt.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
for db in budgetflow_test_d budgetflow_gen_test; do su postgres -c "createdb -O budgetflow $db" || true; done
npm ci --ignore-scripts --no-audit --no-fund > $W/npm.log 2>&1
for db in budgetflow_test_d budgetflow_gen_test; do TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/$db npm run db:migrate:test > $W/migrate-$db.log 2>&1; done

step download
/opt/venv/bin/hf download "$TEACHER" --exclude "original/*" --exclude "metal/*" > $W/download.log 2>&1

step serve
nohup /workspace/vllm-venv/bin/vllm serve "$TEACHER" --served-model-name "$NAME" --port 8000 --max-model-len 32768 \
  --gpu-memory-utilization 0.92 --enable-auto-tool-choice --tool-call-parser openai > $W/vllm.log 2>&1 &

step teacher-eval
sh scripts/gpu/chat-eval/run.sh "$NAME" $W/eval-$NAME > $W/eval.log 2>&1
python3 scripts/gpu/chat-eval/summarize.py $W/eval-$NAME/raw-local.json > $W/eval-summary.txt 2>&1

step lives
python3 scripts/gpu/chat-data/make_lives.py --out $W/lives --per-persona 6 > $W/lives.log 2>&1
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $W/questions.json > $W/questions.log 2>&1

step generate
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log $W/shim.jsonl --dump $W/dump.jsonl > $W/shim.out 2>&1 &
SHIM=$!
sleep 2
PIDS=""
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test timeout $((GEN_MIN * 60)) \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $W/lives --questions $W/questions.json \
    --per-life 8 --worker $i --workers 12 --model "$NAME" --out $W/meta-$i.jsonl > $W/gen-$i.log 2>&1 &
  PIDS="$PIDS $!"
done
wait $PIDS
sleep 5
kill $SHIM

step filter
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump $W/dump.jsonl --out $W/train.jsonl --report $W/filter-report.json > $W/filter.log 2>&1
step done
echo DONE > $W/done
