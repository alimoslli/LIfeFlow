# The owner's first grades (2026-11-26): 8 of 30

The owner graded 8 real answers from the training set on his private page. His words are feedback, never the answer itself;
the next generation is written by the teacher under what the feedback changed. His exact words are in `grades-1.json`.

## What he said, and what it changed

| Answer | His grade | His words | What changed |
| --- | --- | --- | --- |
| "got my project done last night" (no matching to-do found) | Almost | "remember the stars? also too long just to say you dont know what project the user is talking about" | Rule 19 and its card: a ticked thing earns a star and the skyling says so; when it cannot find the thing, one short line and "which one was it", so they get their star. No star for something it did not mark. |
| "are you an AI?" | Almost | "i like it, but if he asks alot we can also explain that we are a model trained to organize your life etc, because each of these questions dont have just one answer" | Rule 28 and its card: no fixed line, its own words each time; asked more, it says a little more (an AI built for LifeFlow to help keep their life in order). Still never names a model or a company. |
| a literature review broken into five steps | Good | "make sure this is what a user would want ... and not get overwhelmed too" | Rule 15 and its card: steps in a few words each, as many as the thing needs, which is first; it should feel lighter after the answer. |
| "I swear I'm going to work on the assignment due first after dinner" | Almost | "no need for all that at the end, i like the start tho" | Rule 14 and its card: after a promise, one short line with the check-in time, then stop. A check sends back anything longer or with an offer. |
| "can you just do my midterm for me" (it asked which class and when) | Almost | "you should probably know what exam based on time or context, if not at all u can ask that question at the end" | New rule 31: never ask what you can look up. A check sends back "which class, when's the exam" when it has not looked. |
| "I have an hour free, what now?" (93 words) | Almost | "i need to know what i have to do now and maybe whats next briefly not all of this id get lost, people hate reading and typing now" | Rule 18 and its card: one thing, one short line on what comes after, about 30 words. New rule 30: as long as it needs, and no longer (see his correction below). |
| a web search that was not available | Good | "if web search doesnt work now it doesnt mean it will work in a bit, we either have it in the app or we dont" | New rule 32: it works here or it does not. A check sends back "try again in a bit", "later", "when it's back" and any offer to retry. |
| "thanks, that helps" ("which of the three Sunday items") | Good | "items? really? make sure wording is tight and good, tight as in having the personality we need as well as no need for extra words" | New rule 33: tight words, its own voice. A check sends back "items". |

All of it is in the teacher's rules (`skyling-alive.txt` rules 14, 15, 18, 19, 28 and new 30 to 33; rule 8 of `skyling-rules.txt`),
its cards and reminders, and in code both the guard and the training filter use (`reality_checks.py`, `owner_notes`: 29 of 29
test cases, ten of them taken from these grades and his correction).

## His correction the same day: no strict cap

After seeing the first version of these changes (a 60-word limit, five steps at most), the owner said: "there shouldn't be a
strict cap to messages as some do require a big response for help, same for the breakdown and steps."

So there is no fixed limit on length and none on the number of steps. The rule is now "as long as it needs, and no longer":

- A quick message (what now, thanks, I'm behind, a promise, a greeting) still gets a quick answer, usually under 40 words.
  In code, an answer over about 60 words to such a message is sent back.
- A message that asks for real help (explain, how do I, walk me through, a plan, a breakdown, compare, all of something) has
  no limit in the rules and none in code. The readers flag padding, and also a short brush-off where real help was asked for.
- A breakdown has as many steps as the thing really needs.

The figures below are measured with this corrected rule.

## What the grades say about last night's set

- He agreed with the readers on 2 of the 7 answers they had kept. The other 5 he marked Almost. **The readers were too easy
  on length and on extras**; their brief now carries his standard.
- Measured against his standard in code, on the 250 turns the readers kept: **96 fail, 154 pass.** 63 are too long for a
  quick message, 18 ask what a look would answer, 9 say "items", 7 promise it will work later, 7 add extras after a promise,
  5 ask too many questions. The middle answer is 53 words; for a quick message he wants most under 40.
- The checks catch 6 of his 8 notes by themselves. The two they cannot catch (the stars, more than one way to say what it
  is) are in the rules and need the next generation and his next grades to confirm.

**So the 435 examples of round 1 are not at the owner's standard.** Training the big model on them would teach the long,
offer-everything style he marked down. The runbook now puts a fresh generation first, with the tightened teacher, and
trains on that. What passes his standard from round 1 (about 154 turns) can be added to it.

## Not measured

Whether the teacher follows the new rules, and whether the 20-question test holds when answers get shorter (that test
rewards naming every fact). Both need the model running. The 20 questions are scored first on the generation box, and a
score under 17 stops the run before any examples are made.

22 answers are still ungraded on his page.
