#!/bin/bash
# Film server with the skyling's model: $1 = start time (UTC), $2 = fake | real.
#   fake: the app's test stand-in (tests/e2e/fake-openai.mjs on :4010), free.
#   real: the environment's saved OpenAI key (the proxy swaps the dummy). Only with the owner's yes and a message count
#         (2026-11-10: up to 5 messages for the "What's new" skyling scene).
cd /home/user/lf-main
U=$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)
export DATABASE_URL=${U%/budgetflow}/budgetflow_capture TZ=UTC FAKETIME_DONT_FAKE_MONOTONIC=1 PORT=3100
if [ "$2" = "real" ]; then export OPENAI_API_KEY=sk-dummy-replaced-by-proxy NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
elif [ "$2" = "fake" ]; then export OPENAI_API_KEY=sk-e2e-test OPENAI_BASE_URL=http://127.0.0.1:4010/v1
else unset OPENAI_API_KEY; fi
case "$1" in -*) exec faketime -f "$1" npx next start -p 3100;; *) exec faketime -f "@$1" npx next start -p 3100;; esac
