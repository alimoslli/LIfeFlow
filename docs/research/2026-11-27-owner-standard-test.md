# The owner's standard as a test (2026-11-27)

The owner asked for his grading to become a test every future model gets a number for. This is that test.

## What it is

39 made-up chats with the eval student (Maya Chen, Monday November 2, 2026, 10:00 AM). Each one tests one thing the owner
said when he graded eight real answers on 2026-11-26:

| Rule | Probes | From |
|---|---|---|
| Real help, a plan, a list or a breakdown gets the whole answer | 6 | his correction, g03 |
| A quick message gets a quick answer | 4 | g06 |
| Says it is an AI in its own words, more when asked more, never a model or company | 4 | g02 |
| Acting on your own: books with Undo when on, offers and waits when off | 4 | decision 5 |
| Right now means one thing, then what is next, briefly | 3 | g06 |
| Never ask what a look would answer | 3 | g05 |
| Tight words: no "items", no filler | 3 | g08 |
| The job is done, so stop | 3 | g04 |
| A ticked thing earned a star, and it says so | 3 | g01 |
| After a promise: one line, then stop | 2 | g04 |
| One open question at most, one yes-or-no offer at most | 2 | rule 31 |
| It works here or it does not: never "try again in a bit" | 2 | g07 |

A probe passes only when every check on it passes: the shared checks every answer gets (`reality_checks.py`) and its own
(tools it must and must not call, word ranges, what it must and must not say, how many things it saved).

## Numbers we have without a GPU

The shared checks alone, over the answers round 1 recorded on 2026-11-25:

| Answers | Meet his standard |
|---|---|
| Every recorded turn | 271 of 449 (60%) |
| Kept by the automatic filter | 233 of 396 (59%) |
| Kept by the filter and the readers (the 250 turns the 435 examples came from) | 155 of 250 (62%) |

The biggest reason by far is "too long for a quick message" (63 of the 95 misses in the kept set), then asking what the
records would answer (18), "items" (9), "try again later" (7), extras after a promise (7) and too many questions (5). This
is why round 1's examples were not used and generation 2 comes first.

**The 39-probe test itself has no model score yet.** It runs on the box: the teacher before generation 2
(`$TAG-teacher-cards-owner`) and every trained model (`$TAG-trained-full-owner`, `$TAG-trained-bare-owner`).

## The scorer checked against the owner

Run on the eight answers he graded, the scorer agrees with his reason on 7 of 8. It fails g01, g04, g05 and g06 (his
Almosts) for the reasons he gave, and also fails g07 and g08, which he marked Good but complained about ("try again in a
bit", "items"): his complaint is the rule, so the scorer follows the complaint. It passes g03. It passes g02, which he
marked Almost because the answer should say more when asked more; one question cannot show that, so a two-question probe
(`own-ai-more`) tests it instead. The checks were not bent to fit his grades.

## Stop line

Do not train on a teacher's examples if it scores under 31 of 39 or has any rule at zero (reasons in the runbook, "The
owner score").
