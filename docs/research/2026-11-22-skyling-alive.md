# Skyling 1.1 (working name): from answering to doing

2026-11-22. Made-up data only (ADR 0023): the eval student Maya Chen and the simulator's lives. No real user data, no OpenAI and no Groq calls. Nothing here changes the app: every script is under `scripts/gpu/`, on branch `claude/skill-router-pilot`.

The owner's asks, in his words: "not just answer my question but actually solve my problems and does things for the user", "interactive, asking me questions, all curious and a personality that fits the app", "read the user's life and understand all of it, kind of be living through it with him", "i want my skyling interacting with me before i do", "look from a users side, what would they want".

## In one paragraph

Same model as Skyling 1.0 (Qwen3.8-27B, open, on one rented H100). What changed is ours: sixteen more rules, a set of "situation cards" our code picks from by reading the person's message, and ten more checks in code. The skyling now books the study time when you say you are behind, speaks first when the app opens, asks a real question, remembers what you tell it, holds you to a promise, breaks a big thing into dated steps, marks a thing done when you say you finished, and reads money and time together before it answers a "should I". It is clearly better at doing things. It is still a little worse than 1.0 on plain questions, so it is not ready to replace 1.0.

## Scores

First try only. Each number is one full run on the real model; runs are in the order they happened, so you can see the fixes land.

| Test | Skyling 1.0 | 1.1, every reminder every time | 1.1, situation cards |
|---|---|---|---|
| Old 20 questions | 20, 19, 19 | 18, 18, 18, 19, 18, 15, then 19 after the last fixes | 15, 16, 19, then 18 after the last fixes |
| Same 20, reworded | 19 | 16 | 16 |
| 162 unseen questions, other lives (189 turns) | 92% | 86% | 87% |
| Solve my problem (6) | 2 | 5, 5, 3, 2, 5, 6 | 5, 5, 5 |
| Whole life: money and time together (4) | 0 | 0, 2, 3, 3, 3, 3 | 4 |
| Speaks first (2) | not built for it | 2, 1, 2, 2 | 2 |
| Curious, in character (3) | 2 | 3, 3, 3, 2 | 3 |
| Wishes (5) | 4 | 3, 5, 4 | 3, 4, 5 |
| Everyday moments (4) | 2 | 3, 3 | 3, 3 |
| Trust (4) | 2 | 3 | 4, 3 |

On the old 20 the new versions are scored with `--alive-rules`: three questions ("help me catch up", "I'm lost", "find me 2 hours to study") now get study time booked, or one extra look to check when the exam is, which the original test counted as a miss. Without that flag the 1.1 scores are one to two lower. The first five 1.1 numbers on the old 20 were scored before the flag covered all three.

What the new tests are (all in `scripts/compare-models.ts`, each perfect answer passes its own checks):

- **Solve my problem** (`--exam alive`, 6): behind on the essay, exam stress, plan my week, rent worry, a class that clashes with a shift, essay intro plus time.
- **Whole life** (`--exam life`, 4): broke and behind, an extra shift on Friday, the one thing that could go wrong this week, a birthday dinner on exam day. Each needs the money side and the time side.
- **Speaks first** (`--exam open`, 2): the app opens and the person has said nothing.
- **Curious** (`--exam curious`, 3): a plain "hey", a new job, a rough day.
- **Wishes** (`--exam wish`, 5): remember what I tell you, hold me to my word, break it down, find money to cut by name, fix it when I change my mind.
- **Everyday moments** (`--exam day`, 4): what do I do right now, I finished it, I'm sick today, what can slide.
- **Trust** (`--exam trust`, 4): it follows up on a promise the next time the app opens, it is honest about a bad grade and names the next chance, undo removes only the thing it just made (the app still asks for a Confirm tap), and "not now" gets a short okay and no second offer.

## What I found by reading its answers, and what I did

| What it did | Why a person would hate it | Fix |
|---|---|---|
| Booked study blocks of 5 and 8 hours (a whole free window) | Nobody studies 8 hours straight | Rule, and a check in code: a study block it picks itself over 2.5 hours is sent back |
| Booked a "final review" block on top of the exam itself | The calendar tool does not count an exam as busy time | Rule, and a check in code that reads exam times from the results and sends such a booking back. The real fix is in the app's free-time tool (needs the owner's yes) |
| Saved a gym class on top of a shift, then warned about it | The clash was already saved | Check in code: look at the calendar before any booking |
| Said the expected paycheck "would cover it" | Owner's rule: pay that has not landed is not money | Rule, and a check in code that sends it back |
| Told "I got a job at the library", added the job to the Work page by itself | Nobody asked | Check in code: outside a short list (its own blocks and to-dos, a memory, a promise, marking a thing done) a change nobody asked for is sent back |
| Asked to break the essay down, listed the steps and asked "want me to save them?" | That is the old, passive behaviour | Check in code: the steps go on the to-do list in the same turn |
| Called money "fine" from a summary that does not see rent | Wrong, and dangerous | Rule: only the affordability tool sees rent and bank-found bills, and it is used for every money-and-time question |
| "The exam", "the draft" | Vague | Rule: call things by their full name ("BIO 110 Exam 2") |
| Looked at Wednesday, saw the shift, saved the gym class on top of it anyway | Looking is not enough | Check in code: a booking that overlaps something the results showed is not saved (unless the person says "anyway") |
| "Skip the BIO 110 class if you want the full block" | A planner that tells a student to skip class | Rule, and a check in code that sends it back |
| "Three figures at most" (my own rule for money worries) made it drop the small bills on plain money questions | My rule was too wide | The line now lives only on the money-worry card |

## Situation cards

The first version put one reminder line for every ability at the end of every prompt. At twelve abilities that was 645 words on every message, and plain questions got worse (18 of 20 where 1.0 gets 19 to 20). The second version (`skyling-situations.txt`, `responses_shim.py --situations`) has our code read the person's last message and add only the cards that fit, three at most: "I finished it" gets the mark-it-done card and nothing else. The full rules stay in the system prompt. This is the same idea as the app's own skill router, and it means the next ability costs nothing on the messages it does not apply to.

Head to head on the same code: on the old 20 the two ways came out even and noisy (every reminder 18 and 15, cards 16 and 19; after the last fixes 19 and 18, with every fact right in both and the misses being one extra tool call). Cards were ahead on the whole-life test (4 of 4), the trust test and, by one point, the unseen questions (87% against 86%). Cards misfire when a pattern is too broad (the word "rent" alone once pulled the money-worry card onto a plain question about bills); three patterns were tightened after that. My pick for the next test chat is the cards, because they are the version that stays the same size as abilities are added.

## Where it is still behind Skyling 1.0

- **Unseen questions: 86 to 87% against 92%.** Of the 25 misses in the last run, 9 were answers of 117 to 139 words (the limit is 100), 9 had a figure that is in no tool result (meal prices and a laptop price from the model's own head, plus two false alarms of my filter: a probability of 0.5 and "$10" as the difference between two prices the person gave), 5 were tools that failed in the made-up lives (no Google connection, a class that does not exist). The long answers have a fix in code (the rewrite is now asked for at 70 words) that has not been measured yet.
- **Old 20: 18 to 19 against 19 to 20.** After the last fixes every fact, tool and save was right; the misses are one tool call over the budget.
- **"What can slide" misses the essay** in every run (it names the exam and the shifts as fixed, not the essay due Wednesday). The card was sharpened after the last run; not measured yet.

## Honest limits

- **One made-up student.** All 28 new tests are Maya Chen's one week. The 162 unseen questions are other lives, but they are the old kind of question, not the new abilities.
- **Small tests, noisy.** A 6-question test moving between 3 and 6 on the same rules is noise as much as progress. Read the trend, not one run.
- **I tuned on these tests.** I read wrong answers and wrote rules for that kind of mistake. Several times I also loosened a check that was stricter than a person would be (it said "already taken", the test wanted the word "clash"); each one is in the commit history.
- **Not trained.** Nothing here changed the model's weights. The owner asked to train; the training run (the alive skyling teaches a small Qwen3-8B, `distill_box.sh`) is written and not run: about 230 credits, and the last small model we trained scored 1 of 20. My advice is to train once the rules stop changing every round.
- **Not in the app.** This runs only behind the test chat on a rented GPU. Building the rules, cards and checks into the app is a change to `src/` and needs the owner's yes.
- **The cut-sentence glitch** (about 1 answer in 15 stopped mid-sentence in earlier rounds) did not show in the answers I read from rounds 3 to 8. I did not count it across every answer, so I do not know that it is gone.
- **Pushed after the last run, so not measured on the model:** the check against a booking on top of something on the calendar, the check against "skip class", the 70-word rewrite, the sharper what-can-slide card. Each was tested as code on made-up input only.

## Spend

This round: 223.01 credits, one H100 at 120 an hour from 08:16 to 10:07 UTC (box c9a62122, stopped), of the owner's 350 cap. About 8 of it was my mistake: a stop timer left running from an earlier round cut round 4 short. Eight rounds, about 60 test runs and two unseen-question checks. Left under the cap: about 127, kept for the owner's test chat (about 26 to set up, then 2 a minute).

Before this round: 490.67 (Skyling 1.0) and 46.49 (the first test chat).

## Files

- Rules: `scripts/gpu/own-model/skyling-rules.txt` (1 to 9, Skyling 1.0), `skyling-alive.txt` (10 to 25).
- Reminders: `skyling-reminders-alive.txt` (first version), `skyling-reminders-alive2.txt` plus `skyling-situations.txt` (cards).
- Checks in code: `scripts/gpu/chat-eval/responses_shim.py --guard`.
- Tests: `scripts/compare-models.ts --exam alive|life|open|curious|wish|day|trust`, `--alive-rules` for the old 20.
- Plans that were run: `scripts/gpu/own-model/plan-alive*.txt`. Raw results: GPU storage `/workspace/ownmodel/<label>/raw-local.json`.
- Test chat: `scripts/gpu/demo/skyling_demo.sh <max min> <idle min> <rate> cards`.
