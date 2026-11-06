# HQ build, night of 2026-11-06: morning report

Branch `claude/sharp-lovelace-8fr6z5`. Nothing is live and nothing is on main.

## What's done
- **LifeFlow HQ Phase 1 works** at `/admin/hq` (owner-only, the same sign-in rule as admin):
  - **Office view:** six rooms, including yours with the brass plate, and a lounge.
  - **Workspace view:** the same data with no characters.
  - **Employee pages:** each has its chat, missions, approvals and activity.
  - **Missions board:** add, start, block and finish missions, and copy a mission then open its chat.
  - **Approval inbox:** Yes, No or Changes, with a note.
  - **Reports:** this week, built from the records.
  - **Settings:** chats, HQ keys, the usage plan and "Import the starting list".
  - **Founder Office:** your admin, unchanged.
- **Real data only.** The starting list is the handover's open work (6 missions) and your 6 waiting decisions. Each employee's state comes from records. With no data, they are asleep or offline, never "working".
- **Your character:** redrawn from your second photo. Dark curls with a fringe above thick dark brows, blue-grey eyes, a navy polo with a small colourful print, no sunglasses. You're always at your desk with a card stack showing what waits for your yes.
- **No AI to open it.** Animations are CSS. The chats report in through a check-in after each turn, which never sends message text.

## Checks
- **The full unit and integration suite** was green before the review fixes. A final run after them was still going when I wrote this, and its result is in the chat.
- **The project's type, lint and format checks pass.**
- **The build passes.**
- **E2E:** HQ (desktop and iPhone size) and admin pass. The full e2e suite was not run.
- **Reviews:**
  - A fresh-eyes security review found 3 medium and 7 low issues. All were fixed with tests:
    - rate limits by IP and by key;
    - only you can link chats to employees;
    - no double-counted usage;
    - stale readings hidden;
    - your time zone;
    - a byte cap on uploads;
    - HTTPS only for the reporting script.
  - I fixed one layout bug myself: long mission titles stuck out sideways on phones. A phone test now covers it.

## Needs you (yes or no)
1. **The look:** the screenshots in the chat. Yes means it can go live.
2. **LF V3's unsaved work:** open LF V3 and say yes. That chat is waiting to commit and push the unfinished "Same bill?" and search work, which today exists only on its cloud machine.
3. **Going live, in this order** (after your yes):
   1. Ship LF V3's verified fixes first: calendar duplicates and search as you type. The HQ branch includes them, and their migrations 0038 and 0039 must reach production before HQ's 0040.
   2. Merge the HQ branch. The deploy runs the migration.
   3. In HQ Settings, press "Import the starting list" and create a key.
   4. I save `HQ_URL` and the key on the cloud environment. You approve both prompts. Then the chats start checking in.
4. **Night rounds report to HQ (Phase 2):** a change to the scheduled night round and research tasks, so they post missions, approvals and their usage to HQ.

## Honest limits
- **HQ can't show or drive your chats.** It opens them in Claude.
- **States are as of the last check-in.**
- **Weekly usage:** the status line reading didn't run in this cloud chat, so the meter will likely only fill from your terminal app. Until a reading arrives, the tile says "Not measured yet". Rounds can also stop on Claude's own "near the limit" warning; that's part of Phase 2.

## Carry-over
- **Apple Health ingest:** it has the same rate-limit weakness the review found in HQ (a limit keyed on whatever key is sent). It's a small security fix, approved in advance, and goes on Sunday's night round.
- **Full e2e suite on the merged branch** before main.
- **Phase 2:** wire the night round and research tasks to `scripts/hq.ts`, with a usage gate.
