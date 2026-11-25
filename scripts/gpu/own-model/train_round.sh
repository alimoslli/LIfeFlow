#!/bin/sh
# One round on one fresh H100, unattended, with a hard stop: measure the teacher, make fresh examples, teach a small model,
# score it. Made-up data only (ADR 0023): the eval student, the simulator's lives and the question bank.
#
#   1. set up (model server, both models, database, the app's code, the made-up lives and questions);
#   2. MEASURE the teacher (Skyling 1.1: Qwen3.8-27B with our rules, situation cards and checks) on the unseen questions and
#      the tests, which also measures the fixes pushed after the last round; its clean answers are kept as examples;
#   3. GENERATE: the teacher answers a mixed bank (half the newer abilities) on every made-up life, for a fixed number of minutes;
#   4. FILTER the new answers, add the clean examples kept from earlier rounds (/workspace/ownmodel/traindata), drop repeats;
#   5. stop the teacher, TEACH Qwen3-8B (LoRA) for a fixed number of minutes, merge it into a model of its own;
#   6. SCORE the student on the 20 questions three ways (alone, with our checks, with rules, cards and checks) and on the
#      solve-my-problem test, and score the untrained Qwen3-8B with rules, cards and checks, so the training's own effect shows.
# The student is taught on the app's own prompt only (our rules are not in the recording), so what it learned is in its weights.
# Every stage saves to GPU storage before the next starts. Results: /workspace/ownmodel/board.txt, round9/ and round9-status.txt.
#
#   nohup sh train_round.sh <generate minutes, default 14> <train minutes, default 32> <hard stop minutes, default 105> \
#       > /workspace/ownmodel/round9.log 2>&1 &
GEN_MIN="${1:-14}"; TRAIN_MIN="${2:-32}"; STOP_MIN="${3:-105}"
T=/workspace/ownmodel; D=$T/round9; L=/root/job; REPO=$L/LIfeFlow; H=$L/gen
START=$(date +%s); END=$(( START + STOP_MIN * 60 ))
mkdir -p $T $D $T/traindata $L/models $H
ST=$T/round9-status.txt; : > $ST
step() { echo "STEP $1 $(date -u +%H:%M:%S) +$(( ($(date +%s) - START) / 60 ))min" | tee -a $T/steps.log; }
note() { echo "$1" | tee -a $ST; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "[V]LLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[g]enerate.ts"; pkill -f "[c]ompare-models.ts"; pkill -f "[t]rain_chat.py"
  pkill -f "[r]unplan.sh"; service postgresql stop > /dev/null 2>&1
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
fail() { note "FAILED: $1"; step "failed: $1"; shutdown_all; kill $TIMER 2> /dev/null; exit 1; }
left() { echo $(( (END - $(date +%s)) / 60 )); }
# hard stop: whatever is running, everything ends and the box can idle out
(until [ "$(date +%s)" -ge "$END" ]; do sleep 20; done; echo "FAILED: hard stop at $STOP_MIN minutes" >> $ST
 echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[t]rain_round.sh") &
TIMER=$!
V27="--max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder"
CARDS="--think off --guard --system-append scripts/gpu/own-model/skyling-rules.txt --system-append scripts/gpu/own-model/skyling-alive.txt --remind scripts/gpu/own-model/skyling-reminders-alive2.txt --situations scripts/gpu/own-model/skyling-situations.txt"

# ---- 1. set up
step "round9 start"
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm peft > $D/pip.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $D/pip-hf.log 2>&1 \
  && $L/hfenv/bin/hf download Qwen/Qwen3.8-27B --exclude "original/*" --exclude "metal/*" --local-dir $L/models/qwen38-27b > $D/dl-teacher.log 2>&1 \
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
python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $D/lives.log 2>&1 || fail "lives"
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions.json > $D/questions.log 2>&1 || fail "question bank"
python3 scripts/gpu/chat-data/build_alive_questions.py --base $L/questions.json --out $L/questions-alive.json --share 0.5 --total 648 > $D/alive-q.log 2>&1 || fail "alive questions"
cat $D/alive-q.log
N=0; while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do sleep 5; N=$((N + 1)); [ $N -gt 300 ] && fail "the model server or the models did not arrive in 25 minutes"; done
step "set up done"

# ---- 2. measure the teacher (it stays up afterwards for step 3)
cat > $D/plan-measure.txt <<PLAN
holdout|r9-holdout|162|$CARDS
eval|r9-old20|--no-retry --alive-rules|$CARDS
eval|r9-alive6|--no-retry --exam alive|$CARDS
eval|r9-day4|--no-retry --exam day|$CARDS
eval|r9-trust4|--no-retry --exam trust|$CARDS
eval|r9-wish5|--no-retry --exam wish|$CARDS
eval|r9-life4|--no-retry --exam life|$CARDS
PLAN
sh scripts/gpu/own-model/runplan.sh qwen38-27b 30 "$V27" $D/plan-measure.txt keep > $D/measure.log 2>&1
grep "^RESULT r9-\|^HOLDOUT r9-" $T/board.txt | cut -c1-260 >> $ST
step "measure done"
curl -sf http://127.0.0.1:8000/v1/models > /dev/null || fail "the teacher is not serving after the measuring step (see $D/measure.log)"

# ---- 3. generate fresh examples for a fixed time
service postgresql start > /dev/null 2>&1; sleep 2
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 $CARDS --log $H/shim.jsonl --dump $H/dump.jsonl > $H/shim.out 2>&1 &
sleep 2
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions-alive.json \
    --per-life 4 --worker $i --workers 12 --model qwen38-27b --out $H/meta-$i.jsonl > $H/gen-$i.log 2>&1 &
done
G0=$(date +%s)
while pgrep -f "[g]enerate.ts" > /dev/null && [ $(( $(date +%s) - G0 )) -lt $(( GEN_MIN * 60 )) ]; do sleep 5; done
pkill -f "[g]enerate.ts"; sleep 2; pkill -f "[r]esponses_shim.py"
step "generate done: $(cat $H/meta-*.jsonl 2> /dev/null | wc -l) conversations in $(( ($(date +%s) - G0) / 60 )) minutes"
cp $H/dump.jsonl $D/dump.jsonl; cat $H/meta-*.jsonl > $D/meta.jsonl   # the recording, on storage

# ---- 4. filter, add earlier clean examples, drop repeats
python3 scripts/gpu/chat-data/filter.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --out $D/train-new.jsonl --report $D/filter-report.json --alive --details $D/details.jsonl > $D/filter.log 2>&1 || fail "filter (see $D/filter.log)"
cp $D/train-new.jsonl $T/traindata/r9-gen-kept.jsonl
python3 - $D/train.jsonl $T/traindata/*-kept.jsonl > $D/merge-data.log 2>&1 <<'PY'
import collections, json, os, sys
out, files = sys.argv[1], sorted(sys.argv[2:], key=os.path.getmtime)   # oldest first, so the newest answer to a question wins
rows, per = {}, collections.Counter()
for f in files:
    for line in open(f):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        m = r.get("meta", {})
        # the same life asked the same thing at the same step is a repeat; the life is the part of "conv" before the first "~"
        asked = [x.get("content") for x in r.get("messages", []) if x.get("role") == "user"]
        asked = asked[-1] if asked else ""
        asked = asked if isinstance(asked, str) else json.dumps(asked)
        key = (str(m.get("conv", "")).split("~")[0], asked[:200], m.get("step"), m.get("kind"))
        rows[key] = r
        per[os.path.basename(f)] += 1
kinds = collections.Counter(r.get("meta", {}).get("kind") for r in rows.values())
with open(out, "w") as o:
    for r in rows.values():
        o.write(json.dumps(r) + "\n")
print("files", dict(per)); print("examples after dropping repeats", len(rows), dict(kinds))
PY
cat $D/merge-data.log
KEPT=$(wc -l < $D/train.jsonl)
note "DATA: $KEPT examples ($(tail -1 $D/merge-data.log | cut -c1-200)); new this round: $(wc -l < $D/train-new.jsonl); $(grep -i "kept\|dropped" $D/filter.log | head -3 | tr '\n' ' ' | cut -c1-260)"
[ "$KEPT" -ge 300 ] || fail "only $KEPT clean examples: too few to teach anything"

# ---- 5. stop the teacher, teach the student
step "stop teacher"
pkill -f "[v]llm serve"; sleep 5; pkill -f "[V]LLM::EngineCore"
N=0; until [ "$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)" -lt 3000 ]; do sleep 3; N=$((N + 1)); [ $N -gt 40 ] && fail "the GPU's memory was not freed after stopping the teacher"; done
# never train into the hard stop: leave 18 minutes for merging and scoring
ROOM=$(( $(left) - 18 )); [ "$TRAIN_MIN" -gt "$ROOM" ] && TRAIN_MIN=$ROOM
[ "$TRAIN_MIN" -ge 10 ] || fail "only $ROOM minutes left for teaching: not enough"
step "train $TRAIN_MIN minutes on $KEPT examples"
$L/venv/bin/python scripts/gpu/chat-train/train_chat.py --data $D/train.jsonl --model $L/models/qwen3-8b --out $D/adapter --epochs 2 --max-minutes "$TRAIN_MIN" > $D/train.log 2>&1 || fail "training (see $D/train.log)"
note "TRAIN: $(grep "^examples" $D/train.log | cut -c1-160); $(grep "holdout loss before" $D/train.log); $(tail -1 $D/train.log | cut -c1-220)"
step "merge"
$L/venv/bin/python - > $D/merge.log 2>&1 <<PY || fail "merge (see $D/merge.log)"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained("$L/models/qwen3-8b", torch_dtype=torch.bfloat16)
m = PeftModel.from_pretrained(base, "$D/adapter").merge_and_unload()
m.save_pretrained("$L/models/skyling-8b")
AutoTokenizer.from_pretrained("$L/models/qwen3-8b").save_pretrained("$L/models/skyling-8b")
print("merged")
PY

# ---- 6. score the student, and the untrained small model with the same help around it
cat > $D/plan-student.txt <<PLAN
eval|r9-st-full-old20|--no-retry --alive-rules|$CARDS
eval|r9-st-guard-old20|--no-retry --alive-rules|--think off --guard
eval|r9-st-bare-old20|--no-retry --alive-rules|--think off
eval|r9-st-full-alive6|--no-retry --exam alive|$CARDS
PLAN
echo "eval|r9-base8b-full-old20|--no-retry --alive-rules|$CARDS" > $D/plan-base.txt
step "student evals"
sh scripts/gpu/own-model/runplan.sh skyling-8b $(left) "--max-model-len 32768 --tool-call-parser hermes" $D/plan-student.txt > $D/student.log 2>&1
[ "$(left)" -ge 5 ] && sh scripts/gpu/own-model/runplan.sh qwen3-8b $(left) "--max-model-len 32768 --tool-call-parser hermes" $D/plan-base.txt > $D/base.log 2>&1
grep "^RESULT r9-st-\|^RESULT r9-base8b" $T/board.txt | cut -c1-260 >> $ST
note "ALL DONE in $(( ($(date +%s) - START) / 60 )) minutes"
step "round9 done"
shutdown_all
kill $TIMER 2> /dev/null
