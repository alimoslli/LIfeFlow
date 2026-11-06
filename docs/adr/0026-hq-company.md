# ADR 0026: HQ as a company (Chief of Staff and six departments)

Date: 2026-11-06. Status: accepted. Builds on ADR 0024 and 0025. The operating model is `docs/hq/company.md`.

## Decision
- HQ shows a company: the owner (CEO), one Chief of Staff (`assistant`) and six departments: Engineering, Quality & Security (`qa`), Product & Design, Research & Insights, Marketing & Growth, Customer Success (`support`). The owner talks only to the Chief of Staff.
- The Chief of Staff is no longer app logic. Its state comes from its chat like everyone else's ("LF Chief of Staff"). `qa` and `support` have no chat (`ownChat: false`): they work inside the Chief of Staff's rounds, so they are "asleep" (never "offline") and become "working" only through the cross-chat rule (a mission in progress whose session chat checked in within 20 minutes). Blocked and needs-you still win.
- **Briefs** (`hq_briefs`, `recordBrief`, `brief` CLI command): one short plain-text brief per round (1-2000 characters, `needsYou` 0-999, default the pending approvals). HQ stores it, logs "Brief from your Chief of Staff" and pushes the owner (title "Your Chief of Staff", the first line up to 140 characters). The Office shows the latest.
- **Decision rights.** The owner switches three level 1 delegations in Settings (`hq_settings.delegations`: fix order, research topics, posting times); the Chief of Staff reads them from `inbox`. A delegated decision is logged as activity kind `decision`, allowed only for role `assistant`, and shown under "Decided for you". HQ only logs decisions. The never-delegated list (deploys, V3 merges, features, design, pricing, spending, publishing, outbound messages, subscriptions, deleting, security) lives in the Chief of Staff's rules and in `company.md`. No API lets an agent decide an approval: `decideApproval` is reachable only from the owner's admin action.
- **Error feed for Customer Success:** `GET /api/hq/errors` (HQ key) returns `error_reports` groups (route, scrubbed message, counts, dates), newest first. These rows are already scrubbed by `recordError`. `feedback` and `owner_inbox` are never read.
- Marketing fixes: dropping content closes its pending publish request as declined ("Dropped by you", logged, `admin_actions`); the publish request shows the planned time in the owner's time zone.
- `checkin --session <id>` lets the Chief of Staff relay another chat's real status (no branch, commit or usage of its own).

## Why the Chief of Staff's chat has one repository
A cloud chat with more than one repository ignores repo hooks and `env` (only plugins are read from settings). So the Chief of Staff's chat has only the LifeFlow repo, and it relays the other chats' status with `checkin --session`, using the mapped chats from `inbox` (`chats`).

## Consequences
- Migration `0045_hq_company`. `HQ_ROLES` gains `qa` and `support`.
- Nothing here calls an AI; HQ still costs nothing to open.
