<!-- Approved by the owner on 2026-11-06 in the HQ setup chat. Phase 1 starts after "goodnight". -->

# LifeFlow HQ: Phase 0 findings and Phase 1 plan

## Context
You want one private, cozy HQ where your five "employees" show real status, your four real Claude Code chats open in one tap, and missions, approvals and admin live in one place. It must cost no AI just for being open, and it must never put your chats or branches at risk. Phase 0 (inspection) is done. Everything below comes from the repo, your session records and the connected tools, not from guesses.

Read for this plan:
- `CLAUDE.md`
- `docs/team.md`, both on main and the newer copy on `claude/pensive-mendel-r1yy4a`, which has the "no background agents while the owner is awake" rules and the goodnight / good morning phrases
- `docs/vision.md` section 15
- `docs/playbook.md`
- ADR 0022 (admin)
- `docs/marketing/PLAYBOOK.md`
- LF V3's handover file `docs/hq/handover-from-product-chat.md`

## Your answers (2026-11-06)
- **V3 rule:** only V3 design and new-surface code needs your yes before reaching main. Verified bug fixes from the LF V3 chat keep going to main, as now.
- **Save work now:** when you approve this plan, I message LF V3 once to push `fix-gmail-items` and `fix-search` to GitHub, nothing else. Today those branches exist only inside its cloud machine.
- **Picture rule:** I build tonight on a branch. In the morning you get phone and desktop screenshots, light and dark. Nothing goes live or reaches main until you say yes.
- **Tonight:** only the HQ build runs. "Goodnight" here does not start a night round. Sunday, Tuesday and Thursday rounds stay as they are.

## What Phase 0 found
1. **The four chats are real and resumable.** Each opens at `https://claude.ai/code/<session id>` in the browser or the Claude app.

   | Chat | Session | Branch | Status |
   |---|---|---|---|
   | LF Main | `session_014H9m2SQ58sgx7ZG8Ntv7Zx` | (none recorded) | Sonnet. Last work: App Store copy. |
   | LF V3, the product chat | `session_01Mhcz6Ao4XdmNh3eAPYd3QN` | `claude/pensive-mendel-r1yy4a` | Some of its work isn't on main yet. |
   | LF V3 — Agents | `session_01Mhcz6BYyF8TLLXwBiWcWyk` | `claude/nightly-audits` | Child of LF V3. Titled "LF Managing Agents". Owns the night round and research scheduled tasks; the hourly one is paused. |
   | LF Marketing | `session_01Mhcz6CyarVMRum5SxqLMqM` | `claude/lifeflow-ad-reel-higgsfield-s3r3v1` | Titled "Marketing LF". **Blocked:** Higgsfield has 0.37 credits. |

2. **HQ can't embed or drive these chats.** There is no supported way for a website to read or continue subscription Claude Code chats. Doing it would mean using your claude.ai login, which I won't do. What is supported:
   - links that open the real chat;
   - the chats reporting their own status to HQ (see the architecture).
3. **Admin already exists and works on phones.** `/admin` is owner-only through `requireAdmin()`, two-step sign-in or a passkey, and a 404 for everyone else. It has Overview, Users, Feedback, Announcements, Growth, Errors, Health and an Activity log. HQ reuses it and doesn't rebuild it.
4. **Weekly usage can be measured.** For Max plans, Claude Code's status line gets `rate_limits.seven_day.used_percentage` and `five_hour`. The session records also show `isUsingOverage`, which is false everywhere today. I still need to confirm that the status line runs in cloud sessions.
5. **Connections:**
   - Metricool has one brand with only Instagram @lifeflowweb connected. Its tools here can schedule posts (including "for review"), read analytics and suggest best times. None of them read comments or DMs.
   - Higgsfield is on the Ultra plan and can publish to TikTok.
   - ElevenLabs isn't connected in this environment.
6. **No HQ image found** in your artifacts or the repo. If you have the approved concept, attach it before goodnight. Otherwise I'll work from your written description.

## 1. Recommended architecture
- **HQ lives inside the app at `/admin/hq`.** It uses the same `requireAdmin()` gate on every page and every action, and is `noindex` and `no-store`. Founder Office is your existing `/admin`, unchanged. HQ adds one item to `AdminNav`.
- **HQ uses no AI.** Pages are server-rendered reads from Postgres. Characters are inline SVG with CSS animation that respects reduced motion. The HQ Assistant is plain app logic, and the weekly summary is assembled from records.
- **Five small tables** for owner operations, unprotected by row-level security like `admin_actions`: `hq_missions`, `hq_approvals`, `hq_activity` (append-only log), `hq_checkins` (chat snapshots) and `hq_keys` (stored as hashes). They are reached only through `services/hq.ts`, and never hold app users' content.
- **Chats report in; HQ never calls out.**
  - A Stop hook (`.claude/hooks/hq-checkin.sh`) runs after every turn in any chat on this repo. With no AI, it sends:
    - the session id (from `CLAUDE_CODE_REMOTE_SDK_URL`);
    - the branch and last commit;
    - the time;
    - the usage meter when it's available.

    It never sends message text. It does nothing when HQ isn't configured, and it never blocks a turn.
  - Rounds use `scripts/hq.ts` (subcommands `mission`, `approval`, `checkin`, `inbox`, `import`). Being one command keeps it cheap and consistent.
- **The API** is two routes, both public in `proxy.ts`:
  - `POST /api/hq/report` and `GET /api/hq/inbox`.
  - Both need an `lfq_` key, stored as a hash like the Apple Health keys. They are rate-limited, checked with zod and capped at 64 KB.
  - You create the key in HQ Settings and save it as a network secret on the cloud environment. The proxy adds it to requests, so it never appears in the repo or a chat.
- **Talking to an employee:**
  - "Open chat" opens the real session.
  - "Copy and open" copies a mission's instruction, then opens the chat for you to paste.
  - Missions created in HQ are picked up at the next round through `hq.ts inbox`.

## 2. How each chat connects
| Employee | Main chat | Also shows |
|---|---|---|
| Developer | LF Main | Night-round fixes, tagged "done in the night round (LF V3 — Agents)" |
| Designer / V3 | LF V3 | The prototype artifacts waiting for your pick |
| Researcher / Agent Ops | LF V3 — Agents | Its 3 scheduled tasks, audits, research reports |
| Marketing & Growth | LF Marketing | Metricool and Higgsfield status; credits blocker shown plainly |
| HQ Assistant | none (app logic) | Needs you, deadlines, weekly summary |

All four histories, ids, branches and instructions stay as they are. HQ only stores links and snapshots.

**Cost protection:** LF Main and LF V3 are 82–84% full (817k and 837k tokens), so every message there re-reads about 800k tokens. Automation never runs in those two.

## 3. Simple HQ layout
```
Phone (393 px)                          Desktop
┌──────────────────────────┐            ┌────────┬─────────────────────────┬──────────────┐
│ HQ    [Office|Workspace] │            │ Admin  │  Cozy office (SVG):     │ Needs you (3)│
│ "2 things need you."     │            │ nav    │  5 desks, lamps, plants │ approvals    │
│ ┌──────────────────────┐ │            │  HQ ●  │  each character + chip  │──────────────│
│ │ cozy office scene,   │ │            │  ...   │  (Working / Zzz / ! /   │ Doing now    │
│ │ 5 desks, tap a person│ │            │        │   Done / Blocked /      │ missions     │
│ └──────────────────────┘ │            │        │   Offline)              │              │
│ Needs you: 2 cards       │            └────────┴─────────────────────────┴──────────────┘
│ Doing now: 1 line each   │
└──────────────────────────┘
```
- **Workspace view** (same data): five rows, each with a status line, current mission and "Open chat", then missions and approvals.
- **Employee page:**
  - the chat card (title, branch, last check-in, "Open chat");
  - current, waiting and done missions;
  - recent activity;
  - results and links;
  - their approvals.

  No animated character there.
- **Other pages:**
  - Missions: columns on desktop, grouped one-line items on phones.
  - Approvals: each card shows what, why, from whom and links, with Yes, No or Changes plus a note.
  - Reports: this week, from records.
  - Settings: keys, chat links, usage targets, connections.
  - Marketing: comes in Phase 3, so there is no empty page now.

**How status is worked out (one tested function):**
1. **Offline:** no check-in for 7 days, or the chat is archived.
2. **Blocked:** shows the reason.
3. **Needs you:** an approval is pending.
4. **Working:** a mission is in progress and the chat checked in within 20 minutes.
5. **Done:** a mission finished in the last 24 hours that you haven't seen.
6. **Sleeping:** everything else.

Every status line says "as of [time]". HQ never invents activity.

## 4. Employee to workflow mapping
- **Running AI workers: no new ones.** The existing LF V3 — Agents chat stays the only automation runner: night rounds Sunday, Tuesday and Thursday, research on Monday, Sonnet by default, at most two agents at once. You can work directly in the other chats any time.
- **Approvals you set:** deploys, V3 merges, features, design changes, publishing, outbound messages, paid ads, subscriptions, destructive actions and security changes all become `hq_approvals`. Your yes or no is recorded and is never carried out by HQ itself. The agent acts on it at its next round.

## 5. Expected costs and limits
- **HQ itself:** $0 of AI. It runs on your existing Vercel and Postgres, with no new services or subscriptions.
- **Weekly usage budget:** aim for 35–40% for autonomous work, never more than 50%.
  - Engineering and research: 25%.
  - Marketing: 15%.
  - Reserve: 10%.
- **How the round enforces it:**
  - It records the weekly percentage at the start and end of each round and sends the difference to HQ.
  - No new agent starts once rounds have used 40% this week. Everything stops at 50%.
  - It skips if overage is ever on.
  - If the meter isn't available, it does light work only and asks you in Approvals.
- **This is not a true hard cap.** A step already running finishes. The meter counts your whole account, including your own chats. It only updates after replies.
- **Chat costs so far.** These are API-price estimates from the session records, not a bill: LF Main about $559, LF V3 about $561, LF Marketing about $313, Agents about $3.
- **Limits:**
  - Chats can't be shown or driven inside HQ.
  - Status is as of the last check-in.
  - Comments and DMs aren't possible with the current connections.
  - TikTok, YouTube, Facebook and LinkedIn aren't connected in Metricool.
  - Marketing is blocked until Higgsfield credits are topped up (your paid call).
  - I can't see Claude API credits from here; check console.anthropic.com. Those credits wouldn't run these subscription chats unless billing were switched, which I won't do.

## 6. Phase 1 plan (on branch `claude/sharp-lovelace-8fr6z5`)
**When you approve:**
1. Save your prompt word for word to `docs/hq/brief.md`.
2. Message LF V3 once to push its two local branches.

**After "goodnight":** builders are Sonnet, at most two at once, with one Opus security review for the key and the admin actions. Each step stops at about 40% of a 5-hour window and leaves a carry-over.

1. **Spec and ADR.** Add `docs/adr/0024-lifeflow-hq.md`, plus HQ rules in `CLAUDE.md` and a row in `docs/team.md`.
2. **Data.**
   - Add the 5 tables to the schema, then run `npm run db:generate`. Check the order of the drizzle journal's `when` values.
   - Add `services/hq.ts`: missions, approvals, activity, check-ins, `employeeState()` and `weeklySummary()`. Everything stays sequential inside transactions (`series()`).
   - Tests come first.
3. **Key and API.**
   - Add `lfq_` keys (create, revoke, stored as hashes) and the two `/api/hq` routes, public in `proxy.ts`.
   - Add `scripts/hq.ts`.
   - Integration tests cover a wrong key (401), too large (413), a non-admin (404 on every page and action) and an approval being logged.
4. **Check-in.**
   - Add the Stop hook and a status line script that saves `rate_limits` to a local file, wired in `.claude/settings.json`.
   - Confirm it runs in a cloud session.
5. **UI.**
   - Pages: `/admin/hq` (Office and Workspace views), `/admin/hq/[role]`, `missions`, `approvals`, `reports` and `settings`, all with actions in `actions.ts`.
   - Components: `src/components/hq/*` (SVG office and characters, status chips), using existing tokens, glass cards, `bg-hero` and both themes. Sizes are in rem.
   - Navigation: an "HQ" item in `AdminNav`.
6. **Real data.** Add `docs/hq/seed.json` from the handover: 4 open-work missions, 6 waiting approvals with their artifact links, and the 4 chat links. Load it with `hq.ts import`.
7. **Check and review.**
   - `npm run check`, `npm run build` and the e2e test `tests/e2e/hq.spec.ts`. The e2e covers:
     - the admin sees the office;
     - switching views;
     - creating and finishing a mission;
     - an approval;
     - a non-admin getting a 404;
     - 393 px with no sideways scroll and no overlap at Extra large text;
     - axe.
   - Then a review against the code-reviewer and security checklists.
8. **Morning report.** Screenshots at phone and desktop, light and dark, plus what's done, what's carried over and the usage used. Nothing deployed, nothing on main.

**Later phases, each after your yes:**
- **Phase 2:** the night round posts missions and approvals through `hq.ts`, and one real fix shows end to end.
- **Phase 3:** Marketing page, with one research-to-draft flow saved as an approval.
- **Phase 4:** scheduling through Metricool "for review" and any new connections.
- **Phase 5:** tuning based on what we see.

## Verification
- Run the gates above. The e2e runs at 393 px and on desktop, in light and dark.
- A real check-in from this cloud session appears in HQ.
- A non-admin and a signed-out visitor both get a 404.
- Opening HQ makes no AI calls: there are no OpenAI or Anthropic requests in server logs or `jarvis_runs`.
- `git log` on main and on LF V3's branch is untouched.

## Design reference (added 2026-11-06, the owner's concept image)
`docs/hq/concept.webp`. What Phase 1 takes from it:
- **Layout:**
  - a left menu with HQ first;
  - "Good evening" with the status counts (working, waiting, asleep);
  - three tiles: Needs your approval, Done this week and Weekly AI budget against the 50% ceiling;
  - the office scene in the middle;
  - Approvals cards on the right, each with Review and Later;
  - Recent activity on the right;
  - this week's missions along the bottom;
  - on phones, all of it stacks into one column.
- **Look:**
  - a two-floor cutaway with a desk room per person upstairs and beds downstairs;
  - a lounge, warm lamps, plants and the eucalyptus green in dark and light themes;
  - each room has a name plate and a status chip.

What changes, so it stays true to the brief and the plan:
- **Five rooms, not six:** Developer, Designer / V3, Researcher, Marketing and HQ Assistant (the concept's "Chief of Staff"). Community and Business Ops are tools of Marketing, not separate people (brief section 2).
- **Only real data.**
  - The concept's numbers, the "Simulated usage" label, the tasks on the screens and the comments and DMs replied to are examples only.
  - HQ shows real records or a plain empty line.
  - The budget tile shows the measured weekly share once check-ins send it, and "not measured yet" before then.
- **Drawn, not rendered.** The scene is lightweight SVG and CSS in the concept's spirit (flatter, simpler figures), so it costs nothing to run and every state is real. Painted, rendered art like the concept would need generated images, which cost credits, so that is the owner's call later.
- **Menu items appear only when they work:**
  - "Inbox" is the Approvals inbox;
  - "Calendar" waits for Phase 3 (marketing);
  - "Agents" is the conversations list;
  - the "Autonomous mode" switch waits for Phase 2, when rounds read it.

## The founder's room (owner, 2026-11-06)
The owner asked for their own room in the office, with themselves drawn as a character in the same style as the team. The owner's photo is used only as a reference for the character's features and is kept out of the repo.
- **The character, drawn in the same cute style as the team:**
  - big, tousled dark-brown curly hair falling over the forehead;
  - light blue eyes and fair skin;
  - black rectangular sunglasses with small silver details at the hinges, worn pulled down the nose so the eyes show over them (their signature look);
  - a charcoal grey quarter-zip sweater over a white T-shirt.
- **The room:** a corner office at the top of the building with a big window, a desk, a lamp, a plant and a mug. It reads as the room where the decisions happen.
- **Real data only.** You are the one looking, so you're at your desk. Next to you is a small stack of cards for the approvals waiting, using the real count. There's no stack when nothing is waiting.
- **Tapping yourself** opens your Founder Office: the Approvals inbox at the top, then your existing admin (Overview, Users, Feedback, Growth, Errors, Health, Activity), unchanged.
- **The office has six rooms in total:** yours plus the five employees'. Each employee room holds both a desk and a bed or couch, so a person is either at the desk or resting in the same room. The lounge stays on the ground floor.
- **Door tag (owner, 2026-11-06):** a small brass plate on the founder's door that reads "I'M THE CEO, BITCH". HQ is owner-only, so no app user ever sees it.
- **Updated (owner, 2026-11-06, second photo):** the founder is drawn without sunglasses: dense dark curls with a fringe above thick dark brows, blue-grey eyes, a fuller face, a navy polo with a collar, two buttons and a small colourful chest print. The photos stay out of the repo.
- **Updated again (owner: "make me look like the cool CEO", a bit more):** sunglasses pushed up on the curls, a confident half-smile with one brow raised, an open charcoal blazer over the navy polo with a small green pocket square, and a tall leather executive chair.
- **Updated (owner, third photo: "use these glasses"):** browline glasses (thick matte-black top bar, thin metal rims, silver bridge) worn on the eyes instead of sunglasses on the head; the curls get a little volume at the sides like the photo.
