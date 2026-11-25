#!/bin/sh
# Stage 1 of a training night: make the examples. One fresh H100, unattended, with a hard stop. Made-up data only (ADR 0023).
# The teacher (Skyling 1.1: Qwen3.8-27B with our rules, situation cards and checks in code) answers a mixed bank of messages,
# half of them the newer abilities, on every made-up life through the app's real loop. The automatic filter keeps the clean
# answers; every turn, kept or not, is exported as a short record for a quality check by a reader before any training.
#
#   nohup sh gen_box.sh <generate minutes, default 75> <hard stop minutes, default 100> <messages per life, default 9> \
#       <at a time, default 24> > /workspace/ownmodel/gen1.log 2>&1 &
#
# Next to this script, optional: up-qc.txt with a presigned upload URL (Content-Type application/zip) for the quality-check file.
# Saved on GPU storage: /workspace/ownmodel/gen1/ (dump.jsonl and meta.jsonl: the recording; train-new.jsonl: what the filter
# kept; qc.jsonl: the short records; details.jsonl), traindata/gen1-kept.jsonl, gen1-status.txt, steps.log.
GEN_MIN="${1:-75}"; STOP_MIN="${2:-100}"; PER="${3:-9}"; AT_ONCE="${4:-24}"
HERE=$(cd "$(dirname "$0")" && pwd)
T=/workspace/ownmodel; D=$T/gen1; L=/root/job; REPO=$L/LIfeFlow; H=$L/gen
START=$(date +%s); END=$(( START + STOP_MIN * 60 ))
mkdir -p $T $D $T/traindata $L/models $H
ST=$T/gen1-status.txt; : > $ST
step() { echo "STEP $1 $(date -u +%H:%M:%S) +$(( ($(date +%s) - START) / 60 ))min" | tee -a $T/steps.log; }
note() { echo "$1" | tee -a $ST; }
shutdown_all() {
  pkill -f "[v]llm serve"; pkill -f "[V]LLM::EngineCore"; pkill -f "[r]esponses_shim.py"; pkill -f "[g]enerate.ts"
  service postgresql stop > /dev/null 2>&1
  echo "STEP shutdown $(date -u +%H:%M:%S)" >> $T/steps.log
}
fail() { note "FAILED: $1"; step "failed: $1"; shutdown_all; kill $TIMER 2> /dev/null; exit 1; }
CARDS="--think off --guard --system-append scripts/gpu/own-model/skyling-rules.txt --system-append scripts/gpu/own-model/skyling-alive.txt --remind scripts/gpu/own-model/skyling-reminders-alive2.txt --situations scripts/gpu/own-model/skyling-situations.txt"

# what is recorded so far is filtered, exported and saved; called at the end and by the hard stop, so a stop never loses the work
finish() {
  pkill -f "[g]enerate.ts"; sleep 2; pkill -f "[r]esponses_shim.py"; sleep 1
  cd $REPO || return
  cp $H/dump.jsonl $D/dump.jsonl 2> /dev/null; cat $H/meta-*.jsonl > $D/meta.jsonl 2> /dev/null
  python3 scripts/gpu/chat-data/filter.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --out $D/train-new.jsonl --report $D/filter-report.json --alive --details $D/details.jsonl > $D/filter.log 2>&1
  cp $D/train-new.jsonl $T/traindata/gen1-kept.jsonl 2> /dev/null
  python3 scripts/gpu/chat-data/qc_export.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --details $D/details.jsonl --out $D/qc.jsonl > $D/qc.log 2>&1
  (cd $D && python3 -c "import zipfile; z = zipfile.ZipFile('qc.zip', 'w', zipfile.ZIP_DEFLATED); z.write('qc.jsonl'); z.write('filter-report.json'); z.close()")
  UPL="not uploaded (no up-qc.txt)"
  [ -s "$HERE/up-qc.txt" ] && UPL="upload http $(curl -sS -m 180 -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/zip' -H 'If-None-Match: *' --data-binary @$D/qc.zip "$(cat "$HERE/up-qc.txt")")"
  TURNS=$(wc -l < $D/qc.jsonl 2> /dev/null); KEPT=$(wc -l < $D/train-new.jsonl 2> /dev/null)
  note "DATA: $TURNS turns recorded, $(grep -c '"ok": true' $D/details.jsonl 2> /dev/null) passed the filter, $KEPT examples kept (every tool-calling step is its own example); quality-check file: $UPL"
  note "FILTER: $(head -12 $D/filter.log | tr '\n' ' ' | cut -c1-500)"
  note "SPEED: $(( TURNS * 3600 / ($(date +%s) - G0 + 1) )) turns an hour with $AT_ONCE at a time"
}
# hard stop: save what there is, then everything ends and the box can idle out
(until [ "$(date +%s)" -ge "$END" ]; do sleep 15; done; echo "NOTE: hard stop at $STOP_MIN minutes" >> $ST
 echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; G0=${G0:-$START}; finish; shutdown_all; pkill -f "[g]en_box.sh") &
TIMER=$!

# ---- set up
step "gen1 start"
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm > $D/pip.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $D/pip-hf.log 2>&1 \
  && $L/hfenv/bin/hf download Qwen/Qwen3.8-27B --exclude "original/*" --exclude "metal/*" --local-dir $L/models/qwen38-27b > $D/dl-teacher.log 2>&1 && echo ok > $L/model.ready) &
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $D/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $D/apt.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
su postgres -c "psql -c \"alter system set max_connections = 300\"" || true
service postgresql restart; sleep 3
su postgres -c "createdb -O budgetflow budgetflow_gen_test" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO || fail "could not fetch the code"
cd $REPO && git log --oneline -1
npm ci --ignore-scripts --no-audit --no-fund > $D/npm.log 2>&1 || fail "npm ci"
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test npm run db:migrate:test > $D/migrate-gen.log 2>&1
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $D/lives.log 2>&1 || fail "lives"
LIVES=$(ls $L/lives | wc -l)
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions.json > $D/questions.log 2>&1 || fail "question bank"
python3 scripts/gpu/chat-data/build_alive_questions.py --base $L/questions.json --out $L/questions-alive.json --share 0.5 --total $(( LIVES * PER )) > $D/alive-q.log 2>&1 || fail "alive questions"
cat $D/alive-q.log
N=0; while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do sleep 5; N=$((N + 1)); [ $N -gt 300 ] && fail "the model server or the model did not arrive in 25 minutes"; done
step "serve teacher"
nohup $L/venv/bin/vllm serve $L/models/qwen38-27b --served-model-name qwen38-27b --port 8000 --gpu-memory-utilization 0.92 --max-num-seqs 48 --enable-auto-tool-choice \
  --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder > $D/vllm-teacher.log 2>&1 &
VPID=$!
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do kill -0 $VPID 2> /dev/null || fail "the teacher server stopped while loading (see $D/vllm-teacher.log)"; sleep 5; done

# ---- generate for a fixed time
step "generate: $LIVES lives x $PER messages, $AT_ONCE at a time, up to $GEN_MIN minutes"
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 $CARDS --log $H/shim.jsonl --dump $H/dump.jsonl > $H/shim.out 2>&1 &
sleep 2
G0=$(date +%s)
for i in $(seq 0 $(( AT_ONCE - 1 ))); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions-alive.json \
    --per-life $PER --worker $i --workers $AT_ONCE --model qwen38-27b --out $H/meta-$i.jsonl > $H/gen-$i.log 2>&1 &
done
while pgrep -f "[g]enerate.ts" > /dev/null && [ $(( $(date +%s) - G0 )) -lt $(( GEN_MIN * 60 )) ]; do
  kill -0 $VPID 2> /dev/null || { note "NOTE: the teacher server stopped during generation"; break; }
  sleep 10
done
step "generate over after $(( ($(date +%s) - G0) / 60 )) minutes"
finish
step "gen1 done"
shutdown_all
kill $TIMER 2> /dev/null
