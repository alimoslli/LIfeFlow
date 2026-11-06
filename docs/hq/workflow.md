# How the team works with HQ (Phase 2)

Owner, 2026-11-06: "the best digital HQ ever with the best agent loadout and workflow", and HQ must show real progress and change. This is the loadout and the steps every automated round follows. It sits on top of `docs/team.md` (cost rules, the owner's hours, approvals), which still decides.

## The loadout: the smallest team that does the job
| HQ employee | What runs | AI? |
|---|---|---|
| **Researcher / Agent Ops** | The only automation runner: the LF V3 — Agents chat, which runs every scheduled round. | Yes, only in rounds |
| **Developer** | Night-round fixes, made by Sonnet builders the runner starts, plus LF Main when the owner works there. | Only in rounds |
| **Designer / V3** | LF V3, the owner's product chat. No automation. | Only when the owner works there |
| **Marketing** | LF Marketing. A weekly marketing round comes in Phase 3, after the owner's yes. | Not yet |
| **HQ Assistant** | App logic: approvals, deadlines, the weekly summary. | Never |

**Specialists, started inside a round only, at most two at a time, Sonnet by default:**
- **auditor**
- **builder:** in its own worktree, with its own test database
- **reviewer:** Opus only when the change touches money, security or a data migration
- **situation writer**
- **market researcher**

No permanent extra agents. No new paid services.

## The week (the owner's brief, section 6, on the existing schedule)
| When (3 AM Pacific) | Round | Focus |
|---|---|---|
| Sunday | Night round | A targeted audit and regression tests, then fixes |
| Monday | Research | Competitors, real complaints, new integrations; reuse past findings |
| Tuesday | Night round | Fix the highest-priority confirmed problems |
| Thursday | Night round | Integration health and selected improvements |

**Priority order for fixes:**
1. Security and data integrity.
2. Crashes and broken flows.
3. Money accuracy and Plaid.
4. The assistant's reliability.
5. Integrations.
6. Speed.
7. How it feels to use.
8. Small UI.

One meaningful fix beats several small ones. Deterministic tests come before AI reviews.

## Every round, step by step
HQ is a mirror, never a blocker. If `HQ_URL` isn't set or a command fails, carry on and say so in the report. The commands are `npx tsx scripts/hq.ts …`, run from the LifeFlow repo after merging `origin/main` (that's where the script and hook live).

1. **Start.**
   - Run `checkin --status working --phase round_start --summary "<round> started"`.
   - Then run `inbox`. It returns the owner's open missions and the decisions made since the last round:
     - a **yes** means do it;
     - a **no** means drop it and mark the mission `dropped`;
     - **changes** means follow the owner's note.
2. **Usage gate** (before every new agent). Read this session's `get_session` → `external_metadata.rate_limit_info`:
   - if `isUsingOverage` is true, stop now;
   - if `status` is `allowed_warning`, finish the current step, save the carry-over and stop;
   - otherwise apply `docs/team.md`: stop at about 40% of the 5-hour window.

   Never turn on extra usage.
3. **Every piece of work is a mission.**
   - Create it: `mission add --role developer --title "…" --priority high`. Or reuse the owner's mission from the inbox.
   - When you start: `mission update <id> --status doing --progress "…"`.
   - Fixes belong to the Developer, audits and research to the Researcher, situations to the Researcher.
4. **Show the work as it happens.**
   - After each step, run `checkin --status working --summary "<one line: what is happening now>"`.
   - A check-in older than 20 minutes reads as resting, so keep them coming during long steps.
5. **Anything that needs the owner** becomes an approval: `approval --role <who> --kind <deploy|feature|design|publish|outbound|paid|subscription|destructive|security|v3_merge|other> --title "…" --summary "…" --link "Preview=https://…"`.
   - This pushes the owner's phone.
   - Small fixes and bugs stay approved in advance (`docs/team.md`), so they don't need one.
6. **Results.**
   - Finished: `mission update <id> --status done --result "<what changed, plainly>" --link "Commit=https://github.com/alimoslli/LIfeFlow/commit/<sha>"`.
   - Stuck: `--status blocked --blocked "<why>"`.
7. **End.**
   - Run `checkin --status idle --phase round_end --summary "<N fixed, M found, K waiting for you>"`.
   - Then `activity --role researcher --text "Morning report: …" --link <the report's GitHub link>`.

## What the owner sees
- **During a round:** the Researcher at the desk, and the Developer working on the mission being fixed, shown as "in LF V3 — Agents".
- **Afterwards:** missions moving to Done with results and commit links; approvals waiting in the inbox, with a push; the activity feed; the weekly summary.
- **Between rounds:** everyone asleep, which is the truth.

## Turning it on (status)
- [x] HQ merged to main (2026-11-06, `df6a462`). Vercel deploys lifeflowweb.com; the owner's first look confirms it.
- [ ] HQ Settings: "Import the starting list", then create a key named "cloud environment".
- [ ] Save `HQ_URL` and the key on the cloud environment. The owner closed the key form on 2026-11-06. To add it by hand: open the environment menu, choose Edit, then Network secrets, and add one for lifeflowweb.com with the Authorization header set to `Bearer lfq_…`. Until then, rounds carry on and say HQ isn't connected.
- [x] Night round and research tasks point at this file (2026-11-06; blocks in `docs/hq/round-prompts.md`, applied by the LF V3 — Agents chat, checked with get_trigger).
- [ ] LF Main's environment gets the same two settings.
- [ ] Phase 3: a weekly marketing round, after the owner's yes.
