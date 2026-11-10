#!/bin/bash
# Local film server: the newest app on the capture database, on the film's clock (start time = $1, UTC).
# Local only. NO OpenAI: the owner stopped all OpenAI calls from this environment (via the COO, 2026-11-10); the
# key is left unset so the app can't reach it. Don't add one back without the owner's yes.
cd /home/user/lf-main
U=$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)
export DATABASE_URL=${U%/budgetflow}/budgetflow_capture
unset OPENAI_API_KEY
export TZ=UTC FAKETIME_DONT_FAKE_MONOTONIC=1 PORT=3100
exec faketime -f "@$1" npx next ${2:-start} -p 3100
