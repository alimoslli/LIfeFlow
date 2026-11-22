#!/bin/sh
# Serve one model and run a list of checks against it, on a box bakeoff.sh set up. Unattended, with a hard stop.
#   nohup sh runplan.sh <name> <hard stop minutes> "<vllm args>" <plan file> [keep] > /workspace/ownmodel/plan.log 2>&1 &
# Plan file, one check per line:
#   eval|<label>|<harness args>|<shim args>          the 20 test questions (see scripts/gpu/chat-eval/run.sh)
#   holdout|<label>|<questions>|<shim args>          unseen questions, quality filter and speed (holdout.sh)
# Results are appended to /workspace/ownmodel/board.txt; a label already there is skipped. With "keep" as the last
# argument the model stays up afterwards (for a follow-up plan); otherwise everything is shut down so the box idles out.
NAME="$1"; STOP_MIN="$2"; VLLM_ARGS="$3"; PLAN="$4"; KEEP="$5"
END=$(( $(date +%s) + STOP_MIN * 60 ))
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
have() { grep -q "^RESULT $1 \|^HOLDOUT $1:" $T/board.txt 2>/dev/null; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "[V]LLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[c]ompare-models.ts"; pkill -f "[g]enerate.ts"
  service postgresql stop
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
(until [ "$(date +%s)" -ge "$END" ]; do sleep 20; done; echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[r]unplan.sh") &
TIMER=$!   # stopped at the end: a timer left behind once cut the next round short on the same box (2026-11-22)
cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD; git log --oneline -1
service postgresql start; sleep 2
if ! curl -sf http://127.0.0.1:8000/v1/models | grep -q "\"$NAME\""; then
  pkill -f "[v]llm serve"; sleep 3; pkill -f "[V]LLM::EngineCore"; sleep 5
  step "serve $NAME"
  # shellcheck disable=SC2086
  nohup $L/venv/bin/vllm serve $L/models/$NAME --served-model-name "$NAME" --port 8000 --gpu-memory-utilization 0.92 --max-num-seqs 32 --enable-auto-tool-choice $VLLM_ARGS > $T/vllm-plan-$NAME.log 2>&1 &
  VPID=$!
  until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do
    # the server died while loading: say why, shut down, leave the box idle
    kill -0 $VPID 2>/dev/null || { echo "FAILED serve $NAME: $(grep -E 'Error|error' $T/vllm-plan-$NAME.log | tail -1 | cut -c1-200)" >> $T/board.txt; shutdown_all; exit 1; }
    sleep 5
  done
fi
step "ready $NAME"
while IFS='|' read -r KIND LABEL A B; do
  [ -z "$KIND" ] && continue
  have "$LABEL" && continue
  step "$KIND $LABEL"
  if [ "$KIND" = eval ]; then
    # shellcheck disable=SC2086
    HARNESS_ARGS="$A" timeout 2400 sh scripts/gpu/chat-eval/run.sh "$NAME" $T/$LABEL $B > $T/eval-$LABEL.log 2>&1
    python3 scripts/gpu/chat-eval/summarize.py $T/$LABEL/raw-local.json > $T/summary-$LABEL.txt 2>&1
    echo "RESULT $LABEL $(head -3 $T/summary-$LABEL.txt | tr '\n' ' ')" >> $T/board.txt
  elif [ "$KIND" = holdout ]; then
    # shellcheck disable=SC2086
    sh scripts/gpu/own-model/holdout.sh "$NAME" "$LABEL" "$A" $B > $T/holdout-$LABEL.log 2>&1
  fi
done < "$PLAN"
step "plan-done $PLAN"
[ "$KEEP" = keep ] || shutdown_all
echo DONE > "$PLAN.done"
kill $TIMER 2>/dev/null
