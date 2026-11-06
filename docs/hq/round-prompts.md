# HQ blocks for the scheduled rounds

These blocks are added to the two scheduled tasks that post into the LF V3 — Agents chat:
- the night round, `trig_01JHv2DjF8YHYSrrdEF3YPc1`;
- research, `trig_018U3a2TpShQpwUd4AHn7baT`.

Add each block **as it is**. Keep everything else in each prompt, the schedules and the cost rules unchanged. Only the chat a task posts into can change its prompt (`update_trigger`).

## Night round: insert just before the last line ("Follow the red lines and CLAUDE.md. No PRs.")

```
**HQ (owner, 2026-11-06: HQ must show real progress and change).** Follow docs/hq/workflow.md, "Every round, step by step". Run `npx tsx scripts/hq.ts …` from the LifeFlow repo after step 1 (merging origin/main brings the script).
- **Start:** `checkin --status working --phase round_start --summary "Night round started"`, then `inbox`. Act on the owner's decisions (yes: do it; no: mark that mission dropped; changes: follow the note) and treat the owner's open missions like carry-over.
- **Usage gate before every new agent:** this session's get_session → external_metadata.rate_limit_info. If isUsingOverage is true, stop now. If status is allowed_warning, finish the current step, save the carry-over and stop. Never turn on extra usage.
- **Every piece of work is a mission** (fixes → developer; audit and situations → researcher): `mission add --role … --title … --priority …` (or reuse the owner's), `mission update <id> --status doing --progress "…"` when it starts, a `checkin --status working --summary "<what is happening now>"` after each step, and `mission update <id> --status done --result "<what changed>" --link "Commit=https://github.com/alimoslli/LIfeFlow/commit/<sha>"` when finished (or `--status blocked --blocked "<why>"`).
- **The yes or no list also goes into HQ:** each real change as `approval --role … --kind … --title … --summary … --link …` (this pushes the owner's phone).
- **End:** `checkin --status idle --phase round_end --summary "<N fixed, M found, K waiting for you>"`, then `activity --role researcher --text "Morning report: …" --link <the audit report on GitHub>`.
- HQ is a mirror, never a blocker: if HQ_URL isn't set or a command fails, carry on and say so in the report.
```

## Research: add at the end

```
**HQ (owner, 2026-11-06: HQ must show real progress and change).** Follow docs/hq/workflow.md. In the LifeFlow repo on `claude/nightly-audits`, fetch and merge origin/main first, then run `npx tsx scripts/hq.ts …`:
- **Start:** `checkin --status working --phase round_start --summary "Research round started"`, `inbox`, then `mission add --role researcher --title "Weekly research <date>"` and `mission update <id> --status doing`.
- **Usage gate:** before starting the researcher, check this session's get_session → external_metadata.rate_limit_info. If isUsingOverage is true, don't start. If status is allowed_warning, skip this week and say so. Never turn on extra usage.
- **Proposals into HQ:** each fix-now proposal becomes `mission add --role developer --title … --priority …` (the night round picks it up). Each build-now or owner-decision proposal becomes `approval --role researcher --kind feature|design|other --title … --summary "<the problem, the source, the value, effort and risk>" --link "Source=<url>"`.
- **End:** `mission update <id> --status done --result "<N findings, M proposals>" --link "Report=<the report on GitHub>"`, `checkin --status idle --phase round_end --summary "Research done"`, then `activity --role researcher --text "Research: …" --link <the report on GitHub>`.
- HQ is a mirror, never a blocker: if HQ_URL isn't set or a command fails, carry on and say so in the summary.
```
