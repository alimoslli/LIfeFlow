# ADR 0025: HQ marketing, publishing with approval, and controls

Date: 2026-11-06. Status: accepted (Phases 3 to 5 of ADR 0024). Backend and API; the screens are built separately.

## Context

LF Marketing makes concepts, scripts and posts, and the owner wants to see them in one calendar, say yes or no, and know that nothing goes public without that yes. The owner also wants real numbers (not guesses) and one place to stop the automated rounds.

## Decision

### Data (migration `0044_hq_marketing`)
Three tables with no `user_id` and no RLS, like the other `hq_*` tables, reached only through `services/hq-marketing.ts`:
- `hq_content`: concepts, scripts, posts and sourced research (kind, title, hook, body, networks, status, schedule, the scheduler id, the published link, the publish approval).
- `hq_metrics`: real readings, one per day, network, metric and post (unique key `taken_on, network, metric, content_ref`). Written only by `recordMetrics`; nothing is estimated, and with no readings a network shows no numbers.
- `hq_settings`: one row (`hq`) with the owner's controls.

Status: idea, draft, waiting (a publish approval is pending), approved, scheduled, published, dropped.

### The publish flow
1. A marketing round (or the owner) saves a post as a draft, with `ask` it also creates a `publish` approval (role marketing; the owner's phone is pushed) and the post becomes `waiting`.
2. The owner's decision, recorded by `decideApproval`, moves the post: yes = `approved`, no = `dropped`, changes = back to `draft` (the note is in the activity feed).
3. The next marketing round reads `approvedContent` in `/api/hq/inbox` and puts each post into Metricool with `createScheduledPostForReview`, then reports `status scheduled` with the Metricool id (`externalId`).
4. The owner presses the final button in Metricool. The round later records `published` with the post link.

HQ never publishes anything. An agent can never set `approved` (only the owner's decision does), can set `externalId`, `publishedUrl` or `scheduled/published` only on an approved or scheduled post, and can't change the title, hook, body, networks, links or schedule once a post was sent for a yes. Auto-publish stays off until the owner gives a separate yes on per-category rules.

### Controls
`autonomous` (everything), a switch per round (night, research, marketing) and a weekly credit budget for generated media (0 = always ask). Every round reads them from `controls` in `/api/hq/inbox` right after check-in and, when off, replies "Skipped: turned off in HQ" and stops. Only the owner changes them (`saveControls` after `requireAdmin()`), which writes `admin_actions` and an activity line.

### Limits
- Instagram only today. No comments or direct messages. No paid generation (images, video) without a `paid` approval, and never above the credit budget.
- Bounds: title 140, hook 300, body 8,000, 5 networks, 10 links (https or same-site), metric names `[a-z][a-z0-9_]{0,39}`, values 0 to 1e12, a reading date not in the future, 200 readings per call.
- The weekly summary counts drafts (created in the week, research excluded) and the approved, scheduled and published changes recorded in the activity log that week; one change counts once.

## Consequences
- The shared text and logging helpers moved to `src/server/hq/validate.ts` so `hq.ts` and `hq-marketing.ts` don't import each other's setup. `hq.ts` still re-exports them.
- Dropping a post leaves its pending approval; deciding it later does not bring the post back.
- The Metricool step needs the marketing round prompt (a separate yes from the owner) and the connected Metricool account.
