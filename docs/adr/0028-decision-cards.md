# ADR 0028: Decision cards

Status: accepted (owner, 2026-11-07: approved the pictures, direction "The Atrium"). Builds on ADR 0024 to 0027.

## Context

The owner opened Approvals, found 7 requests and understood none well enough to decide. "It has to be very easy for me to trust it and know exactly what's going to happen... like a real business. Someone reports to me, I approve, I deny, I do my changes. He comes back a second time, third time, until I say go. Everything organized... easy to find." They also asked for "a summary of all found and fixed things that I didn't have to approve, and updates on how my app is running and what's changed", and chose: refuse any request without a picture or without the yes/no steps.

## Decision

1. **A request is a card.** `hq_approvals` gains: why, changes (1 to 5 lines), onYes, onNo, effort (small/medium/large), risk, recommendation, previews (1 to 4 stored pictures with optional labels), and a thread (`thread_id`, `version`, `changed_since_note`, `superseded_at`). `createApproval` refuses any kind that lacks one, with a plain error naming what is missing. Small fixes and bugs still need no request. A content `ask` (publish) carries the same fields in `request`.
2. **Pictures** are rows in `hq_files` (bytea; owner-ops data, no RLS). Agents upload raw bytes to `POST /api/hq/files` with the HQ key (png, jpeg or webp by magic bytes, max 2 MB, rate-limited, never a URL to fetch). They are served only by `/admin/hq/files/[id]` behind `requireAdmin()` with the stored content type, `Cache-Control: private, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`; anyone else gets a 404.
3. **The loop.** The owner answers Yes, go / Send changes / No. Send changes needs a note, keeps the thread open and returns it to its department; `inbox` lists it under `revisions` with the note. The department sends `approval --revise <threadId|id> --changed "..."` with every field again: that creates version n+1, marks the old one superseded and pushes the owner. No closes the thread. Only the newest version, waiting on changes, can be revised.
4. **After a yes the same card keeps reporting**, through a linked mission (`approval --start <approvalId> --mission <missionId>`; `inbox` lists approved cards with no mission under `approvedWithoutMission`). The stage is read from the mission, never stored twice: Approved (the owner's yes, `decidedAt`), Being built (mission `doing`, or `blocked` with its reason), Ready for your look (mission `waiting`), Live (mission `done`, with its result and links). We chose the mission-status path over a second "look" approval of the same thread: it needs no extra owner tap and no new table state. Each step shows its date; a date HQ never recorded says so.
5. **Old requests** (no card) show as "Being rewritten by your Chief of Staff" with no buttons and are not counted as needing a yes (`NEEDS_YES` in services/hq.ts). `inbox` lists them under `needsRewrite`. The owner said to leave the existing ones alone.
6. **Since you last looked** (Office): from real records only, no AI. Fixed for you (missions done since, with no card linked, with a commit link when present), Found (missions agents made for QA, Customer Success and Research), What changed in the app (cards that reached Live), and one calm line on how the app is running (errors in 24 h, sign-ups, settings not set up), each part loaded inside `safe()`. The window starts at the cookie `hq_last_looked`, set by a small client effect after the page renders; on a first visit it is the last 7 days (never more than 30). Empty parts are left out; with nothing to show it says "Quiet since you last looked."

## Consequences

- Agents must send every field and at least one picture, so Product & Design makes the picture before a request goes in.
- Migration `0048_decision_cards` (journal `when` 1795000000000) is additive; old rows stay valid with null card fields.
- The pictures are small and few; if they grow, move them to object storage behind the same route.
