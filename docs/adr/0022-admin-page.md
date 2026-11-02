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
