# ADR 0030: Live HQ — see who is working on what right now, and start a task without leaving HQ

Status: accepted (owner, 2026-11-07). Builds on ADR 0024 to 0029.

## Context

The owner, with a photo of the office:

> "If the chats of these agents are doing something they have to show what they're doing. I want to stop opening Claude every time I want to see who's working on what, and see it live. Even when I start a task, if it's not taking me here and both are synced and I can use both for the same reasons, then I don't want it. Make it usable and worth it."

What HQ knew until now:
- A chat reported only at the end of a turn (the Stop hook) or when it ran `scripts/hq.ts` itself.
- The COO relayed the other chats only every 2 hours.
- The office page never refreshed by itself.
- "Start" on the desk sent the owner to Claude.

## Decision

### 1. Every chat reports what it is doing, as it works
- **The hooks.** `scripts/hq-live.mjs` (plain Node, no packages, so it runs before `npm ci`) runs through `.claude/hooks/hq-live.sh` on `UserPromptSubmit`, `PreToolUse` and `Stop` (`.claude/settings.json`, next to the existing check-in). It sends one check-in, `{type:"checkin", sessionId, live:{state, line}}`.
- **The line is plain words:**
  - a command's own short description, never the command;
  - "Editing desk.ts" or "Reading plaid.ts", the file name only;
  - "Searching the code", "Searching the web", "Reading a web page", "Helper: <its description>";
  - "Reading your message" for a new message, never the message;
  - bookkeeping tools send nothing.
- **The end of a turn** sends "idle", and the last line stays.
- **How often:** a new line at most every 10 s, a heartbeat every 2 minutes and a change of state at once.
  - A line that comes too soon isn't lost: it is sent when the 10 s are up, unless something newer came first. So a long command started right after another step still shows.
  - Each ping carries when the hook saw it, and HQ keeps only the newest, since pings sent in the background can arrive out of order. A time more than 2 minutes old (a skewed clock) counts as now.
  - It runs in the background, so a tool never waits, and does nothing without `HQ_URL` or a session id.
- **The server** (`recordCheckin`) keeps the line apart from the chat's `status` and `summary`, which the COO's rounds use (`liveRound`, `roundOf`). It writes `hq_chats.live_state`, `live_line` and `live_at` (migration `0053_hq_live`, which also adds `hq_missions.desk_prompt_by` and `start_hold_until`).
  - A relayed check-in can't set it.
  - A ping that only says what the chat is doing leaves the chat's check-in time alone, so the 3-hour cut-off for a stuck COO round (`ROUND_MAX_MS`) still counts from real check-ins.
  - The line is cleaned by `liveLineText`: links, emails, keys, long tokens and long numbers (phone or card numbers) are removed, along with control and direction characters. It is one line, at most 140 characters.
- **Limits:** live pings are counted apart (`hq-live:` buckets: 4,000 an hour per key, 6,000 per address), so busy chats can never use up the limit the real reports need. Those keep 600 an hour per key and 1,200 per address: round start and end, claims, "done" and decision cards. A ping over its limit is dropped quietly, since the next one says the same.
- **Which chats can report live:** only chats with just the LifeFlow repository, in the LifeFlow environment, since cloud chats with more than one repository don't run repository hooks. That covers the COO, every desk chat and every task started from HQ. LF Main (Default environment, two repositories) and LF V3 (two repositories) stay relayed by the COO every 2 hours.

### 2. The office shows it live
- **The rule** (`liveNow` in `hq/state.ts`): a chat is working right now while its hooks last said "busy" within `LIVE_WINDOW_MS` (30 minutes; one long command, such as the browser tests, can run about 20 without a new tool call). An archived chat never is.
- **Rooms** (`employeeState`, `buildCard`): a room shows Working while one of its own chats is live (its line is what it's doing), or while one of its missions in progress is tied to a live chat that is a desk task's own chat (no department) or the department's own ("<task>: <what it's doing>"). The COO's chat being busy never makes a mission it filed for another department look worked on.
  - The COO's rounds and the older rule (a mission in progress whose chat checked in recently) still apply, for chats without hooks.
  - An idle or stale chat claims nothing.
- **"Right now"** (`components/hq/right-now.tsx`, `liveItems` in `services/hq.ts`) sits at the top of the Office.
  - It shows one line per live chat, newest first: the department, the task (a mission in progress of that department, or any, for a desk task's own chat), what it's doing, how long ago, and **Watch**, which opens the chat.
  - When nobody is working: "Nobody's working right now. Next: <round> at <time>."
- **Desk files** show their chat's live line.
- **Auto-refresh:** `LiveRefresh` (Office and Work) refreshes the page every 15 s while the tab is visible. It waits while the owner types or picks, or while a dialog is open, and catches up when the tab comes back. These are plain database reads; no AI is called.
  - "Since you last looked" keeps its window for the whole visit.
    - On the first render, `MarkLooked` saves the window it used in a 2-hour `hq_looked_from` cookie. The refreshes, and coming back from another tab, show the same items.
    - Leaving the page writes `hq_last_looked`, so the next visit starts from then.

### 3. Start a desk task from HQ, and stay in HQ
- **One cloud scheduled task, "LifeFlow desk task starter"** (the owner's own; no schedule, a fresh session each run, the LifeFlow environment). Its saved prompt:
  - the run's payload is only "<mission id> <pin>": anything else stops it;
  - otherwise it runs `npx tsx scripts/hq.ts desk <id> --pin <pin>` (`--pin` is required). That reads the task by id (`/api/hq/inbox?mission=<id>`, however long the open list is) and prints its first prompt. It refuses if the task's fingerprint isn't the one the owner approved;
  - it follows that prompt, starting with the claim.

  The prompt comes from HQ, never from the payload, so the fire token alone can't make it do anything else.
- **The owner reads before it starts.** An unattended chat will run the prompt, and agents can write desk files, so:
  - the desk shows the exact first prompt with **Start it** and **Cancel**;
  - a file the team wrote, not the owner, says so: `hq_missions.desk_prompt_by` records who last wrote the prompt or title;
  - the task's fingerprint (`deskPin`) travels with the start. It is the first 16 hex characters of a SHA-256 of the id, title, department and text: what can change outside the code. A release that rewords HQ's own wrapper never breaks a start on its way;
  - HQ refuses if the task changed since the desk was opened, and the new chat refuses if it changed after the tap.
- **HQ** (`startDeskTask` in `services/hq-desk-start.ts`, `startDeskTaskAction` behind `requireAdmin()`)
  - It POSTs `{text: <mission id>}` to the task's API trigger. The URL must be `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`, and the token comes from Vercel's `HQ_DESK_FIRE_URL` and `HQ_DESK_FIRE_TOKEN`. The token is never logged, sent to the browser or shown in an error.
  - It sends the beta header from the docs, has a 15 s timeout and allows at most 10 starts an hour.
  - **One chat per task:** it refuses a task that already has a chat (Open continues it there).
    - A start takes a 10-minute hold on the task (`hq_missions.start_hold_until`, set only if none is running), so a double tap or a second tab can't start it twice.
    - The hold is released when Claude refuses or can't be reached, so a retry works at once. It is kept when the start may have landed (a timeout, or an answer HQ can't read).
    - A start whose chat never said a word for 10 minutes (it stopped before it began) shows "Didn't start. Tap to start it again." (`startStalled`).
    - It never reopens a task that was finished or dropped while the start was on its way.
  - It sets the mission to doing with the returned chat (the owner sets the chat directly; the new chat's claim agrees) and logs `hq.desk_started`. Redirects are refused.
  - Errors are plain: a refused key, too many starts, Claude unreachable.
- **The desk:** when the token is set, a file with no chat starts right there.
  - The MacBook says "Started. It's working in its own chat: watch it here under Right now."
  - "Open in Claude" is there for when the owner wants to talk to it.
  - Without the token, the link works as before (ADR 0029 addendum 2).
- **Usage:** each run uses the owner's subscription like any chat. Claude allows 30 fires an hour per task. No API billing and no paid usage.
- **The owner's one-time set-up** (only the owner can make the token; it is never pasted in a chat):
  1. claude.ai/code/routines → "LifeFlow desk task starter" → Edit.
  2. Set Repositories to LIfeFlow only, so its hooks report live.
  3. Trigger **+** → API → Generate token.
  4. In Vercel → Settings → Environment Variables, add `HQ_DESK_FIRE_URL` (the Fire URL) and `HQ_DESK_FIRE_TOKEN` for Production, then redeploy.

## What this changes in the old rules
- ADR 0024 said HQ "never starts, reads or drives a chat".
  - **Now:** on the owner's tap only, HQ may start a desk task through the owner's own scheduled task's token.
  - **Unchanged:** HQ still never reads a chat's messages, never types into a chat and never uses the owner's claude.ai login.
  - What a chat shares is only its own short live line.
- Replying to a chat still happens in Claude. Every live line has **Watch** for that.

## Open for the owner
- **Who can write desk files:** any chat holding the shared HQ key can add or rewrite a desk file. The confirm step and the fingerprint make sure only what the owner read runs. Per-chat keys would let HQ tell chats apart; that is a later decision.
- **The live line is the agent's own description of its step.** It is cleaned, but a description could still name something from the work (a person's name in a test, a dollar amount). It is shown only to the owner.

## Consequences
- The office tells the truth within about 15 s for every chat with hooks. For the others, the COO's 2-hourly relay stays.
- The live line is the agent's own description of its step. It is cleaned and shown only to the owner, who owns every chat.
- If Claude changes the fire endpoint (a research preview), starting from HQ shows a plain error and the link still works.

## Addendum (owner, 2026-11-07, later): HQ knows what every chat is doing

The owner: "I still don't think HQ is running well … I see myself ending up in the Claude app doing everything myself. It doesn't look like HQ knows what the agents and the chats are doing."

**Why.** The Claude app shows every chat's own record: whether it's working and on what, what it last finished, and what it needs from you. HQ couldn't see it. Live hooks only run in chats with just the LifeFlow repo, in the LifeFlow environment. The chats the owner actually uses (LF Main on the Default environment, LF V3, Marketing and the planning chat, all with two repositories) can't run them. The COO's 2-hourly relay covered only chats mapped to a department.

**Decision: an hourly sync of Claude's own chat list.**
- **The "HQ sync" chat:** `session_01Mhcz6C2smYHWY1gvs4Jt75`, in the LifeFlow environment, with no repository, on Sonnet.
  - A scheduled task, "HQ sync (hourly)" (`trig_01WeCohXn3w1a3yamNv8hNEx`), wakes it every hour from 7:43 AM to 11:43 PM Pacific.
  - It has to be a standing chat: a fresh session started by a scheduled task doesn't get the tool that lists chats. The first try refused rather than post an empty list.
  - It calls `list_sessions` (the owner's chats, newest 50) and posts one `{type:"sessions", sessions:[…]}` report.
  - Each chat carries: id, title, status bucket, archived, `task_summary` (what it's doing), `recent_action` (what it last finished), `needs_action` (what it needs from the owner) and `updated_at`.
  - It posts with `curl` through the proxy that adds the HQ key, so it needs no repository.
- **The server (`recordSessionSync`)**
  - A chat HQ doesn't know is added only while active: working, blocked or ready for a look.
  - "Working" becomes a `relayed` live line. `liveNow` holds it for `RELAY_WINDOW_MS` (75 minutes, until the next sync is due); a chat's own hook line wins while fresh.
  - The status, the last thing it finished (`summary`) and `needsAction` are copied. The COO's chat keeps its own status and summary, since its rounds use them.
  - A department, a main chat and the owner's title for a chat are never changed. Archived chats wait on nothing.
  - All text is the chats' own words, cleaned by `liveLineText`, shown only to the owner and never treated as instructions.
- **The office**
  - "Right now" lists synced chats too, marked "checked … ago".
  - New **"Waiting on you"** (`waitingItems`) lists every chat that says it needs the owner, for example "Approve or deny the plan" or "Top up credits", with **Open** straight into that chat.
  - Rooms already showed these as door notes.

**What it can't do:** HQ still can't read or type into a chat (Claude doesn't let a website do that). Replying happens in Claude, one tap away. Synced chats are up to an hour old; chats with their own hooks (desk tasks, tasks started from HQ, the COO) are live to within seconds.
