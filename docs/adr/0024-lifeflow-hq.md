# ADR 0024: LifeFlow HQ (the owner's office)

Date: 2026-11-06. Status: accepted (Phase 1). The owner's brief is `docs/hq/brief.md`; the approved plan is `docs/hq/plan.md`.

## Context

The owner runs LifeFlow through four real Claude Code chats (LF Main, LF V3, LF V3 — Agents, LF Marketing) plus scheduled night rounds. Work, decisions and approvals were spread across those chats, morning messages and docs. The owner asked for one private, cozy "office" where five employees show what is really happening, the chats open in one tap, and missions, approvals and the admin page live together. It must cost no AI to open and must never put the chats or their branches at risk.

## Decision

### Where it lives
`/admin/hq`, inside the existing owner-only admin area (ADR 0022): `requireAdmin()` on every page and every action, a 404 for everyone else, `noindex`, no client secrets. The existing admin pages become the "Founder Office" group in the same navigation, unchanged.

### The chats are linked, never driven
There is no supported way for a website to read or continue subscription Claude Code chats, and using the owner's claude.ai login from the app would bypass that. So:
- HQ opens the real chat (`https://claude.ai/code/<session id>`, `chatUrl()`), and "Copy and open" puts a mission's instruction on the clipboard first.
- The chats report to HQ. A Stop hook (`.claude/hooks/hq-checkin.sh`) runs `scripts/hq.ts checkin` after each turn: session id, branch, last commit, time and the usage meter. It sends no message text, does nothing without `HQ_URL`, and never blocks a turn. Rounds use the same CLI for missions, approvals and activity.
- Status is "as of the last check-in". HQ never shows activity it didn't receive.

### Data
Six tables with no `user_id` and no RLS (owner operations, like `admin_actions`): `hq_missions`, `hq_approvals`, `hq_activity` (append-only), `hq_chats`, `hq_usage_samples`, `hq_keys`. They are reached only through `services/hq.ts`. App users' content never goes in them. Migration `0040_lifeflow_hq` (its journal `when` is after 0039; ship it after 0038/0039 reach main).

### Agents' door: `/api/hq/report` and `/api/hq/inbox`
Public routes authenticated by an `lfq_` key (only a SHA-256 hash is stored, max 5 active, revocable in HQ Settings), rate-limited, 64 KB cap, zod-validated. Links must be `https://` or a same-site path. A bearer that is not the exact key shape is refused before anything is counted; limits are by IP, then by key. An agent's `import` never maps chats to employees or sets a main chat (only the owner does, in Settings, including the owner-only "Import the starting list" button). In cloud sessions the key is a network secret on the environment, injected by the proxy, so it never appears in the repo or a chat.

### The employees are a face, not five AIs
Developer (LF Main), Designer / V3 (LF V3), Researcher (LF V3 — Agents), Marketing (LF Marketing), HQ Assistant (plain app logic) and the founder's own room. A state is worked out from records only (`hq/state.ts`): offline, blocked, needs you, working, done, else asleep. Animations are CSS.

### Approvals
Deploys, V3 merges, features, design changes, publishing, outbound messages, paid ads, subscriptions, destructive actions and security changes become `hq_approvals`. The owner's answer is recorded (plus `admin_actions`) and pushed to their phone when an agent asks. HQ never carries out a decision itself: the employee acts on it at its next round (`hq.ts inbox`).

### Usage
Claude Code's status line gives Max subscribers `rate_limits.seven_day.used_percentage`. `hq-statusline.sh` saves it, check-ins send it, and rounds mark `round_start`/`round_end` so their share of the week can be measured against the owner's plan (aim 35–40%, ceiling 50%; split 25/15/10). This is a measurement and a stop rule for new work, not a hard cap: a step already running finishes, the meter counts the whole account, and it only updates after replies. When it isn't available the tile says "Not measured yet".

## Consequences

- HQ costs nothing to open: server-rendered reads and CSS.
- Status can be stale between check-ins; every line says "as of".
- Night rounds start reporting through `hq.ts` in Phase 2 (a change to the scheduled task prompts, with the owner's yes).
- Going live needs: the owner's yes on the screenshots; deploy (the migration runs on deploy); an HQ key created in Settings; `HQ_URL` and the key saved on the cloud environment.
- Out of scope now: marketing calendar, social connections, comments and messages (Phases 3–4), an "Autonomous mode" switch (Phase 2).
