#!/bin/sh
# The whole training-example job on one rented GPU box, unattended (owner, 2026-11-21: fewer approvals).
#   nohup sh /path/to/run_box.sh <teacher hf id> <served name> <stop at HHMM UTC> > /workspace/chatdata/box.log 2>&1 &
#
# Everything that has to be fast lives on the box's own disk (/root), not on /workspace: on a fresh box /workspace is a
# network volume, and Python imports from it crawled (vLLM never finished starting, 2026-11-21 06:14 to 06:39), and
# npm ci into it took 7 minutes. Only results are written to /workspace (kept when the box stops).
# Steps (installs and the teacher download run side by side): system packages and Postgres, the repo and its packages,
# vLLM, the teacher model, the teacher's score on the 20 test questions, made-up lives and the question bank, the
# examples (12 workers, stopped at the given time), the filter. Made-up data only (ADR 0023).
set -x
TEACHER="$1"; NAME="$2"; STOP_AT="${3:-2359}"
W=/workspace/chatdata; L=/root/job; REPO=$L/LIfeFlow
mkdir -p $W $L
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $W/steps.log; }

step start
# The teacher's weights (about 61 GB for gpt-oss-120b) go on the local disk when it has room; otherwise on /workspace,
# which is fine for a few big files (it was the thousands of small Python files that crawled).
TEACHER_DIR=$L/teacher
[ "$(df -BG --output=avail /root | tail -1 | tr -dc 0-9)" -lt 100 ] && TEACHER_DIR=/workspace/chatdata/teacher
echo "teacher dir $TEACHER_DIR, local disk free $(df -h --output=avail /root | tail -1)" >> $W/steps.log
# 1. vLLM into a local virtualenv, and the teacher into a local model folder, in the background
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm > $W/pip-vllm.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $W/pip-hf.log 2>&1 &&
  $L/hfenv/bin/hf download "$TEACHER" --exclude "original/*" --exclude "metal/*" --local-dir $TEACHER_DIR > $W/download.log 2>&1 && echo ok > $L/teacher.ready) &

# 2. system packages, Postgres, Node, the repo and the app's packages, all local
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $W/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $W/apt.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
for db in budgetflow_test_d budgetflow_gen_test; do su postgres -c "createdb -O budgetflow $db" || true; done
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO
cd $REPO
npm ci --ignore-scripts --no-audit --no-fund > $W/npm.log 2>&1
for db in budgetflow_test_d budgetflow_gen_test; do TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/$db npm run db:migrate:test > $W/migrate-$db.log 2>&1; done
# Never run the app as a superuser: Postgres lets a superuser skip row-level security, and then one made-up person's
# skyling would read every other person's rows. Superuser is only for the migrations above.
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
step app-ready

# 3. the teacher, once vLLM and the weights are both on local disk
while [ ! -f $L/vllm.ready ] || [ ! -f $L/teacher.ready ]; do sleep 5; done
step serve
nohup $L/venv/bin/vllm serve $TEACHER_DIR --served-model-name "$NAME" --port 8000 --max-model-len 32768 \
  --gpu-memory-utilization 0.92 --enable-auto-tool-choice --tool-call-parser openai > $W/vllm.log 2>&1 &

step teacher-eval
sh scripts/gpu/chat-eval/run.sh "$NAME" $W/eval-$NAME > $W/eval.log 2>&1
python3 scripts/gpu/chat-eval/summarize.py $W/eval-$NAME/raw-local.json > $W/eval-summary.txt 2>&1

step lives
python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $W/lives.log 2>&1
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions.json > $W/questions.log 2>&1

step generate
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log $W/shim.jsonl --dump $W/dump.jsonl > $W/shim.out 2>&1 &
SHIM=$!
sleep 2
PIDS=""
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions.json \
    --per-life 8 --worker $i --workers 12 --model "$NAME" --out $W/meta-$i.jsonl > $W/gen-$i.log 2>&1 &
  PIDS="$PIDS $!"
done
# stop the workers at the given time (UTC, HHMM) so the job stays inside its credit limit
(until [ "$(date -u +%H%M)" -ge "$STOP_AT" ]; do sleep 20; done; kill $PIDS 2>/dev/null; echo "STEP deadline $(date -u +%H:%M:%S)" >> $W/steps.log) &
wait $PIDS
sleep 5
kill $SHIM

step filter
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump $W/dump.jsonl --out $W/train.jsonl --report $W/filter-report.json > $W/filter.log 2>&1
step done
echo DONE > $W/done
