# Handover from the product chat to LifeFlow HQ (2026-11-06)

The owner is moving LifeFlow's four chats into one HQ that runs agents. This page is what HQ needs from the product chat, so it doesn't have to read that chat's history.

## Where the truth lives
- **The rules:** `CLAUDE.md`. These include approval (small fixes are approved in advance; real changes need the owner's yes), every page following the simple concept, notifications, price, and usual work days.
- **The team and the loop:** `docs/team.md`. This covers the cost rules, no background agents while the owner is awake, and the start and stop phrases ("goodnight", "good morning", "I'm at work").
- **The product and the owner's decisions:** `docs/vision.md`, section 15 (items 1 to 14), with the owner's own words at the end.
- **Dev's AI path:** `docs/adr/0023-dev-own-models.md`.
- **Research:** `docs/research/` (2026-11-05 rounds 1 and 2; the round 3 draft is about notifications).
- **Audits:** `docs/audits/`. The newest Carry-over sections are the open work.
- **Page redesign order:** `docs/design/2026-11-06-page-inventory.md`.
- **Situations and the simulator:** `docs/situations/`. The 70% student rule applies. The bills review harness is in `docs/situations/eval/bills/`.

## Branches and chats
- **The product chat:** branch `claude/pensive-mendel-r1yy4a`, kept even with or ahead of main.
- **The nightly audits chat** ("LifeFlow nightly audits"): branch `claude/nightly-audits`, scheduled tasks `trig_01JHv2DjF8YHYSrrdEF3YPc1` (night round, Sun, Tue and Thu at 3:07 AM PT) and `trig_018U3a2TpShQpwUd4AHn7baT` (research, Mon at 3:23 AM). Its hourly away-task is paused. HQ should decide with the owner whether it replaces this chat.
- **Verified fixes go to main** after `npm run check`, the build and e2e pass. Product and design changes need the owner's okay on a picture.

## Open work (paused until the owner says goodnight)
1. **"Same bill?" and "Did the exam move?" cards**, branch `fix-gmail-items`. Then one Opus review (it touches money and data), the gates and main. The rest of that branch is reviewed: no false merges, authenticated updates, cleanup once per account.
2. **Forgiving transaction search**, branch `fix-search`. This is the owner's real miss: "when did I last Zelle Omar Mousselli" found nothing. Then the gates and main.
3. **Merged on `claude/pensive-mendel-r1yy4a` but not on main yet:** the calendar duplicate fixes and search-as-you-type. Run the full check, the build and e2e, then main.
4. **The nightly audits chat's carry-over:** `docs/audits/2026-11-05-app-audit.md` (night audit, `fix-small` R2 and title-casing, situations s0021 to s0025, finishing research round 3).

## Waiting for the owner (yes or no)
- **Goals redesign, option A:** https://claude.ai/artifact/EUmH35NgRB1pDvJHcqsFwB
- **Connected accounts, "What Dev can see"** (plus the iPhone Shortcuts pack): https://claude.ai/artifact/MyHqEmJ5foFJvdCMm1GLG1
- **The six timeline concepts:** https://claude.ai/artifact/96o6wygYzrQAt6bkg5iyCW (still waiting for the owner's pick). Should Batch 1 (Today, Plan, To-dos) simply be the timeline?
- **Gmail abilities:** shifts from schedule emails, trips from email, reading the emails that matter (not only the newest 100), and asking about anything in email.
- **Search:** bold the matched letters?
- **Agent workload:** the before, now and midpoint table. The current setting is "Now", and runs happen only while the owner sleeps or is away.

## Already approved, to build after a picture
Usual work days, money on its way, the student week check, adding school and bank accounts by hand, the iPhone Shortcuts pack, and short-on-money fixes across savings and investments (facts, not advice; never trading).

## Lessons from this round (keep doing these)
- **A fresh-eyes reviewer on every money, security or data change** caught real damage before it shipped:
  - a sync that could wipe a calendar;
  - three Verizon lines merged into one bill;
  - a spoofed "exam moved" email;
  - repeat pushes after deploy.
- **Test detection at scale with the simulator,** and on held-out seeds, not only the builder's own fixtures.
- **Check the drizzle journal's `when` order** when branches add migrations. An out-of-order `when` is skipped silently.
- **Builders share one machine:** each needs its own test database (`budgetflow_test_a` to `_f`). Never reinstall `node_modules` while builders run.
- **The owner's screenshots become tests** (the date field under the Add button became `tests/e2e/no-overlap-phone.spec.ts`).
