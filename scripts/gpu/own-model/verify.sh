#!/bin/sh
# Is the chosen model reliable, not just lucky once? On a box bakeoff.sh set up (the model's files are in
# /root/job/models/<name>): serve it, run the 20 test questions two more times, the reworded exam B, and the
# unseen-questions check with its speed. Results go to /workspace/ownmodel/board.txt. Unattended, with a hard stop.
#   nohup sh verify.sh <name> <label> <hard stop minutes> "<vllm args>" [shim args...] > /workspace/ownmodel/verify.log 2>&1 &
set -x
NAME="$1"; LABEL="$2"; STOP_MIN="$3"; VLLM_ARGS="$4"; shift 4
END=$(( $(date +%s) + STOP_MIN * 60 ))
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "VLLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[c]ompare-models.ts"; pkill -f "[g]enerate.ts"
  service postgresql stop
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
(until [ "$(date +%s)" -ge "$END" ]; do sleep 20; done; echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[v]erify.sh") &
cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD; git log --oneline -1
service postgresql start; sleep 2

step "verify serve $NAME"
# shellcheck disable=SC2086
nohup $L/venv/bin/vllm serve $L/models/$NAME --served-model-name "$NAME" --port 8000 --gpu-memory-utilization 0.92 --max-num-seqs 32 --enable-auto-tool-choice $VLLM_ARGS > $T/vllm-verify-$NAME.log 2>&1 &
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do sleep 5; done
evalrun() {
  RUN="$1"; HARNESS="$2"; shift 2
  step "eval $RUN"
  HARNESS_ARGS="$HARNESS" timeout 2400 sh scripts/gpu/chat-eval/run.sh "$NAME" $T/$RUN "$@" > $T/eval-$RUN.log 2>&1
  python3 scripts/gpu/chat-eval/summarize.py $T/$RUN/raw-local.json > $T/summary-$RUN.txt 2>&1
  echo "RESULT $RUN $(head -3 $T/summary-$RUN.txt | tr '\n' ' ')" >> $T/board.txt
}
evalrun $LABEL-run2 "--no-retry" "$@"
evalrun $LABEL-run3 "--no-retry" "$@"
evalrun $LABEL-examB "--no-retry --exam b" "$@"
step "holdout $LABEL"
sh scripts/gpu/own-model/holdout.sh "$NAME" "$LABEL" 162 "$@" > $T/holdout-$LABEL.log 2>&1
step verify-done
shutdown_all
echo DONE > $T/verify-done
