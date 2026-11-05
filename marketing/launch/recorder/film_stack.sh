# Bring up the local filming stack (Postgres + Next) on the shifted clock. Local only.
set -e
S=/tmp/claude-0/-workspace/77458121-78bd-5404-8e7b-4f5218da6002/scratchpad/act
OFF=$(cat $S/off.txt)
LIB=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1
fuser -k 3000/tcp 2>/dev/null || true; sleep 1
sudo -u postgres env LD_PRELOAD=$LIB FAKETIME="+$OFF" FAKETIME_DONT_FAKE_MONOTONIC=1 /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/main -o "-c config_file=/etc/postgresql/16/main/postgresql.conf" -l /tmp/pg.log start -w || true
sudo -u postgres psql -tAc "select now()"
cd /home/user/lf-main
export DATABASE_URL=$(grep -m1 "^DATABASE_URL=" .env.local | cut -d= -f2- | sed 's#/budgetflow$#/budgetflow_rec#')
export FAKETIME_DONT_FAKE_MONOTONIC=1
faketime -f "+$OFF" npx tsx scripts/_film/seed-jordan.ts 2>&1 | tail -1
OPENAI_API_KEY=sk-proxy-injected NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt FILM_EMAIL=jordan@film.local faketime -f "+$OFF" npx tsx --conditions=react-server scripts/_film/setup.ts 2>&1 | tail -2
(NODE_OPTIONS="--require $S/gmail_standin.cjs" OPENAI_API_KEY=sk-proxy-injected NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt nohup faketime -f "+$OFF" npx next start -p 3000 > /tmp/lfstart.log 2>&1 &)
for i in $(seq 1 30); do sleep 1; c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3000/sign-in || true); [ "$c" = 200 ] && break; done; echo next $c
