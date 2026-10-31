# 0015: Simplify for the student-first app

Date: 2026-10-29. Status: accepted. Plan: `docs/plan-v2.md` (Phase 1).

## Decision
- **Pills:** Plan = Calendar · To-dos · Goals · Health · Work. Jarvis = Chat · Updates · Profile. Money = Overview · Activity · Accounts. School = Classes · Notes. Budget, Subscriptions, Bills and Investments are reached from Money's Overview.
- **Available now** (checking + cash) replaces "safe to spend". No per-day allowance anywhere; the owner doesn't want a daily budget enforced.
- **Removed:** Insights and monthly report pages (Jarvis has `monthly_money_report`), the Save money page (savings finds arrive as Jarvis updates), the financial health score and daily/weekly money check-ins, and the Trips area.
- **Trips become calendar events.** Migration 0018 turns each trip into one all-day event (bookings already had their own events) and drops `trips`/`trip_items`. Forwarded flight/hotel/train confirmations are filed as events, with Undo.
- **Goals** moved to `/goals` under Plan (all goals in one place).
- **Updates** merges Noticed (`/jarvis/says`) and Filed (`/inbox`) behind one pill with a segmented switch.
- **Jarvis profile** (`/jarvis/profile`): status (memories needing OK, new updates, or all caught up), Personality and Memory cards, and shortcuts.
- **Accent color** (green, blue, purple, pink, orange): `lf_accent` cookie → `html[data-accent]`, light and dark tokens in `globals.css`.
- The one-time learning consent question no longer counts toward Jarvis's daily message cap.

- **Regular work hours** (`employers.schedule`, migration 0019): for full-time or fixed schedules. `fillRegularShifts` adds shifts 3 weeks ahead (run on Jarvis's daily slots and when hours are saved). `scheduleFilledThrough` makes each day fill once, so a deleted day off isn't recreated; changing the hours replaces only future, untouched shifts from the old hours. Set in onboarding, on the Work page, or by Jarvis (`add_job`, `set_regular_hours`).

## Why
Fewer screens and one clear number make the app easier to understand. Less code means fewer bugs.
