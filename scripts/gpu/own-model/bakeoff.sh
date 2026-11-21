#!/bin/sh
# Which open model, with our skyling house rules, runs the skyling best? One rented GPU box, unattended.
#   nohup sh bakeoff.sh <hard stop, minutes from now> > /workspace/ownmodel/bakeoff.log 2>&1 &
# Sets the box up on its own disk, re-scores the earlier runs with the corrected checks, then for each candidate:
# download, serve with vLLM, run the 20 test questions through the real skyling loop, stop. Each result is one line in
# /workspace/ownmodel/board.txt. At the hard stop everything is shut down so the box goes idle and stops itself.
# Made-up data only (ADR 0023).
set -x
STOP_MIN="${1:-80}"; END=$(( $(date +%s) + STOP_MIN * 60 ))
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow
RULES=scripts/gpu/own-model/skyling-rules.txt
mkdir -p $T $L/models
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "VLLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[c]ompare-models.ts"
  service postgresql stop
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
# hard stop: nothing left running, so the idle timer ends the box even if nobody is watching
(until [ "$(date +%s)" -ge "$END" ]; do sleep 20; done; echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[b]akeoff.sh") &

step start
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm > $T/pip-vllm.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $T/pip-hf.log 2>&1 && echo ok > $L/hf.ready) &
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
step app-ready

# earlier runs under the corrected checks (no model needed)
for pair in "teacher-gpt-oss-120b:/workspace/chatdata/eval-gpt-oss-120b" "qwen3-8b-untuned:/workspace/chattrain/eval-qwen3-8b-base" "qwen3-8b-trained-v1:/workspace/chattrain/eval-skyling"; do
  name=${pair%%:*}; src=${pair#*:}
  if [ -f $src/raw-local.json ]; then
    mkdir -p $T/rescored-$name && cp $src/raw-local.json $T/rescored-$name/
    echo "RESCORED $name $(node --conditions=react-server --import tsx scripts/compare-models.ts rescore --out $T/rescored-$name 2>/dev/null | tr '\n' ' ')" >> $T/board.txt
  fi
done
step rescored

while [ ! -f $L/vllm.ready ] || [ ! -f $L/hf.ready ]; do sleep 3; done

# serve <hf id> <name> <vllm args...>: download to local disk, start vLLM, wait until it answers (or gives up)
serve() {
  ID="$1"; NAME="$2"; shift 2
  step "download $NAME"
  $L/hfenv/bin/hf download "$ID" --exclude "original/*" --exclude "metal/*" --local-dir $L/models/$NAME > $T/download-$NAME.log 2>&1 || { echo "FAILED download $NAME" >> $T/board.txt; return 1; }
  step "serve $NAME"
  nohup $L/venv/bin/vllm serve $L/models/$NAME --served-model-name "$NAME" --port 8000 --gpu-memory-utilization 0.92 --enable-auto-tool-choice "$@" > $T/vllm-$NAME.log 2>&1 &
  VPID=$!
  for i in $(seq 1 240); do
    curl -sf http://127.0.0.1:8000/v1/models > /dev/null && { step "ready $NAME"; return 0; }
    kill -0 $VPID 2>/dev/null || { echo "FAILED serve $NAME: $(grep -E 'Error|error' $T/vllm-$NAME.log | tail -1 | cut -c1-200)" >> $T/board.txt; return 1; }
    sleep 5
  done
  echo "FAILED serve $NAME: not ready in 20 minutes" >> $T/board.txt
  return 1
}
stopserve() { pkill -f "[v]llm serve"; sleep 4; pkill -f "VLLM::EngineCore"; sleep 6; }
# evalrun <served name> <label> <harness args> <shim args...>
evalrun() {
  NAME="$1"; LABEL="$2"; HARNESS="$3"; shift 3
  step "eval $LABEL"
  HARNESS_ARGS="$HARNESS" timeout 2400 sh scripts/gpu/chat-eval/run.sh "$NAME" $T/$LABEL "$@" > $T/eval-$LABEL.log 2>&1
  python3 scripts/gpu/chat-eval/summarize.py $T/$LABEL/raw-local.json > $T/summary-$LABEL.txt 2>&1
  echo "RESULT $LABEL $(head -3 $T/summary-$LABEL.txt | tr '\n' ' ')" >> $T/board.txt
}

# 1. Qwen3.8-27B (Apache 2.0, Aug 2026): thinking on and off with the rules, then without the rules
if serve Qwen/Qwen3.8-27B qwen38-27b --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder; then
  evalrun qwen38-27b qwen38-think-rules "--no-retry" --think on --system-append $RULES
  evalrun qwen38-27b qwen38-nothink-rules "--no-retry" --think off --system-append $RULES
fi
stopserve qwen38-27b

# 2. gpt-oss-20b (Apache 2.0): the small, cheap one
if serve openai/gpt-oss-20b gpt-oss-20b --max-model-len 65536 --tool-call-parser openai; then
  evalrun gpt-oss-20b oss20-rules "--no-retry" --system-append $RULES
  evalrun gpt-oss-20b oss20-high-rules "--no-retry" --reasoning-effort high --system-append $RULES
fi
stopserve gpt-oss-20b

# 3. Gemma 4 31B (Apache 2.0)
if serve google/gemma-4-31B-it gemma4-31b --max-model-len 65536 --tool-call-parser gemma4; then
  evalrun gemma4-31b gemma4-rules "--no-retry" --system-append $RULES
fi
stopserve gemma4-31b

# 4. Qwen3.6-35B-A3B, 8-bit (Apache 2.0): only 3B of it runs per word, so it is fast and cheap to host
if serve Qwen/Qwen3.6-35B-A3B-FP8 qwen36-35b-a3b --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder; then
  evalrun qwen36-35b-a3b qwen36a3b-think-rules "--no-retry" --think on --system-append $RULES
fi
stopserve qwen36-35b-a3b

# 5. what the rules add: Qwen3.8-27B again without them
if serve Qwen/Qwen3.8-27B qwen38-27b --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder; then
  evalrun qwen38-27b qwen38-think-plain "--no-retry" --think on
fi
stopserve qwen38-27b

step done
shutdown_all
echo DONE > $T/done
