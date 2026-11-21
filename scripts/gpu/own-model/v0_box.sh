#!/bin/sh
# One unattended run on a fresh rented box: set it up on its own disk, download one model, serve it, run a plan of
# checks (runplan.sh), then shut everything down so the box idles out. Nothing here waits for a person or a chat.
#   nohup sh v0_box.sh <hf id> <name> <hard stop minutes> "<vllm args>" <plan file> > /workspace/ownmodel/v0-<name>.log 2>&1 &
# Made-up data only (ADR 0023).
set -x
ID="$1"; NAME="$2"; STOP_MIN="$3"; VLLM_ARGS="$4"; PLAN="$5"
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow
mkdir -p $T $L/models
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }
step "box-start $NAME"
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm > $T/pip-vllm-$NAME.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $T/pip-hf-$NAME.log 2>&1 \
  && $L/hfenv/bin/hf download "$ID" --exclude "original/*" --exclude "metal/*" --local-dir $L/models/$NAME > $T/download-$NAME.log 2>&1 && echo ok > $L/model.ready) &
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev > $T/apt-$NAME.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql gcc g++ python3.12-dev >> $T/apt-$NAME.log 2>&1)
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
su postgres -c "createdb -O budgetflow budgetflow_test_d" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO
cd $REPO && git log --oneline -1
npm ci --ignore-scripts --no-audit --no-fund > $T/npm-$NAME.log 2>&1
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_d npm run db:migrate:test > $T/migrate-$NAME.log 2>&1
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
step "app-ready $NAME"
N=0
while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do
  sleep 5; N=$((N + 1))
  # 25 minutes without the server software or the model: give up and leave the box idle
  [ $N -gt 300 ] && { echo "FAILED setup $NAME: vllm or the model did not arrive in 25 minutes" >> $T/board.txt; service postgresql stop; exit 1; }
done
step "model-ready $NAME"
exec sh scripts/gpu/own-model/runplan.sh "$NAME" "$STOP_MIN" "$VLLM_ARGS" "$PLAN"
