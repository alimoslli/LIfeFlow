# ADR 0029: The COO, rooms that tell the truth, Goodnight, and the CEO's desk

Status: accepted (owner, 2026-11-07). Builds on ADR 0024 to 0028. The owner also said admin and HQ design changes may go straight to main, since no app user sees them and anything can be changed back.

## Context

The owner looked at the live HQ late at night and asked why the rooms didn't match what was really happening:
- the Chief of Staff showed "No chat connected yet";
- Research showed "Blocked";
- Marketing showed "Blocked";
- QA and Customer Success were never active.

What was actually going on:
- **The Chief of Staff.** Its first round stopped at the usage gate, before its check-in. HQ had no record of it.
- **Research.** It was still mapped to the old night-audits chat, which had a stale question. The owner has since answered that question: rounds run only on their schedule.
- **Marketing.** Its block was real: the Higgsfield credits had run out.
- **Room states.** `employeeState()` ranked "blocked" and "needs you" above "asleep". So at 3 AM a room looked stuck rather than resting.

The owner's decisions:
- The Chief of Staff is the **COO**; they are the CEO.
- A **CMO**, their partner, joins later.
- Everyone is asleep unless a round is really running.
- Rounds run only on their schedule. Goodnight is a button that starts nothing.
- Their goals sit on their desk as task files. A click plays a short animation and opens that task's Claude Code chat with a first prompt ready.

## Decision

1. **COO.** The employee with the role key `assistant` (unchanged, so no data migration) is titled "COO · Runs the company · Reports to you". Its chat is "LF COO" and its agent file is `.claude/agents/coo.md`. Old ADRs keep the old name.
2. **The sleep rule** (`hq/state.ts`). A room's state is one of four:
   - **Working**: a round it works in is running, or its own chat checked in within 20 minutes while one of its missions is in progress (the same rule also covers a mission whose chat is another chat).
   - **Done**: a fresh, unseen finished mission.
   - **Offline**: only for a room with its own chat that is archived, missing, or silent for over a week.
   - **Asleep**: everything else.

   "Blocked" and "Needs you" are no longer states. A pending yes, a blocked mission or a chat's question becomes a short note on the door (`doorNote`). The chip tone "needs_you" stays for other lists, such as content and the founder's door.
3. **When a round is running** (`liveRound` in services/hq.ts). The COO's own chat has status "working" (its `round_start` check-in) and checked in within `ROUND_MAX_MS` (3 hours). Its `round_end` check-in sets the chat back to idle.
   - Which round it is comes from the summary ("Night round started"), or else from the day in Pacific time.
   - During a round, the departments in that round show as Working: the night round has Engineering, QA, Customer Success and Research (situations); the Monday round has Research; the Wednesday round has Marketing.
   - A relayed status can't start a round, because only the COO's chat counts.
   - The round prompts now check in first (step 1), and every way out of a round sends `round_end` (docs/hq/round-prompts.md, version 3).
4. **The schedule.** `ROUND_SCHEDULE` in `hq/rounds.ts` matches the three scheduled tasks; a unit test compares it with the cron lines in round-prompts.md. Each sleeping room says when it next wakes in the owner's time zone, for example "Wakes Sun 3:07 AM, night round". Product & Design has no round, so it says "Works with you in its chat".
5. **Rooms with no chat of their own** are QA, Customer Success, and now Research. Chats once mapped to them are ignored, so the old night-audits chat's question no longer shows on Research.
6. **The CMO seat.** A plate above Marketing & Growth reads "CMO · Your partner · Coming soon". It is not an employee and has no state. The partner's own sign-in is a later step with its own security review.
7. **Goodnight.** A penthouse button records `hq_settings.goodnight_at` and an activity line. The office dims (CSS) until the first 5 AM after it, in the owner's time zone, or until "Lights on" is tapped. It starts and drives nothing.
8. **The CEO's desk.**
   - A mission with `desk_prompt` (plain text, at most 1,500 characters; set by the owner's "Add a file to your desk", or by `mission add|update --desk-prompt`/`--desk-prompt-file`) is a task file on the desk.
   - The penthouse shows them as a pile of folders next to a closed MacBook. The pile and the "Your desk" button open a list.
   - Picking a file plays a 1.2 s CSS animation: the file slides in, the lid opens, and the screen shows "Claude Code" and the task. Then the same tab goes to the link (`hq/desk.ts`):
     - With no chat yet, the link is `https://claude.ai/code/new?q=<prompt>&repo=alimoslli/LIfeFlow`, with the first prompt typed in. The prompt's first step, `mission update <id> --status doing`, tells HQ which chat took the task, through the chat's own session id.
     - Once the task has a chat, the link is that chat (`chatUrl`). A link can't type into an existing chat, so the next prompt is copied first. If copying fails, the screen shows the prompt to copy by hand.
   - Reduced motion skips the animation.
   - HQ only builds links. It never starts, reads or drives a chat, and never uses the owner's claude.ai login.
9. **Migrations.**
   - `0049_hq_desk` (journal `when` 1795100000000) adds `hq_missions.desk_prompt` and `hq_settings.goodnight_at`. Both are additive.
   - `0050_hq_coo_chat` (1795200000000) applies the owner's decisions to their data once:
     - it maps the COO's chat as the COO's main chat, which HQ never knew because only the owner maps chats and the COO hadn't checked in yet;
     - it unmaps the old night-audits chat from Research and clears that chat's stale question.

     It is safe on an empty database.
   - All of this is owner-ops data with no RLS, like the other `hq_*` tables.

## Consequences

- At night the office reads as asleep, with honest notes, and lights up only for rounds that really run. If a round crashes without `round_end`, it stops showing as running after 3 hours.
- The owner starts work from the desk in one click. The first click needs one more: pressing send in the new chat.
- A new department or round means updating `ROUND_SCHEDULE` and the round prompts together; the test fails otherwise.
- Changing the COO's scheduled tasks or chat title happens on the owner's account (`update_trigger`, `set_session_title`). The repo holds the source text in docs/hq/round-prompts.md.
