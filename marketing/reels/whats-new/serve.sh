#!/bin/bash
# Local film server: the newest app on the capture database, on the film's clock (start time = $1, UTC), real skyling
# replies through the environment's saved OpenAI key (the proxy swaps the dummy key). Local only.
cd /home/user/lf-main
U=$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)
export DATABASE_URL=${U%/budgetflow}/budgetflow_capture
export OPENAI_API_KEY=sk-dummy-replaced-by-proxy NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
export TZ=UTC FAKETIME_DONT_FAKE_MONOTONIC=1 PORT=3100
exec faketime -f "@$1" npx next ${2:-start} -p 3100
