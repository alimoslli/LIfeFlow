#!/bin/sh
# Stage 2 of a training night, on the box gen_box.sh left set up ("keep"): train the large model itself on the checked examples,
# merge it, serve it and score it. Unattended, with a hard stop at a clock time. Made-up data only (ADR 0023).
#
#   nohup sh train_night.sh <train minutes, default 80> <hard stop, UTC clock time like 10:58> > /workspace/ownmodel/night1/train_night.log 2>&1 &
#
# It starts right after the examples are made: while a reader checks them, this loads the model and tries a few examples
# (seconds each, memory), then waits for the checked training set at /workspace/ownmodel/night1/train.jsonl (20 minutes at most).
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
cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD; git log --oneline -1
pkill -f "[v]llm serve"; sleep 2; pkill -f "[V]LLM::EngineCore"
P=$L/venv/bin/pip
$P install -q peft accelerate > $N/pip.log 2>&1 || fail "peft did not install (see $N/pip.log)"
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
step "score the trained model, $(left) minutes left"
sh scripts/gpu/own-model/runplan.sh skyling-27b $(( $(left) - 1 )) "--max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder" $N/plan-trained.txt > $N/evals.log 2>&1
grep "^RESULT n1-" $T/board.txt | cut -c1-230 >> $ST
note "ALL DONE in $(( ($(date +%s) - START) / 60 )) minutes"
step "train night done"
shutdown_all
kill $TIMER 2> /dev/null
