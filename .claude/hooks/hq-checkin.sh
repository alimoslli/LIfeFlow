#!/usr/bin/env bash
# Stop hook: tells LifeFlow HQ this chat is alive. No message text is ever sent. A no-op without HQ_URL.
# Never blocks or fails a turn.
[ -z "$HQ_URL" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
# Node fetch only uses the cloud proxy (which adds the HQ key) with NODE_USE_ENV_PROXY=1.
( NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 timeout 10 npx --no-install tsx scripts/hq.ts checkin --quiet >/dev/null 2>&1 & ) >/dev/null 2>&1
exit 0
