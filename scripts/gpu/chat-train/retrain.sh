#!/bin/sh
# Retrain our skyling model from examples already made (no teacher, no new generation), then score it on the 20 test
# questions, on one fresh box, unattended. Ends by shutting down the model server so the box goes idle and stops
# itself (2026-11-21: a server left running kept an H100 billing for almost 3 hours after the work was done).
#   nohup sh retrain.sh <train minutes> <out dir under /workspace> > /workspace/retrain.log 2>&1 &
set -x
TRAIN_MIN="${1:-60}"; T="${2:-/workspace/chattrain2}"
W=/workspace/chatdata; L=/root/job; REPO=$L/LIfeFlow
mkdir -p $T $L
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
finish() { step "$1"; pkill -f "[v]llm serve"; sleep 5; pkill -f "VLLM::EngineCore"; echo DONE > $T/done; exit 0; }

step start
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm peft > $T/pip.log 2>&1 && echo ok > $L/venv.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > /dev/null 2>&1 &&
  $L/hfenv/bin/hf download Qwen/Qwen3-8B --local-dir $L/qwen3-8b > $T/download.log 2>&1 && echo ok > $L/qwen.ready) &
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $T/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $T/apt.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
su postgres -c "createdb -O budgetflow budgetflow_test_d" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO
cd $REPO && git log --oneline -1
npm ci --ignore-scripts --no-audit --no-fund > $T/npm.log 2>&1
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d npm run db:migrate:test > $T/migrate.log 2>&1
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""

step filter
# both batches: the even one, plus the first one's examples capped per skill
echo "/workspace/chatdata-run2a 120" > $W/also.txt
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump $W/dump.jsonl --out $T/train.jsonl --report $T/filter-report.json > $T/filter.log 2>&1
cat $T/filter.log

while [ ! -f $L/venv.ready ] || [ ! -f $L/qwen.ready ]; do sleep 5; done
step train
$L/venv/bin/python scripts/gpu/chat-train/train_chat.py --data $T/train.jsonl --model $L/qwen3-8b --out $T/adapter --epochs 1 --max-minutes "$TRAIN_MIN" > $T/train.log 2>&1 || finish train-failed
tail -3 $T/train.log

step serve
nohup $L/venv/bin/vllm serve $L/qwen3-8b --served-model-name qwen3-8b --port 8000 --max-model-len 32768 --gpu-memory-utilization 0.9 \
  --enable-auto-tool-choice --tool-call-parser hermes --enable-lora --lora-modules skyling=$T/adapter --max-lora-rank 16 > $T/vllm.log 2>&1 &
step eval-tuned
timeout 1800 sh scripts/gpu/chat-eval/run.sh skyling $T/eval-skyling --no-think > $T/eval-tuned.log 2>&1
python3 scripts/gpu/chat-eval/summarize.py $T/eval-skyling/raw-local.json > $T/summary-tuned.txt 2>&1
finish done
