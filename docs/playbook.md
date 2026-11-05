# LifeFlow Playbook (working copy for Claude Code)

The owner's full playbook (product, brand, voice, approved copy) is the artifact https://claude.ai/artifact/Xngzg4E3JKBE6fEvVrTpA8. This file is the part every coding session must follow. Keep both in sync when either changes.

## Every change: the loop
1. **Listen:** feedback inbox, error alerts, admin overview, the owner's messages.
2. **Pick:** rank by people affected, how much it hurts, and how small the fix is. Trust-losing bugs first.
3. **Define done** before code: behaviour, edge cases, out of scope.
4. **Build small:** steps that each end working and tested.
5. **Verify:** `npm run check`, `npx next build`, e2e; then look at 393 px, light and dark, extra-large text.
6. **Review:** bugs, security, copy.
7. **Ship:** push to main (Vercel deploys and migrates), then check the live site when reachable.
8. **Measure:** errors, complaints and assistant mistakes should go down.

## Definition of done (all ten)
1. Does exactly what was asked; nothing else changed (no unrequested wording, layout or feature edits).
2. Phone first: 393 px, no sideways scroll, 44 px targets, extra-large text.
3. True numbers and claims: cents, user time zone, nothing reported done before it is.
4. Private: RLS on every user table, secrets server-side, no personal content in logs.
5. The assistant can do it too, and its result shows in the app at once.
6. Tests at every layer for the new path and edge cases; all green.
7. Words follow the voice: plain, short, no em dashes, no tech talk, one clear action.
8. Accessible: real controls and labels, visible focus, 4.5:1 contrast, reduced motion.
9. Fast: no new load wait, limits on lists, timeouts on slow calls.
10. Recorded: ADR for big decisions; CLAUDE.md updated for the next session.

## Red lines (never ship)
Fake success · invented data or sample data in a real account · moving money or trading · doing graded work · weaker privacy · training on user data without explicit opt-in.

Added 2026-11-05 from research on why people quit the apps they use (`docs/research/2026-11-05-what-people-love-and-hate.md`): surprise billing (a sliding price, core features moved behind a new tier, a charge after a cancel, a renewal with no warning) · more than one push a day by default, or a push that doesn't say why · losing a person's data (every record exportable in one tap) · a redesign that loses simplicity · asking for every connection before it helps.

## Voice reminders
Retired phrases: "calm place", "chief of staff", "for students who juggle". Tagline: "Your whole life, in flow." Public copy says "your personal assistant"; in the app the user names their assistant, and until they do it is "your assistant". Never "Jarvis" in anything a user sees. LifeFlow is for anyone with a busy life; students are the first audience for ads.

## Training the assistant
We improve the system around the model, never the model. No fine-tuning; user data is never used for training without explicit, informed opt-in (and then only with personal details removed and proof on the test set).

### Six levers (fix the cause, not the symptom)
| Lever | Where | Fix it when |
|---|---|---|
| Instructions | `src/server/jarvis/prompt.ts` (bump `PROMPT_VERSION`) | It behaves wrongly everywhere |
| Skills | `skills/<name>/SKILL.md` + `evals.json`, `npm run skills` | One kind of request goes badly |
| Tools | `src/server/jarvis/tools/*` | It can't do something or reads the wrong data |
| Memory | `services/memory.ts`, `jarvis/memory-retrieval.ts` | It forgets or brings up irrelevant things |
| Tests | `tests/fixtures/jarvis-eval.ts`, integrity, memory-retrieval, isolation | Always: every fix adds a test |
| Feedback | answer ratings, `jarvis_runs` metrics | Tells us where to look |

### The training loop (for every real failure)
1. Catch it (thumbs-down, tester, error alert, owner).
2. Write the failure report: asked / did / should have / type / how often.
3. Add a failing test case first.
4. Find the lever; make the smallest fix that removes the cause.
5. Run everything: new test passes, nothing old breaks.
6. Version instruction changes (`PROMPT_VERSION`).
7. Ship, then retry the original question live when possible.
8. Watch that failure type for a week; log the result.

### Scorecard for each test case
Correct (from real data) · Grounded (every fact from a tool result) · Efficient (fewest tool calls, within budget) · Safe (asks first; honest about outcomes) · Clear (answer first, short, one next step) · In character (warm, plain, no em dashes, coaches instead of doing graded work).

### Targets (testing phase)
Golden questions 100% before every release (grow from 10 toward 50, one tricky case per skill) · integrity ≥90% caught, ≤5% false alarms · memory recall test green · thumbs-down under 10% and falling · tool errors under 2% · first word under 2 s · AI cost within the $4/month testing cap.

### Stress tests after any change to instructions, tools or memory
Hidden instructions in emails/notes/photos · graded work requests · provider failures (no false success) · wrong file type (schedule photo never becomes money) · another user's data · secrets · vague asks · money edge cases (pay not landed, bill not posted, the 1st).
