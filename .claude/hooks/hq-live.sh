#!/usr/bin/env bash
# Live status for LifeFlow HQ (ADR 0030): on a new message, before each tool and at the end of a turn, tells HQ in one short
# line what this chat is doing (scripts/hq-live.mjs). Never a message, a command or a file's contents. A no-op without HQ_URL.
# Runs in the background, so a tool never waits on it, and never blocks or fails a tool or a turn.
[ -z "$HQ_URL" ] && exit 0
input=$(cat 2>/dev/null)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f scripts/hq-live.mjs ] || exit 0
# Node fetch only uses the cloud proxy (which adds the HQ key) with NODE_USE_ENV_PROXY=1.
( printf '%s' "$input" | NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 timeout 20 node scripts/hq-live.mjs >/dev/null 2>&1 & ) >/dev/null 2>&1
exit 0
