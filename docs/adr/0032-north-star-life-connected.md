# ADR 0032: The north star, your life connected on one screen (proposed)

**Status:** proposed, waiting for the owner's confirmation. The owner's words were relayed by the Marketing session on 2026-11-08 ("send this to whoever's building the app, make them know this is how the app is supposed to work"). They are recorded here as given. They become decided when the owner confirms them, and then go into `docs/plan-v2.md` and `docs/vision.md`.

## The direction, in the owner's words (as relayed)
1. **Not another AI assistant.** LifeFlow doesn't compete with ChatGPT, Claude or "Jarvis"-style assistants, and should never feel like one. Nobody should be able to ask "why not just use ChatGPT?"
2. **Its own category: your life, connected, on one screen.** Classes, shifts, money, health and plans are shown together, so a person sees how each choice affects the rest. Things you do don't only affect that moment.
3. **The core job is the tiny everyday decisions, before they happen.**
   - The example: at work, one tap (an Apple Watch someday) shows "two assignments due tonight". So you know not to go out for food with friends after work.
   - Going out means more money spent, more calories and less time to study for the exam. The app makes that trade-off visible in the moment.
4. **It proves this by how it works, not by words.** The connections must be real, visible and glanceable: Today, notifications, a widget, and a watch glance later.
5. **Useful with no AI at all.** "I only see this app succeeding if there was no AI API in it."
   - Show the information so clearly that a smart person catches it themselves.
   - The assistant stays, because it's what makes the app new, but as a layer on top. It explains the trade-off and, when the person wants, acts on it: blocks study time, moves money, sets a reminder.
6. **A friend, not a robot.** Short, warm, never preachy.
7. **"It's just an app in the end. It has to be useful."** Every screen earns its place.

## What already follows it (branch `v3-day-clock`)
- **The day clock is the home** (`docs/design/clock/spec.md`). It joins calendars, shifts, deadlines and exams, to-dos, steps and sleep, and, with the Money lock open, bills and today's spending, all on one face.
- **No AI draws it.** Every mark, tile and number comes from the person's own data through services.
- **The assistant is one line under the clock**, from rule-based insights rather than a model, plus a way to ask. It isn't the home.

## What would follow (proposals for the owner; nothing built until he says yes)
- **"Tonight" on the clock.** Late in the day, the face and tiles show tonight's real load: what's due tonight, the shift or class still ahead, the study time left before the usual bedtime, and the money left this week. That's the "two assignments due tonight" glance, from data alone.
- **"What this costs" on a plan.** Tap a free evening slot, or an event like "Dinner with friends", and see what it takes from the rest of the night: the study time left before the exam, its likely cost from what that place or kind of outing usually costs the person, and later steps and calories. Facts only, never a verdict. The assistant can then offer to move study time or set a reminder.
- **Connections on the timeline without the assistant.** A quiet link between an exam and the study blocks before it, or a bill and the paycheck that covers it, drawn on the line itself.
- **A glanceable "tonight" summary** for a home-screen widget and, later, a watch. This needs the native app shell, which is a separate decision.
- **Voice:** an audit of the app's words against "a friend, not a robot", in short sentences and never preachy, with notifications first.

## Consequences
- **The test for new features:** does it show the person their connected life more clearly, or help with a decision before it happens, without needing the assistant?
- **Marketing** shows only what ships, so the relaunch film's proof scenes depend on the proposals above being real.
