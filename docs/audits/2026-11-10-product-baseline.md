# Product baseline before the excellence program (2026-11-10)

Measured by the COO on main at `2f15326`, production build on a local database, as a brand-new student ("Maya"), on a
390 x 844 phone and a 1440 x 900 laptop, with the real AI model (gpt-5.5). The same walk and the same questions are
repeated after the program for the before-and-after comparison. Scripts: the COO's scratchpad (`assess/`), not kept in the repo.

## The numbers

| What | Before |
|---|---|
| Screens before a new person can use the app | 4 welcome steps, then an 8-step tour |
| Places to learn | 4 tabs holding 16 sub-pages (6 + 4 + 3 + 3), about 45 screens in all |
| Ways into the chat | 3 (the tab, the floating button, the bar on Today) |
| Where notifications can be turned on | Settings › Notifications › This device only |
| The job that sends reminders | once a day, 15:37 UTC |
| Screen load, local (live is slower) | 80 to 370 ms; first load 338 KB of script |
| AI answer time, everyday questions | 3 to 6 s (first words 0.8 to 5.3 s) |
| AI answer time, a whole week told in one sentence | 21.3 s, 4 model steps, 8 tool calls |
| Text sent to the AI per answer | 22,000 to 38,000 tokens in (40 to 80% reused from cache), 130 to 430 out |
| Text sent for the one-sentence week | 68,000 tokens in, 1,841 out |
| Words on the busiest screens | Updates 490, Ideas 451, Calendar 373, Goals 292 |

## The eight AI questions (same account, same data)

| Question | Time | Steps | Tools | Tokens in | Reused | Out |
|---|---|---|---|---|---|---|
| The whole week in one sentence (classes, shifts, exam, essay) | 21.3 s | 4 | 8 | 67,984 | 47,616 | 1,841 |
| "Help me sort it out" (class overlaps work), from Today's card | 3.9 s | 2 | 1 | 25,539 | 15,360 | 163 |
| What do I need to get done today? | 3.0 s | 2 | 1 | 22,093 | 13,312 | 139 |
| Can I afford to spend $60 this weekend? | 6.4 s | 2 | 2 | 28,909 | 16,384 | 427 |
| Plan my week | 3.4 s | 2 | 1 | 30,314 | 24,576 | 127 |
| Find me 2 hours to study for my BIO exam before Thursday | 3.3 s | 2 | 1 | 38,547 | 24,576 | 147 |
| I'll study tonight at 8 | 4.0 s | 2 | 1 | 36,472 | 21,504 | 172 |
| Where did my money go last month? | 2.9 s | 2 | 2 | 33,164 | 26,624 | 161 |

Answer quality: short, specific and correct against the data in seven of eight. "Can I afford $60" gave two verdicts in
one answer ("wait" and "the forecast still shows $574 left").

## What was already strong

The sky and the skylings (landing, welcome, Today), the AI's short answers, and speed. "Help me sort it out" noticed a
class and work clash and offered fixes in 4 seconds.

## What the walk found

- Reminders and the midday and evening looks only reach people who open the app (the daily job).
- Nobody is asked to turn on notifications outside Settings.
- The floating skyling button covers content on School, Calendar, Money and Goals.
- Today's skyling card shows the LifeFlow logo, not the person's skyling.
- The welcome goes back to step 1 on a refresh and loses the skyling picked on step 1.
- Settings is an iOS-style list.
- Laptop Today uses about half the screen.
