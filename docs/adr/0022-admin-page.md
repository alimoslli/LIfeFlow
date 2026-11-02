# ADR 0022: Owner admin page (/admin)

Date: 2026-11-02. Status: accepted.

## Context

The owner could only see users by querying Postgres by hand. They need one place to see who signed up, how the app is doing, what is failing, and to act on an account, without ever being able to take the site down or read people's private data.

## Decision

### Who can open it

- `ADMIN_EMAILS` (comma separated) in the environment. Anyone else, signed in or not, gets a plain 404, so the page's existence isn't advertised.
- The admin account must also have two-step sign-in on (authenticator app) or a passkey. Without it the page is a 404 as well. This is what protects the page if someone registers the admin's email before the admin does.
- Checked on every page and on every action, never only in a layout (same rule as Money pages).
- Demo accounts are never admins.

### What it shows

Accounts and operations only, never anyone's content.

- **Overview:** users, new in 24 h / 7 d / 30 d, signups per day (30 days), active in the last 24 h, Pro, suspended, signed-in sessions.
- **Users:** search (email or name), filters (plan, status), paging. One page per user with account facts (plan, created, last seen, 2FA, passkeys, sessions, whether a phone and a Stripe customer are attached).
- **Errors:** the existing grouped, scrubbed `error_reports`, newest first, with "clear".
- **Health:** database round trip and size, migrations applied, which integrations are configured (yes/no only, never a key), app and Node versions. `/api/health` stays the endpoint for an uptime monitor.
- **Activity:** the admin action log.

Per-user data (money, messages, to-dos, audit events, Jarvis runs, feedback) is protected by row-level security and is deliberately out of reach of this page. Feedback already goes to the owner by email.

### What it can do (owner chose full control)

All of these write a row to `admin_actions` (who, what, to whom, when; no secrets), are rate limited, and need a POST from the owner's signed-in session.

- **Sign out everywhere:** deletes the user's sessions.
- **Suspend / unsuspend:** sets `users.suspended_at`. A suspended user can't sign in and every existing session stops working at once (`validateSession` ignores them). Their data is kept.
- **Set plan (free / Pro):** a manual override. The Stripe webhook can change it again on the next subscription event.
- **Delete user:** permanent (cascades through every table, like Settings → Delete account). Guards: the admin must type the user's exact email; admins and the demo account can't be deleted or suspended; a user with an active Pro plan can't be deleted until the subscription is cancelled in Stripe (deleting would leave them paying).
- **Clear an error report.**

No action can touch the admin's own account.

### Not letting the admin page hurt the site

- Read-only queries with a 5 s statement timeout, hard limits (25 per page, 50 errors) and no per-user fan-out, so a slow query can't pile up connections.
- Each panel loads on its own and shows "Couldn't load" if it fails; one broken query doesn't blank the page or throw.
- The page is server-rendered HTML with plain forms, no client JavaScript to fail.
- Admin pages are `noindex`, `no-store`, and not in the public list of `proxy.ts`.
- This page can't promise the site never goes down (hosting, database and third-party outages are outside the app). What it does is show the problem fast: health, errors with counts, and the existing owner alert emails.

## Consequences

- New migration: `users.suspended_at` and an `admin_actions` table. `admin_actions` has no RLS (it's about accounts, like `users` and `sessions`) and keeps an email snapshot, so the log stays readable after a user is deleted.
- `validateSession` now excludes suspended users; password sign-in shows a clear "account suspended" message.
- Out of scope for now: cross-user Jarvis cost totals and listing feedback (blocked by RLS on purpose), emailing users, impersonating a user (never).

## Additions (merged into main)
- **AI use:** the overview and each user page show testing-limit usage (messages and voice calls, today and this month), read from the limiter's own counters in `rate_limit_buckets` (counts only, no content). **Reset limits** clears one person's counters and is logged as `reset_limits`. Owner accounts (`adminFor`) aren't held to the testing limits.
- **Invites:** "Joined from invites" on the overview; "Invited by" and "Friends they invited" on each user.
- **Health:** Microsoft Teams and Outlook, and whether the AI spend cap is active (model prices set).
- The migration was renumbered to `0032_admin_page` because `0031` was already used by invites.

## Redesign and more tools
- **Layout:** a sidebar on wide screens and a scrolling menu on phones, with counts for open feedback and errors. The overview leads with stat tiles and a "Needs your attention" list.
- **Feedback inbox:** each Settings → Send feedback message is saved to the user's own `feedback` row (row-level secured) and copied to `owner_inbox`, a message to the owner like the email they also get. The admin page reads only `owner_inbox` (mark handled/reopen, reply by email). Removing RLS from `feedback` was rejected; the copy keeps every per-user table locked. Messages sent before the copy existed stay in email only.
- **Announcements:** one banner at a time for everyone in the app (`announcements`, `activeAnnouncement`), with a style, an optional link (`/…` or `https://…` only) and an end date. People can close it on their device; it's hidden on the full-screen chat.
- **Growth:** active today/week/month, sign-ups, invite share and top inviters.
- **Export:** `/admin/users/export` downloads accounts as CSV (formula cells neutralised), owner-only and logged.
- `owner_inbox` and `announcements` aren't per-user data, so they aren't row-level secured (like `error_reports`).
