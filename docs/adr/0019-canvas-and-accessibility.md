# 0019: Canvas sync and accessibility checks

Date: 2026-10-30. Status: accepted.

## Canvas
- Students connect with their school's Canvas address and a personal access token (Account → Settings → New access token). The token is verified against `/api/v1/users/self`, then stored encrypted like other connections.
- **Read-only:** active courses and their published assignments (name, due date, points, link). We never submit, post or change anything in Canvas. Descriptions aren't stored; course text is untrusted.
- **Idempotent:** courses by `(source, provider_course_id)`, assignments by `dedupe_key = canvas:<id>`, so a moved due date updates the existing row; the student's own status and grade are untouched.
- Pagination follows Canvas `Link` headers only on the school's own host (max 10 pages); links off that host aren't kept.
- Synced on connect, nightly with the other connections (cron/sync), from Settings ("Sync now") and by Jarvis (`sync_canvas`). Pro feature once billing is on.
- Later: an institution-wide Canvas app (LTI 1.3 / developer key OAuth) when a school signs up, so students don't need personal tokens.

## Accessibility
- `tests/e2e/a11y-phone.spec.ts` runs axe (WCAG 2.0/2.1 A and AA) on the main screens at phone size and fails on any serious or critical issue. Add new screens to its list.
