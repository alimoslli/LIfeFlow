#!/bin/sh
# Teach a small model the "alive" skyling. One fresh H100, unattended, shuts itself down. NOT RUN YET (written 2026-11-22
# while waiting for a credit decision); read it once more before the first run.
#
#   1. serve the teacher (Skyling 1.0 with the alive rules and checks, Qwen3.8-27B) and let it answer about <per life> made-up
#      questions on each of 162 made-up lives through the real skyling loop, recording what a student would see;
#   2. keep only the clean examples (scripts/gpu/chat-data/filter.py --alive);
#   3. stop the teacher and teach Qwen3-8B (LoRA), merge the adapter into a model of its own;
#   4. score that student on the 20 questions (twice) and the alive test, alone and with our checks around it.
# The student sees the app's own prompt only, never our rules (they are not in the recording), so what it learned is in its weights.
# Made-up data only (ADR 0023). Results: /workspace/ownmodel/board.txt and /workspace/ownmodel/distill/.
#
#   nohup sh distill_box.sh <questions per life, default 8> <train minutes, default 45> <hard stop minutes, default 150> \
#       > /workspace/ownmodel/distill.log 2>&1 &
PER="${1:-8}"; TRAIN_MIN="${2:-45}"; STOP_MIN="${3:-150}"
T=/workspace/ownmodel; D=$T/distill; L=/root/job; REPO=$L/LIfeFlow; H=$L/gen
END=$(( $(date +%s) + STOP_MIN * 60 ))
mkdir -p $T $D $L/models $H
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "[V]LLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[g]enerate.ts"; pkill -f "[c]ompare-models.ts"; pkill -f "[t]rain_chat.py"
  service postgresql stop
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
fail() { echo "FAILED distill: $1" >> $T/board.txt; step "failed: $1"; shutdown_all; exit 1; }
# hard stop: whatever is running, everything ends and the box can idle out
(until [ "$(date +%s)" -ge "$END" ]; do sleep 20; done; echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[d]istill_box.sh") &

step "distill start"
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm peft > $D/pip.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $D/pip-hf.log 2>&1 \
  && $L/hfenv/bin/hf download Qwen/Qwen3.8-27B --exclude "original/*" --local-dir $L/models/qwen38-27b > $D/dl-teacher.log 2>&1 \
  && $L/hfenv/bin/hf download Qwen/Qwen3-8B --local-dir $L/models/qwen3-8b > $D/dl-student.log 2>&1 && echo ok > $L/model.ready) &
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $D/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $D/apt.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
su postgres -c "createdb -O budgetflow budgetflow_test_d" || true
su postgres -c "createdb -O budgetflow budgetflow_gen_test" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO || fail "could not fetch the code"
cd $REPO && git log --oneline -1
npm ci --ignore-scripts --no-audit --no-fund > $D/npm.log 2>&1 || fail "npm ci"
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d npm run db:migrate:test > $D/migrate.log 2>&1
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test npm run db:migrate:test > $D/migrate-gen.log 2>&1
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""

# the made-up lives and the question bank (the bank needs the router pilot's rows kept on GPU storage)
python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $D/lives.log 2>&1 || fail "lives"
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions-base.json > $D/questions.log 2>&1 || fail "question bank"
TOTAL=$(( 162 * PER ))
python3 scripts/gpu/chat-data/build_alive_questions.py --base $L/questions-base.json --out $L/questions.json --share 0.4 --total $TOTAL > $D/alive-q.log 2>&1 || fail "alive questions"
cat $D/alive-q.log

N=0; while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do sleep 5; N=$((N + 1)); [ $N -gt 400 ] && fail "the model server or the models did not arrive in 33 minutes"; done

step "serve teacher"
nohup $L/venv/bin/vllm serve $L/models/qwen38-27b --served-model-name qwen38-27b --port 8000 --gpu-memory-utilization 0.92 --max-num-seqs 32 --enable-auto-tool-choice \
  --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder > $D/vllm-teacher.log 2>&1 &
VPID=$!
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do kill -0 $VPID 2> /dev/null || fail "the teacher server stopped while loading"; sleep 5; done

step "generate"
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --think off --guard \
  --system-append scripts/gpu/own-model/skyling-rules.txt --system-append scripts/gpu/own-model/skyling-alive.txt --remind scripts/gpu/own-model/skyling-reminders-alive.txt \
  --log $H/shim.jsonl --dump $H/dump.jsonl > $H/shim.out 2>&1 &
sleep 2
PIDS=""
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions.json \
    --per-life $PER --worker $i --workers 12 --model qwen38-27b --out $H/meta-$i.jsonl > $H/gen-$i.log 2>&1 &
  PIDS="$PIDS $!"
done
wait $PIDS
pkill -f "[r]esponses_shim.py"
step "filter"
python3 scripts/gpu/chat-data/filter.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --out $D/train.jsonl --report $D/filter-report.json --alive --details $D/details.jsonl > $D/filter.log 2>&1 || fail "filter"
cat $D/filter.log
KEPT=$(wc -l < $D/train.jsonl)
echo "DISTILL data: $(date -u +%H:%M) $KEPT examples kept; $(head -12 $D/filter.log | tr '\n' ' ' | cut -c1-300)" >> $T/board.txt
[ "$KEPT" -ge 300 ] || fail "only $KEPT clean examples: too few to teach anything (see $D/filter.log)"
cp $H/dump.jsonl $D/dump.jsonl   # the recording, on GPU storage, for the next round

step "stop teacher"
pkill -f "[v]llm serve"; sleep 5; pkill -f "[V]LLM::EngineCore"; sleep 8

step "train"
$L/venv/bin/python scripts/gpu/chat-train/train_chat.py --data $D/train.jsonl --model $L/models/qwen3-8b --out $D/adapter --epochs 2 --max-minutes "$TRAIN_MIN" > $D/train.log 2>&1 || fail "training (see $D/train.log)"
tail -3 $D/train.log
step "merge"
$L/venv/bin/python - <<PY > $D/merge.log 2>&1 || fail "merge (see $D/merge.log)"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained("$L/models/qwen3-8b", torch_dtype=torch.bfloat16)
m = PeftModel.from_pretrained(base, "$D/adapter").merge_and_unload()
m.save_pretrained("$L/models/skyling-8b")
AutoTokenizer.from_pretrained("$L/models/qwen3-8b").save_pretrained("$L/models/skyling-8b")
print("merged")
PY

# the student, alone and with our checks around it (no rules: it was taught them), on the 20 questions and the alive test
cat > $D/plan-student.txt <<PLAN
eval|st-bare-old20|--no-retry|--think off
eval|st-bare-alive6|--no-retry --exam alive|--think off
eval|st-guard-old20|--no-retry|--think off --guard
eval|st-guard-alive6|--no-retry --exam alive|--think off --guard
eval|st-guard-old20-r2|--no-retry|--think off --guard
eval|st-guard-alive6-r2|--no-retry --exam alive|--think off --guard
PLAN
step "student evals"
sh scripts/gpu/own-model/runplan.sh skyling-8b 40 "--max-model-len 32768 --tool-call-parser hermes" $D/plan-student.txt
echo DONE > $D/done
step "distill done"
