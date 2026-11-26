# The right question, and getting it done (owner, 2026-11-26)

Owner: "make sure the quality of the question sets us different from other apps, like how we ask and how the user
responds as well with the options ... what does a user need to hear after his shift? or class or action he did."
And on acting alone: "by request, because blocking the time on the timeline is nothing next to real life, our goal in
the app is to get the user to actually do that task or assignment."

Status: a proposal for the owner's yes. Nothing here is built beyond what `claude/adhd-six` already has (one question after
a star, off in production until the crisis path and the SB 243 read).

## What a person needs to hear after something ends

Every other app asks "How are you feeling?" and does nothing with the answer. Ours does three things, in this order, in
about three short lines:

1. **Seen.** Name the real thing, plainly: "Four hours at Target, done." "Bio 101, done. That was the third class today."
   Never generic praise ("Great job!"), never a score.
2. **Off your plate.** Say what that frees up, from their own sky: "Nothing else is due tonight." "You're free until Calc
   at 10 tomorrow." If something is still due, say only the next one and its time.
3. **One question, with answers that change something.** Asked only when the answer will be used.

## The question: specific, one tap, and every answer does something

The answers aren't a mood scale. Each one is a real next step the skyling takes, said plainly before they tap.

- **After a shift:** "How's your energy after that one?"
  - **Running on empty**: tonight goes light (coaching nudges wait), and if a study block is on tonight, it offers to move
    it to the morning, with Undo.
  - **Okay**: nothing changes. "Plan stays as is."
  - **Still got some in me**: offers to pull one small thing forward ("Want to knock out the 20-minute reading now?").
- **After a class:** "How did Bio land?"
  - **Got it**: a star, nothing else.
  - **Half lost**: offers a 20-minute review before the next Bio, in free time it looked up.
  - **Missed it**: no question why. "Want a to-do to grab the notes?"
- **After an exam:** "Midterm's done. How do you feel about it?"
  - **Good**: the sun, if it was earned.
  - **Not sure**: "Done is done. Next up is ... at ..." (no dwelling).
  - **Rough**: tonight goes light, and the next study block before that class's next exam is offered, never scheduled
    on its own.
- **After a focus session or a finished to-do:** no question. Just the star and one line of what's next or "You're free."

### How they answer (ours, not a survey)

- **The skyling's own faces as the buttons.** Three small pixel faces of their skyling (drawn in code like the cast), each
  with a two-word label. Tapping one plays that face's reaction on the sky. It feels like answering a friend, not a form.
- **"Worth remembering?"** under the faces: one line of their own words, kept as a moment on their Done timeline (only
  because they wrote it). This is the "anything interesting at work" from 2026-11-22, without a chat window.
- **Skip is free.** "Not now" is always there, a skip is never read as a mood, and the same kind isn't asked again that
  day.

## Why they come back: the answers become useful

After a few weeks, the skyling says what it learned, from their own answers only, once a week at most, with a fix:

- "Your Tuesday closing shifts are the ones that leave you on empty (3 of the last 4). Keep Tuesday nights free from now on?"
- "Bio lands better when you've done the reading. Want the reading moved to the night before?"

Shown in "What <skyling> knows", deletable, never shared, never a diagnosis. This is what no generic check-in app can do:
the question is about a real thing, the answer changes tonight, and over time it changes their week.

## Getting it done, not just on the timeline (decision 3: by request)

The skyling books time only when asked (the default stays off). What matters is that the thing gets done:

1. **At the block's start:** one push, "Your Bio reading block starts now." The tap opens "Start it" (the focus screen with
   one small first step), not the calendar.
2. **When the block ends:** "Did you get to the Bio reading?"
   - **Done**: ticks it, with its star.
   - **Partway**: "Nice start. Next free 30 minutes is Thu at 4. Put the rest there?"
   - **Didn't happen**: "No problem. Back on track finds it a new time." (one tap, Undo).
3. **Never** a second nag, never in quiet hours, never guilt words. It counts toward the star only when they say it's done.

## Decision 4: no focus setting

The helps are the defaults for everyone (short first step, the heads-up, Back on track, calm reminders); a person who
doesn't want one turns that one off where it lives (the heads-up in Notifications). No ADHD mode, no extra screen to find.

## Rules carried over

At most one question a day, only right after a real moment from their own sky, never a push, 18+ for anything about how
they feel until the lawyer's read, nothing about the feeling stored except what they chose to write, a crisis path in our
own code before any feelings question goes live.
