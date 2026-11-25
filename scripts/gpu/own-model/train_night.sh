#!/bin/sh
# The training stage of a training night: train the large model itself on the checked examples, merge it, serve it and score
# it. Unattended, with a hard stop at a clock time. Made-up data only (ADR 0023). Works on a fresh box (it sets the box up
# itself) or on the box gen_box.sh left set up.
#
#   nohup sh train_night.sh <train minutes, default 80> <hard stop, UTC clock time like 10:58> > /workspace/ownmodel/night1/train_night.log 2>&1 &
#
# While a reader checks the examples, this loads the model and tries a few examples (seconds each, memory), then waits for the
# checked training set at /workspace/ownmodel/night1/train.jsonl (20 minutes at most), doing real work on the GPU meanwhile:
# a box whose GPU sits idle for five minutes is taken away, and a sleeping loop does not count (learned 2026-11-25).
# Results: /workspace/ownmodel/night1/ (train.log, adapter/ the small trained part, status.txt), board.txt for the scores.
TRAIN_MIN="${1:-80}"; STOP_AT="${2:-23:59}"
T=/workspace/ownmodel; N=$T/night1; L=/root/job; REPO=$L/LIfeFlow
mkdir -p $N
START=$(date +%s); END=$(date -u -d "$STOP_AT" +%s); ST=$N/status.txt; : > $ST
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
note() { echo "$1" | tee -a $ST; }
left() { echo $(( (END - $(date +%s)) / 60 )); }
shutdown_all() {
  pkill -f "[t]rain_big.py"; pkill -f "[v]llm serve"; pkill -f "[V]LLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[c]ompare-models.ts"; pkill -f "[r]unplan.sh"
  service postgresql stop > /dev/null 2>&1
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
fail() { note "FAILED: $1"; step "failed: $1"; shutdown_all; kill $TIMER 2> /dev/null; exit 1; }
(until [ "$(date +%s)" -ge "$END" ]; do sleep 15; done; echo "FAILED: hard stop at $STOP_AT" >> $ST
 echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[t]rain_night.sh") &
TIMER=$!
touch $T/gen1-release
step "train night start, $(left) minutes to the hard stop"
if [ ! -d $REPO/.git ]; then
  # ---- a fresh box: the training side first (model server with its libraries, the model straight into memory), the app
  # side (database, node, packages: only the scoring needs them) in the background while the model trains
  step "fresh box setup"
  mkdir -p $L/models
  (python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm peft accelerate > $N/pip.log 2>&1 && echo ok > $L/vllm.ready) &
  (python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $N/pip-hf.log 2>&1 \
    && $L/hfenv/bin/hf download Qwen/Qwen3.8-27B --exclude "original/*" --exclude "metal/*" --local-dir /dev/shm/qwen38-27b > $N/dl.log 2>&1 \
    && date -u +%H:%M:%S > /dev/shm/qwen38-27b.ready) &
  git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO || fail "could not fetch the code"
  (DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $N/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $N/apt.log 2>&1)
   service postgresql start; sleep 3
   su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\""
   su postgres -c "createdb -O budgetflow budgetflow_test_d"
   curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L
   cd $REPO && npm ci --ignore-scripts --no-audit --no-fund > $N/npm.log 2>&1 \
     && TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d npm run db:migrate:test > $N/migrate.log 2>&1 \
     && su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\"" && echo ok > $L/app.ready) > $N/app-setup.log 2>&1 &
  W=0; while [ ! -f $L/vllm.ready ] || [ ! -f /dev/shm/qwen38-27b.ready ]; do sleep 5; W=$((W + 1)); [ $W -gt 240 ] && fail "the libraries or the model did not arrive in 20 minutes"; done
  ln -sfn /dev/shm/qwen38-27b $L/models/qwen38-27b
else
  cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD
  pkill -f "[v]llm serve"; sleep 2; pkill -f "[V]LLM::EngineCore"
  $L/venv/bin/pip install -q peft accelerate > $N/pip.log 2>&1 || fail "peft did not install (see $N/pip.log)"
  echo ok > $L/app.ready
fi
cd $REPO && git log --oneline -1
# The optional fast kernels for this model's linear-attention layers (fla, causal-conv1d) are left out on purpose: the plain
# path is the one that was tested end to end, and this night gets one attempt.
$L/venv/bin/python -c "import torch, transformers, peft; print('torch', torch.__version__, 'transformers', transformers.__version__, 'peft', peft.__version__)" || fail "the training libraries do not load"
N0=0; until [ "$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)" -lt 3000 ]; do sleep 3; N0=$((N0 + 1)); [ $N0 -gt 40 ] && fail "the GPU's memory was not freed"; done

# The box has 413 GB of memory: the trained model is written to memory (/dev/shm) instead of disk, and the base model is read
# from there too when a copy was put there beforehand. That saves minutes of disk time twice.
BASE=$L/models/qwen38-27b; [ -f /dev/shm/qwen38-27b.ready ] && BASE=/dev/shm/qwen38-27b
mkdir -p /dev/shm/skyling-27b && ln -sfn /dev/shm/skyling-27b $L/models/skyling-27b
RESERVE=24   # minutes kept before the hard stop for merging, serving and scoring
run_train() {
  PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True $L/venv/bin/python scripts/gpu/chat-train/train_big.py --data $N/train.jsonl --smoke-data $T/gen1/train-new.jsonl --smoke 4 --wait-minutes 20 \
    --model $BASE --adapter $N/adapter --out /dev/shm/skyling-27b --epochs 2 --max-minutes "$1" --until $(( END - RESERVE * 60 )) > $N/train.log 2>&1
}
# never train into the hard stop
ROOM=$(( $(left) - RESERVE - 4 )); [ "$TRAIN_MIN" -gt "$ROOM" ] && TRAIN_MIN=$ROOM
[ "$TRAIN_MIN" -ge 10 ] || fail "only $ROOM minutes left for training"
step "load, try, then train up to $TRAIN_MIN minutes"
run_train "$TRAIN_MIN" || fail "training stopped (see $N/train.log): $(grep -v "^step \|Warning\|warn" $N/train.log | tail -3 | tr '\n' ' ' | cut -c1-300)"
note "SMOKE: $(grep "^SMOKE [0-9]" $N/train.log | tr '\n' ';' | cut -c1-400)"
note "TRAIN: $(grep "^train [0-9]" $N/train.log | cut -c1-120); $(grep "holdout loss before" $N/train.log); $(grep "^TRAIN DONE" $N/train.log | cut -c1-260)"
grep -q "^MERGED" $N/train.log || fail "the trained model was not saved (see $N/train.log)"
step "trained and merged"

# score the trained model: with nothing of ours around it (before training that was the n1-teacher-bare-old20 line), then with our rules, cards and checks
CARDS="--think off --guard --system-append scripts/gpu/own-model/skyling-rules.txt --system-append scripts/gpu/own-model/skyling-alive.txt --remind scripts/gpu/own-model/skyling-reminders-alive2.txt --situations scripts/gpu/own-model/skyling-situations.txt"
cat > $N/plan-trained.txt <<PLAN
eval|n1-trained-bare-old20|--no-retry --alive-rules|--think off
eval|n1-trained-full-old20|--no-retry --alive-rules|$CARDS
eval|n1-trained-bare-alive6|--no-retry --exam alive|--think off
eval|n1-trained-full-alive6|--no-retry --exam alive|$CARDS
eval|n1-trained-full-trust4|--no-retry --exam trust|$CARDS
eval|n1-trained-full-day4|--no-retry --exam day|$CARDS
PLAN
W=0; until [ -f $L/app.ready ]; do sleep 5; W=$((W + 1)); [ $W -gt 36 ] && fail "the app side of the box was not ready for scoring (see $N/app-setup.log, npm.log, migrate.log); the trained part is saved in $N/adapter"; done
step "score the trained model, $(left) minutes left"
sh scripts/gpu/own-model/runplan.sh skyling-27b $(( $(left) - 1 )) "--max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder" $N/plan-trained.txt > $N/evals.log 2>&1
grep "^RESULT n1-" $T/board.txt | cut -c1-230 >> $ST
note "ALL DONE in $(( ($(date +%s) - START) / 60 )) minutes"
step "train night done"
shutdown_all
kill $TIMER 2> /dev/null
