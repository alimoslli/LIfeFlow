#!/bin/sh
# A place to talk to Skyling 1.0. On one rented H100: serve the model (Qwen3.8-27B) with our rules, reminders and checks
# in front of it, run the real LifeFlow app beside it on the made-up demo account, and put the app behind one
# password-protected link. Made-up data only (ADR 0023): the demo account from scripts/seed-demo.ts. No OpenAI: the app's
# model address points at our translator on this box.
#
#   nohup sh skyling_demo.sh <most minutes up, default 60> <idle minutes, default 10> > /workspace/ownmodel/demo.log 2>&1 &
#
# Progress: /workspace/ownmodel/demo-status.txt. When it works: /workspace/ownmodel/demo-link.txt (the link and both logins).
# The link opens a test frame (frame.html, control.py): the label "Skyling 1.0 · our own model · test", the session's minutes
# and credits so far, a Stop button, and the real app's skyling chat inside it.
# It stops everything at once when Stop is tapped (or /workspace/ownmodel/demo-stop appears), and by itself after
# <idle minutes> with no message to the skyling or <most minutes up> in all. A running app keeps a rented box billing, so
# this is what ends the bill: with nothing running the box's own idle timer stops it a few minutes later, and the chat
# that rented it stops it sooner when it sees the STOPPED line.
# No command tracing: this script handles two passwords, and its log is kept on shared storage.
MAX_MIN="${1:-60}"; IDLE_MIN="${2:-10}"; RATE="${3:-120}"
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow; LOGS=$L/demo-logs
HF=Qwen/Qwen3.8-27B; MODEL=qwen38-27b
BOOT=$(date +%s)
mkdir -p $T $L/models $LOGS
: > $T/demo-status.txt; rm -f $T/demo-link.txt $T/demo-stop
status() { echo "$(date -u +%H:%M:%S) $1" | tee -a $T/demo-status.txt; }
shutdown_all() {
  pkill -f "[d]emo/control.py"; pkill -f "[c]loudflared tunnel"; pgrep -f "[n]ext-server" | xargs -r kill; pkill -f "[n]ext start"
  pkill -f "[r]esponses_shim.py"; pkill -f "[v]llm serve"; sleep 3; pkill -f "[V]LLM::EngineCore"
  nginx -s stop 2> /dev/null; service postgresql stop
  [ -n "$GUARD" ] && kill $GUARD 2> /dev/null
  rm -f $T/demo-link.txt
  status "STOPPED: $1. Nothing is running; the box stops itself after its idle timer."
}
fail() { status "FAILED: $1"; shutdown_all "setup failed"; exit 1; }
# if setting up takes more than 30 minutes something is wrong: stop instead of billing
(sleep 1800; [ -f $T/demo-link.txt ] || { echo "$(date -u +%H:%M:%S) FAILED: not ready after 30 minutes" >> $T/demo-status.txt; touch $T/demo-stop; }) &
GUARD=$!

status "setting up the box (about 12 minutes: model download, app build)"
(python3 -m venv $L/venv && $L/venv/bin/pip install -q vllm > $LOGS/pip-vllm.log 2>&1 && echo ok > $L/vllm.ready) &
(python3 -m venv $L/hfenv && $L/hfenv/bin/pip install -q huggingface_hub > $LOGS/pip-hf.log 2>&1 \
  && $L/hfenv/bin/hf download "$HF" --exclude "original/*" --exclude "metal/*" --local-dir $L/models/$MODEL > $LOGS/download.log 2>&1 && echo ok > $L/model.ready) &
PKGS="postgresql gcc g++ python3.12-dev nginx apache2-utils"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $PKGS > $LOGS/apt.log 2>&1 || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $PKGS >> $LOGS/apt.log 2>&1)
# The tunnel program first, so a problem with it costs one minute and not twelve. From its newest release, checked against
# the checksum in that release's own notes; if the notes carry none, from Cloudflare's own signed package list instead.
REL=$(curl -fsSL https://api.github.com/repos/cloudflare/cloudflared/releases/latest || true)
TAG=$(printf '%s' "$REL" | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])" 2> /dev/null)
WANT=$(printf '%s' "$REL" | python3 -c "import json,re,sys; m=re.search(r'cloudflared-linux-amd64: ([0-9a-f]{64})', json.load(sys.stdin)['body']); print(m.group(1) if m else '')" 2> /dev/null)
if [ -n "$TAG" ] && [ -n "$WANT" ]; then
  curl -fsSL -o $L/cloudflared "https://github.com/cloudflare/cloudflared/releases/download/$TAG/cloudflared-linux-amd64" || fail "tunnel program download"
  [ "$(sha256sum $L/cloudflared | cut -d' ' -f1)" = "$WANT" ] || fail "tunnel program checksum does not match its release ($TAG)"
  chmod +x $L/cloudflared
  status "tunnel program $TAG, checksum matches its release notes"
else
  mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg || fail "tunnel program: no checksum in the release notes and the signed package list could not be reached"
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq cloudflared) >> $LOGS/apt.log 2>&1 || fail "tunnel program install from the signed package list"
  ln -sf "$(command -v cloudflared)" $L/cloudflared
  status "tunnel program from Cloudflare's signed package list ($(cloudflared --version 2>&1 | head -1 | cut -c1-60))"
fi
service postgresql start
sleep 3
su postgres -c "psql -c \"create role budgetflow login superuser password 'budgetflow_dev'\"" || true
su postgres -c "createdb -O budgetflow budgetflow_demo" || true
curl -fsSL https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz | tar -xz -C $L && export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
git clone -q --depth 3 -b claude/skill-router-pilot https://github.com/alimoslli/LIfeFlow.git $REPO || fail "could not fetch the code"
cd $REPO && git log --oneline -1
npm ci --no-audit --no-fund > $LOGS/npm.log 2>&1 || fail "npm ci"

# the app's database: a throwaway one on this box, with only the made-up demo account in it
export DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_demo
export ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)
npm run db:migrate > $LOGS/migrate.log 2>&1 || fail "database setup"
# superuser only for the migrations: a superuser skips row-level security
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
DEMO_EMAIL=demo@budgetflow.local
DEMO_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(12))")
DEMO_PASSWORD="$DEMO_PASS" npm run db:seed-demo > $LOGS/seed.log 2>&1 || fail "demo account"
status "demo account ready; building the app"
npm run build > $LOGS/build.log 2>&1 || fail "app build"
# a browser on the box, only to check the finished link the way a person would use it
(npx playwright install --with-deps chromium > $LOGS/playwright.log 2>&1; echo done > $L/browser.ready) &

# the password door (nginx basic auth) and the link (a quick tunnel to that door)
LINK_USER=skyling
LINK_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(12))")
rm -f /etc/nginx/sites-enabled/default
cp scripts/gpu/demo/nginx-skyling.conf /etc/nginx/conf.d/skyling.conf
htpasswd -bc /etc/nginx/skyling.htpasswd "$LINK_USER" "$LINK_PASS" && chown www-data /etc/nginx/skyling.htpasswd && chmod 600 /etc/nginx/skyling.htpasswd
nginx -t && (nginx -s stop 2> /dev/null; sleep 1; nginx) || fail "the password door (nginx)"
nohup $L/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080 > $LOGS/tunnel.log 2>&1 &
LINK=""
for i in $(seq 1 60); do
  LINK=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' $LOGS/tunnel.log | head -1)
  [ -n "$LINK" ] && break
  sleep 2
done
[ -n "$LINK" ] || fail "the tunnel gave no link"
status "link reserved; waiting for the model"

N=0
while [ ! -f $L/vllm.ready ] || [ ! -f $L/model.ready ]; do
  sleep 5; N=$((N + 1))
  [ -f $T/demo-stop ] && { shutdown_all "asked to stop during setup"; exit 0; }
  [ $N -gt 300 ] && fail "the model or its server did not arrive in 25 minutes"
done
status "starting Skyling 1.0 (about 3 minutes)"
nohup $L/venv/bin/vllm serve $L/models/$MODEL --served-model-name $MODEL --port 8000 --gpu-memory-utilization 0.92 --max-num-seqs 32 --enable-auto-tool-choice \
  --max-model-len 65536 --reasoning-parser qwen3 --tool-call-parser qwen3_coder > $LOGS/vllm.log 2>&1 &
VPID=$!
until curl -sf http://127.0.0.1:8000/v1/models > /dev/null; do
  kill -0 $VPID 2> /dev/null || fail "the model server stopped while loading: $(grep -E 'Error|error' $LOGS/vllm.log | tail -1 | cut -c1-160)"
  [ -f $T/demo-stop ] && { shutdown_all "asked to stop during setup"; exit 0; }
  sleep 5
done
# Skyling 1.0 = the model plus our rules, reminders and checks (the translator). The owner asked (2026-11-22) that every
# answer of a test session be checked afterwards, so the session's questions, tool results and answers are kept: on this
# box's disk while it runs, copied to the owner's own GPU storage when it ends (demo-transcript-<time>.jsonl). Made-up
# demo data and the tester's own messages only.
nohup python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --think off --guard \
  --system-append scripts/gpu/own-model/skyling-rules.txt --remind scripts/gpu/own-model/skyling-reminders.txt --log $LOGS/shim.jsonl --dump $LOGS/transcript.jsonl > $LOGS/shim.out 2>&1 &
sleep 2
# the real app, production build, listening on this box only; its model address is our translator, not OpenAI
OPENAI_API_KEY=not-a-real-key OPENAI_MODEL=$MODEL OPENAI_MODEL_SMALL=$MODEL OPENAI_BASE_URL=http://127.0.0.1:8100/v1 APP_URL="$LINK" NODE_ENV=production \
  nohup npx next start -p 3000 -H 127.0.0.1 > $LOGS/app.log 2>&1 &
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000/api/health > /dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:3000/api/health > /dev/null || fail "the app did not start: $(tail -2 $LOGS/app.log | tr '\n' ' ' | cut -c1-200)"

# the test frame's desk: minutes, credits and the Stop button. The idle and time limits count from here.
READY=$(date +%s)
nohup python3 scripts/gpu/demo/control.py --boot $BOOT --ready $READY --rate $RATE --idle-min $IDLE_MIN --max-min $MAX_MIN \
  --shim-log $LOGS/shim.jsonl --stop-file $T/demo-stop > $LOGS/control.log 2>&1 &
sleep 1

# checks: the door refuses without its password and opens with it, through the public link
NOPASS=$(curl -s -o /dev/null -w "%{http_code}" "$LINK/__skyling/")
WITHPASS=$(curl -s -o /dev/null -w "%{http_code}" -u "$LINK_USER:$LINK_PASS" "$LINK/__skyling/")
APPPASS=$(curl -s -o /dev/null -w "%{http_code}" -u "$LINK_USER:$LINK_PASS" "$LINK/login")
status "link check: without the password $NOPASS (should be 401), with it $WITHPASS and the app $APPPASS (should be 200)"
[ "$NOPASS" = 401 ] && [ "$WITHPASS" = 200 ] && [ "$APPPASS" = 200 ] || fail "the link check"
# and one real question, asked in a browser through the same link: sign in, open the chat, read the answer
for i in $(seq 1 60); do [ -f $L/browser.ready ] && break; sleep 2; done
CHECK=$(timeout 240 node scripts/gpu/demo/check_chat.mjs "$LINK" "$LINK_USER" "$LINK_PASS" "$DEMO_EMAIL" "$DEMO_PASS" "What do I need to get done today?" 2>&1 | tail -1)
echo "$CHECK" > $T/demo-check.json
case "$CHECK" in
  *'"ok":true'*) status "browser check passed: signed in and got an answer" ;;
  *) status "browser check did NOT pass (the link may still work): $(echo "$CHECK" | cut -c1-220)" ;;
esac

cat > $T/demo-link.txt <<EOF
LINK=$LINK/__skyling/
LINK_LOGIN=$LINK_USER
LINK_PASSWORD=$LINK_PASS
APP_EMAIL=$DEMO_EMAIL
APP_PASSWORD=$DEMO_PASS
READY_AT=$(date -u +%H:%M:%S)
SETUP_SECONDS=$(($(date +%s) - BOOT))
STOPS_AFTER_IDLE_MINUTES=$IDLE_MIN
STOPS_AFTER_MINUTES=$MAX_MIN
EOF
status "READY. Stop button in the page; stops by itself after $IDLE_MIN minutes without a message or $MAX_MIN minutes in all."

# the watch: end the session (and so the bill) when nobody is talking, at the time limit, or when asked
while true; do
  sleep 2
  NOW=$(date +%s)
  LAST=$(stat -c %Y $LOGS/shim.jsonl 2> /dev/null || echo $READY)
  [ "$LAST" -lt "$READY" ] && LAST=$READY
  [ -f $T/demo-stop ] && { WHY="$(head -1 $T/demo-stop | cut -c1-40)"; [ -n "$WHY" ] || WHY="asked to stop"; sleep 1; break; }
  [ $((NOW - READY)) -ge $((MAX_MIN * 60)) ] && { WHY="the $MAX_MIN minute limit"; break; }
  [ $((NOW - LAST)) -ge $((IDLE_MIN * 60)) ] && { WHY="no message for $IDLE_MIN minutes"; break; }
  kill -0 $VPID 2> /dev/null || { WHY="the model server stopped"; break; }
done
MSGS=$(grep -c '"tools": \[\]' $LOGS/shim.jsonl 2> /dev/null || echo 0)
[ -s $LOGS/transcript.jsonl ] && cp $LOGS/transcript.jsonl "$T/demo-transcript-$(date -u +%Y%m%d-%H%M).jsonl"
MINS=$(( ($(date +%s) - BOOT) / 60 ))
status "session over ($WHY): about $MSGS answers given; box up $MINS minutes, about $(( MINS * RATE / 60 )) credits"
shutdown_all "$WHY"
