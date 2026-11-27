#!/bin/sh
# Stage 1 of a training night: make the examples. One fresh H100, unattended, with a hard stop. Made-up data only (ADR 0023).
# The teacher (Skyling 1.1: Qwen3.8-27B with our rules, situation cards and checks in code) answers a mixed bank of messages,
# half of them the newer abilities, on every made-up life through the app's real loop. The automatic filter keeps the clean
# answers; every turn, kept or not, is exported as a short record for a quality check by a reader before any training.
#
#   nohup sh gen_box.sh <generate minutes, default 75> <hard stop minutes, default 100> <messages per life, default 9> \
#       <at a time, default 24> > /workspace/ownmodel/gen.log 2>&1 &
#
# Next to this script, optional: up-qc.txt with a presigned upload URL for the quality-check file (a .zip slot is signed with
# Content-Type application/octet-stream and needs the header If-None-Match: *).
# Saved on GPU storage: /workspace/ownmodel/<RUN>/ (dump.jsonl and meta.jsonl: the recording; train-new.jsonl: what the filter
# kept; qc.jsonl: the short records; details.jsonl), traindata/<RUN>-kept.jsonl, <RUN>-status.txt, steps.log.
GEN_MIN="${1:-75}"; STOP_MIN="${2:-100}"; PER="${3:-9}"; AT_ONCE="${4:-24}"; KEEP="$5"
# With "keep" as the fifth argument the box is left set up for a training stage on the same box (train_big.sh): the teacher is
# stopped so the GPU is free. WARNING (2026-11-25): the waiting loop below does NOT hold the box. A box whose GPU sits idle is
# taken away after its idle limit whatever is sleeping on it; start the next stage within that limit, or use train_night.sh
# on a fresh box (it sets itself up and the examples are safe on /workspace).
HERE=$(cd "$(dirname "$0")" && pwd)
# RUN names this generation's folder on storage. A folder that already holds a recording is never written over: the first
# generation's examples (gen1, 2026-11-25) are the only copy there is.
RUN="${RUN:-gen$(date -u +%m%d)}"
T=/workspace/ownmodel; D=$T/$RUN; L=/root/job; REPO=$L/LIfeFlow; H=$L/gen
[ -s "$D/dump.jsonl" ] && { echo "REFUSED: $D already holds a recording. Give another name: RUN=gen-b sh gen_box.sh ..."; exit 1; }
START=$(date +%s); END=$(( START + STOP_MIN * 60 ))
mkdir -p $T $D $T/traindata $L/models $H
ST=$T/$RUN-status.txt; : > $ST
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
  cp $D/train-new.jsonl $T/traindata/$RUN-kept.jsonl 2> /dev/null
  python3 scripts/gpu/chat-data/qc_export.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --details $D/details.jsonl --out $D/qc.jsonl > $D/qc.log 2>&1
  (cd $D && python3 -c "import zipfile; z = zipfile.ZipFile('qc.zip', 'w', zipfile.ZIP_DEFLATED); z.write('qc.jsonl'); z.write('filter-report.json'); z.close()")
  UPL="not uploaded (no up-qc.txt)"
  [ -s "$HERE/up-qc.txt" ] && UPL="upload http $(curl -sS -m 180 -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/octet-stream' -H 'If-None-Match: *' --data-binary @$D/qc.zip "$(cat "$HERE/up-qc.txt")")"
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
step "$RUN start"
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
su postgres -c "createdb -O budgetflow budgetflow_test_d" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO || fail "could not fetch the code"
cd $REPO && git log --oneline -1
npm ci --ignore-scripts --no-audit --no-fund > $D/npm.log 2>&1 || fail "npm ci"
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test npm run db:migrate:test > $D/migrate-gen.log 2>&1
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d npm run db:migrate:test > $D/migrate.log 2>&1
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
N=0; while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do sleep 5; N=$((N + 1)); [ $N -gt 300 ] && fail "the model server or the model did not arrive in 25 minutes"; done
# Optional, SPEEDTEST=1: before the teacher takes the GPU, six minutes that say what training this model will cost. A few
# examples the plain way and with the fast kernels (see train_night.sh); the verdict is kept on storage for the training night.
if [ -n "${SPEEDTEST:-}" ] && [ -s $T/night1/train.jsonl ] && [ ! -s $T/speed.json ]; then
  step "speed test for the training night"
  $L/venv/bin/pip install -q peft accelerate > $D/pip-train.log 2>&1
  speed_run() { PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True $L/venv/bin/python scripts/gpu/chat-train/train_big.py --data $T/night1/train.jsonl \
    --smoke-data $T/night1/train.jsonl --smoke 5 --smoke-only --model $L/models/qwen38-27b --adapter $D/speed-adapter > "$1" 2>&1; }
  speed_run $D/speed-plain.log
  if $L/venv/bin/pip install -q --no-deps fla-core einops >> $D/pip-train.log 2>&1; then speed_run $D/speed-fast.log; else : > $D/speed-fast.log; fi
  $L/venv/bin/pip uninstall -y -q fla-core >> $D/pip-train.log 2>&1   # the teacher's server runs without it, as it always has
  if python3 scripts/gpu/chat-train/speed_verdict.py --plain $D/speed-plain.log --fast $D/speed-fast.log --minutes 60 --examples "$(wc -l < $T/night1/train.jsonl)" > $T/speed.txt 2>&1; then
    grep "^JSON " $T/speed.txt | cut -c6- > $T/speed.json
  fi
  note "SPEED TEST: $(grep -v "^JSON " $T/speed.txt | tr '\n' ' ' | cut -c1-400)"
fi

# The teacher as it will write the examples (rules, cards and every check, the clock and made-up-figure checks of 2026-11-25
# included) on the 20 questions: they must not have dropped (18 to 19 before those checks). The bare model's own score is known
# (9 of 20, 2026-11-25) and is measured again only when the board has no such line. runplan.sh also fetches the newest code
# and leaves the teacher serving.
step "teacher baseline"
TAG="${TAG:-g$(date -u +%m%d%H)}"
echo "eval|$TAG-teacher-cards-old20|--no-retry --alive-rules|$CARDS" > $D/plan-baseline.txt
# The owner's standard as a number (2026-11-27): 39 probes made from his own grades, scored by chat-eval/owner_score.py. The
# teacher writes the examples, so its score says what the examples will teach. Each probe sends its own "acting on your own"
# line. OWNER_EXAM=0 leaves it out; it takes teacher time before generation starts (not measured yet; 10 more minutes are allowed).
BASE_MIN=12
[ "${OWNER_EXAM:-1}" = 1 ] && { echo "eval|$TAG-teacher-cards-owner|--no-retry --exam owner|$CARDS" >> $D/plan-baseline.txt; BASE_MIN=22; }
grep -q "^RESULT n1-teacher-bare-old20 " $T/board.txt 2> /dev/null || echo "eval|n1-teacher-bare-old20|--no-retry --alive-rules|--think off" >> $D/plan-baseline.txt
sh scripts/gpu/own-model/runplan.sh qwen38-27b $BASE_MIN "--max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder" $D/plan-baseline.txt keep > $D/baseline.log 2>&1
grep "^RESULT $TAG-teacher\|^RESULT n1-teacher-bare" $T/board.txt | cut -c1-240 >> $ST
# The stop line for training on what this teacher writes: 31 of 39 and no rule at zero (docs/research/own-model-runbook.md).
# It is said in the status either way; with OWNER_MIN=31 the box also stops here, before any example is made.
OWN=$(grep "^RESULT $TAG-teacher-cards-owner " $T/board.txt | sed -n 's/.*owner standard \([0-9]*\) of \([0-9]*\).*/\1 \2/p' | tail -1)
if [ -n "$OWN" ]; then
  OWN_PTS=${OWN% *}; OWN_ALL=${OWN#* }
  ZERO=$(grep "^RESULT $TAG-teacher-cards-owner " $T/board.txt | tail -1 | grep -o "[a-z]* 0/[0-9]*" | tr '\n' ' ')
  note "OWNER SCORE: the teacher meets the owner's standard on $OWN_PTS of $OWN_ALL probes${ZERO:+; rules with nothing passed: $ZERO}"
  [ "$OWN_PTS" -lt 31 ] || [ -n "$ZERO" ] && note "NOTE: that is under the stop line (31 of 39, no rule at zero). Read the misses in $T/summary-$TAG-teacher-cards-owner.txt before training on this set."
  [ -n "$OWNER_MIN" ] && [ "$OWN_PTS" -lt "$OWNER_MIN" ] && fail "the teacher scored $OWN_PTS on the owner's standard, under OWNER_MIN=$OWNER_MIN; no examples were made"
elif [ "${OWNER_EXAM:-1}" = 1 ]; then
  note "NOTE: the owner's-standard test did not finish (see $T/eval-$TAG-teacher-cards-owner.log); generation goes on without its number"
fi
curl -sf http://127.0.0.1:8000/v1/models > /dev/null || fail "the teacher is not serving (see $D/baseline.log and $T/vllm-plan-qwen38-27b.log)"
VPID=$(pgrep -f "[v]llm serve" | head -1)
service postgresql start > /dev/null 2>&1; sleep 2
cd $REPO && git log --oneline -1
python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $D/lives.log 2>&1 || fail "lives"
LIVES=$(ls $L/lives | wc -l)
python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions.json > $D/questions.log 2>&1 || fail "question bank"
python3 scripts/gpu/chat-data/build_alive_questions.py --base $L/questions.json --out $L/questions-alive.json --share 0.6 --total $(( LIVES * PER + 200 )) > $D/alive-q.log 2>&1 || fail "alive questions"
cat $D/alive-q.log

# ---- generate for a fixed time
step "generate: $LIVES lives x $PER messages, $AT_ONCE at a time, up to $GEN_MIN minutes"
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 $CARDS --log $H/shim.jsonl --dump $H/dump.jsonl > $H/shim.out 2>&1 &
sleep 2
G0=$(date +%s)
for i in $(seq 0 $(( AT_ONCE - 1 ))); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions-alive.json \
    --per-life $PER --worker $i --workers $AT_ONCE --model qwen38-27b --modes --out $H/meta-$i.jsonl > $H/gen-$i.log 2>&1 &
done
while pgrep -f "[g]enerate.ts" > /dev/null && [ $(( $(date +%s) - G0 )) -lt $(( GEN_MIN * 60 )) ]; do
  kill -0 $VPID 2> /dev/null || { note "NOTE: the teacher server stopped during generation"; break; }
  sleep 10
done
step "generate over after $(( ($(date +%s) - G0) / 60 )) minutes"
finish
step "$RUN done"
kill $TIMER 2> /dev/null
if [ "$KEEP" = keep ]; then
  pkill -f "[v]llm serve"; sleep 4; pkill -f "[V]LLM::EngineCore"
  echo "STEP teacher stopped, box kept for training $(date -u +%H:%M:%S)" >> $T/steps.log
  (N=0; while [ $N -lt 240 ] && [ ! -f $T/$RUN-release ]; do sleep 5; N=$((N + 1)); done) &   # does not hold the box, see the warning at the top
else
  shutdown_all
fi
