# ADR 0027: One admin area

Status: accepted (owner, 2026-11-06). Builds on ADR 0022 (admin) and ADR 0024 to 0026 (HQ).

## Decision

The owner said: "there shouldn't be as many tabs and pages, so the admin page and HQ are one." The admin and HQ become one area with one menu of five places plus a settings gear. No group labels, no tabs inside pages.

| Place | Path | Parts (each an h2 with an anchor) |
| --- | --- | --- |
| Office | `/admin` | The HQ office (or `?view=workspace`), the Chief of Staff's brief, tiles, needs your yes, decided for you, recent activity, this week's missions, then "The app today" (Users, Active today, New today, Errors, Open feedback, plus attention lines only when there are any) |
| Work | `/admin/work` | Needs your yes (`#approvals`), Missions (`#missions`), This week (`#report`) |
| Marketing | `/admin/hq/marketing` | unchanged |
| People | `/admin/people` | People (`#people`, search), Feedback (`#feedback`), Announcements (`#announcements`) |
| App | `/admin/app` | Growth with the sign-up chart (`#growth`), AI use (`#ai-use`), Errors (`#errors`), Health (`#health`), Activity log (`#activity`) |
| Settings gear | `/admin/hq/settings` | unchanged |

Staying where they are: employee pages `/admin/hq/[role]` (rooms open them; they light Office), mission pages `/admin/hq/missions/[id]` (light Work), marketing pages, `/admin/users/[id]` (lights People) and `/admin/users/export`.

## Old URLs

Every old page file now only calls `requireAdmin()` (so non-admins still get a 404) and `redirect()`s with the query string kept: `/admin/hq` to `/admin`, `/admin/hq/approvals`, `missions`, `reports` to `/admin/work#approvals`, `#missions`, `#report`, `/admin/hq/founder` to `/admin/work`, `/admin/users` and `/admin/feedback` and `/admin/announcements` to `/admin/people#...`, and `/admin/growth`, `errors`, `health`, `activity` to `/admin/app#...`.

## Rules that stay

- `requireAdmin()` on every page (the new pages call it themselves, never the layout alone) and every action. Each part loads inside its own `safe()` panel, so one failure can't blank a page.
- Each old page body moved to a colocated `section.tsx` that the new pages compose. Params that would clash on one page are renamed: the feedback filter is `fstatus` / `fkind` (the user search keeps `q`, `plan`, `status`, `page`); the old URLs are mapped.
- Actions send people back to the new places (`/admin/work`, `/admin/people`, `/admin/app`, with the section hash) and revalidate the whole `/admin` layout.
- Push and activity links point at `/admin` and `/admin/work#approvals`.
