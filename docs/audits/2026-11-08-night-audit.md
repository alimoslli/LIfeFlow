# Night audit 2026-11-08: Promises (ADR 0031) and the /welcome flow

Scope: origin/main (e9fc587) since the 2026-11-07 HQ audit. Line numbers are on origin/main (this branch, `claude/chief-of-staff`, is behind it and lacks the files).
Method: read the code and migration, ran the relevant tests, traced the promise from the chat tool and the card to the database.

## What was run
- `vitest`: promise-voice, todo-promise-goal, promises, promise-checkin, onboarding: 5 files, 19 tests, all pass. (The local test database `budgetflow_test` did not exist in this sandbox; I created it. No product code or test was touched.)
- NOT run: e2e (`promises.spec.ts`, `onboarding.spec.ts`). Playwright's browsers are not installed here and a production build was out of the time budget. The phone check of /welcome below is therefore a code review, not a rendered check. A first-run phone e2e is still owed.

## Checked and fine
- Table: `drizzle/0054_promises.sql` has `userId`, ENABLE and FORCE RLS and an `owner_isolation` policy; schema uses `ownerPolicy()` (schema.ts:466-485). Re-run safe (IF NOT EXISTS, duplicate_object guards). Cascades with the user, and `data-export.ts` includes it.
- Every service query filters by `userId` and runs inside the scope; `taskId` goes through `assertOwned` (promises.ts:27).
- Kept/broken only by the user's word: card answer (`respond.ts:127-143`), chat `resolve_promise`, or a finished linked to-do. Only `open` rows can change, so a double answer cannot flip one. `dropStalePromises` sets `dropped`/`timeout`, never broken; `promisesDue` also ignores anything older than 7 days.
- Cron `/api/cron/promises`: bearer `CRON_SECRET` compared with `timingSafeEqual`, 401 when the secret is unset (route.ts:19-22); in `vercel.json`; skips demo accounts; pushes go through `pushImportant` (quiet hours, 24-hour push limit, 12-hour freshness).
- Wording: no em or en dashes in `promise-voice.ts`, the tool or the service; the unit test checks the guilt-word list.

## Findings (ranked)

### 1. Medium, fix now: "Tomorrow instead" can re-ask at once
`movePromise` (promises.ts:93-97) sets `dueAt = old dueAt + 1 day`. If the card sat unanswered for two or more days (it can wait up to 7), the new time is still in the past, so `promisesDue` returns the promise on the next Today open or cron run and the person gets the same question again right after saying "tomorrow". It also burns one of the two moves. The reply text ("Tomorrow it is. I'm holding you to it") then lies.
Fix: new due = the check-in time on the day after today (or `max(old due, now) + 1 day`). Add an integration case where the promise is 3 days overdue.

### 2. Medium, fix now: a wrongly sorted promise cannot be removed
The prompt tells the assistant "If they say you picked wrong, switch it: save the right kind and remove the other one" (prompt.ts, new sorting section), but there is no `delete`/`cancel` promise function, tool or action in `services/promises.ts` or `tools/promises.ts`. Scenario: "I'll study for the exam" is saved as a promise, the person says "make that a to-do", the assistant creates the to-do, the promise stays open, and at 9 PM the person is asked "Did you do it?" about the same thing (the "one thing is one record" rule is broken). The only ways out are answering "didn't happen" (counts toward the 14-day attitude line) or waiting 7 days. Also nothing lets a person cancel a promise they no longer mean.
Fix: a cancel path (status `dropped`, `resolvedBy: "you"`, no count against them) as a tool plus the same answer on the card; or have the assistant link the promise to the new to-do with `taskId`. Needs an owner's yes only if a new card button is added; the tool alone is a small fix.

### 3. Low, fix now: a promise linked to a to-do that is already done is "kept" immediately
`createPromise` accepts any owned `taskId`, and `keepFinishedTaskPromises` (promises.ts:110-118) keeps every open promise whose task has `status = done`, whenever it was finished. Linking to a to-do completed last week yields an instant "Promise kept" and a streak count. This is a credit the person didn't earn by the "finishing the to-do" rule (the rule means finishing it after promising). Fix: refuse or ignore a linked task that is already done, or only keep when `tasks.completedAt >= promises.createdAt` (check the column name).

### 4. Low, fix now: the cron swallows every error
`route.ts:35` has `catch {}`; a failure for one user is silent and the response still says `ok: true`. Under CLAUDE.md "Error alerts" these should go to `recordError` (no user content). Also: no test for the cron's 401 path, and it loops every user sequentially every 30 minutes with `maxDuration` 300, which will not scale past a few thousand accounts (pick only users with an open promise due).

### 5. Low, fix now: extra writes on every Today render
`page.tsx:47-51` runs the promise detector on each Today open; `promiseCheckin` always starts with `dropStalePromises` (an UPDATE) and a join query, for every user, including those who have never made a promise. Cheap today. Suggest an early `exists(open promise)` check before the rest.

### 6. Low, needs the owner: wording in the "attitude" lines
`promise-voice.ts` coach line "I'm not mad, I just know you're better than this" and "I'm holding you to it" (moved), friend line "I'm giving you a look". The test passes (no listed guilt word), but the research rules for notifications say no guilt or pressure; "better than this" implies the person is falling short. The owner chose a "firmer, playful" line at three broken, so this is a judgement call on tone, not a bug. Suggest owner reads the six lines once.

### 7. Low, needs the owner (or note): `resolve_promise` trusts the model
The tool (tools/promises.ts) relies on the description ("ONLY when the user says so") with no code check, unlike memory writes (`explicitMemoryRequest`). A prompt-injected email or a model slip could mark a promise broken; the damage is limited to the person's own counters and the attitude line. Accept the risk, or add a cheap guard (the user's message must mention the promise or a yes/no word). Same applies to `make_promise` creating a card the person did not ask for.

### 8. Info: a push can show private text
The promise text (the user's own words, e.g. "no spending on food delivery") goes into the push body via `pushText`. When the Money lock is on, a money-flavoured promise would show on the lock screen. Promises are not money data by type, so this is low; flagging for the notification rule "nothing private on the lock screen when the Money lock is on".

## /welcome on a phone (code review only, see "NOT run")
- Layout is one column, `max-w-md`, `min-h-dvh`, safe-area padding; Back is 44 px, "Skip setup" `min-h-11`, choice rows and name chips `min-h-11/12`; fonts in rem. No overlapping controls found: the header holds Back, the step dots and Skip in one row, and the page scrolls to the top on each step.
- Navigation edge cases checked: switching "What fills your week" after going back keeps the step index valid (the list shortens to 4 for "Neither"; `Math.min` clamps it).
- Server side: `onboardingSchema` caps names at 200 and courses at 12, duplicates removed, one transaction; `setDisplayName` validates 1 to 80 characters; "Skip setup" still queues the tour.
- Minor, not filed as a bug: the name field is required to press "Let's go" (only "Skip setup" bypasses it); someone with no name who skips is called "there" for good. Reasonable, but the owner may want a softer rule.
- Owed: a rendered phone-size pass (iPhone 13 and Pixel 7 projects) once browsers are installed; the 44 px test in `layout-phone.spec.ts` already fills the name on screen one.

## Hand-offs
- Fix now: findings 1, 2, 3, 4 (developer missions, high priority for 1 and 2); 5 is optional.
- Needs the owner (through the COO): findings 6 and 7.
