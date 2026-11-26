# Smart memory and the gamechanger skills (owner, 2026-11-26)

Owner: "make sure our app is strong on memories and remembering the important things about the user and so its not
costly we need our model smart enough to know if he needs to know all that info before answering"; "i love the
gamechanger ideas do them"; "this has to be an app that brings extra value for a user that he cant simply do on his own".

The idea in one line: **ready before you need it, from your real life.** A general AI waits to be asked and knows nothing
about your week; the skyling speaks first, already knows your classes, shifts and money, does the prep, and gets better the
longer you use it.

Everything ships only after the owner's yes on pictures. Tests use the fake model; no paid AI runs without his yes.

## Part 1. Smart memory (cheap by default, deep when needed)

Today (survey of main): every turn sends all instruction memories plus up to 12 others picked by word matching
(`selectMemories`, 2,400 characters), whatever the question; `list_memories` dumps everything; voice gets instructions only.

- **M1. A small core, always.** Standing instructions plus the few facts that shape almost every answer (who they are:
  student or working, school, job, goals in progress, routines), capped at about 600 characters. Picked in code from the
  person's own approved memories (category and how often they were used), never by a model.
- **M2. Nothing more for simple lookups.** A turn the effort picker already marks as a plain lookup ("what's next",
  "when is my shift") gets the core only. Planning, money, advice and anything about them get the core plus the relevant
  ones, as today.
- **M3. The skyling looks things up when it needs to.** A `recall_memories` tool with a query: the model calls it when the
  answer depends on something about them it can't see ("what did I say about my manager?"). Same scoring as today, top 8,
  so a long memory list never rides along on every turn.
- **M4. Remember what matters.** The important things they tell it are offered as a memory (as today, one tap to keep), and
  what the moment questions teach ("Tuesday closings leave me on empty") is proposed the same way. Nothing private is ever
  saved without them (the sensitive-content check stays).
- **Done means:** the recall and precision test stays green; a test shows a lookup turn's prompt carries only the core; a
  test shows `recall_memories` finds the right memory; voice gets the core too.

## Part 2. The gamechangers

Each is a skill (`skills/<name>/SKILL.md` + evals) plus the code that notices the moment, with one clear card and Undo.
Drafts are written by our own code from real records wherever possible (free and never made up); paid AI only where it
truly adds value, through `reserveAi` with its monthly limits.

1. **Paper pack** (first). About 3 days before an essay, paper or report is due, when their week is tight: "Your research
   paper is due Thursday. Want me to get sources ready?" One tap (that's the request) and the skyling gathers 6 to 8
   credible sources with a two-line summary and a ready citation each (one web search, counted in the monthly limit),
   and offers 3 work sessions in real free time around shifts (Undo). "Start it" opens the pack. **Never writes the paper,
   a thesis or paragraphs** (academic integrity); it finds, summarizes and plans.
2. **Exam practice.** The week before an exam: short practice questions from the course's own topics, spread over the week,
   and the night before only what they missed. Study help, never answers to graded work.
3. **Shift swap.** When a new shift clashes with an exam or a big deadline (`deadline_conflict` exists): a ready text to the
   manager or coworkers, written by our code from the real shift and exam ("Hi, I have my Bio final Thursday morning. Could
   anyone take my Wednesday 5 to 11 close?"), copied with one tap. We never send it.
4. **Extension email.** When something is due and their week can't fit it: a polite email to the professor by name, with
   the real dates and what's done so far, as a Gmail draft or copied text. They send it.
5. **Rent before payday.** When a bill lands before money comes in (`bill_short`): the gap in plain numbers and a ready
   message asking to move the due date; and when a subscription goes up, the exact cancel steps (`findCancelHelp`).
6. **Admin deadlines.** Once a term: registration, financial aid and scholarship dates for their school, found on the web
   with the source and saved as to-dos only after they tick them. Never a guessed date.
7. **Sunday reset.** Sunday's look already exists; it gains one learned suggestion from their own answers ("Keep Tuesday
   night free? Your Tuesday closes run long").

## Order

M1 to M3, then the paper pack, then 3, 4 and 5 (code-written drafts, no AI cost), then 2, then 6, then 7.

## Rules

Integrity (ADR 0016: never writes, solves or checks graded work); never send anything for them; money moves only on
"Do it" with the exact amount; every action has Undo; no new page without the owner's yes on a picture; the skyling's
words never name a model; costs counted in `ai_usage` and capped by `ai-limits.ts`.
