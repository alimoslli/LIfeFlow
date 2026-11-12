# Our own small models: the comparison report (Steps 0 and 1)

2026-11-12, LF Main, for the owner through the COO. The plan is `docs/backlog/2026-11-12-local-models.md` (owner: "yes to both", "go the hugging face"). Every number here comes from `scripts/local-models/compare.mts` and the one paid run, `scripts/local-models/tidy-ai-run.mts`. The raw results are next to this file (`2026-11-12-local-models-results-*.json`, `-ai-run.json`).

## In one line

**One of the three jobs wins: picking Ray's memories.** It finds more of the right memories (82% instead of 70% on new cases) without sending a wrong one, on our own server, for free. The other two lose to what we have:
- **Choosing tools:** the word lists already get everything on our tests.
- **Sorting purchases:** the paid AI batch is far more accurate and costs under a cent a run.

The winner is built and switched off. **The question for the owner is Step 2: turn memory picking on for your account and the demo account for a week?**

## How it was measured

- **The model:** `all-MiniLM-L6-v2` (Apache 2.0, 23 MB). It was compared against `bge-small-en-v1.5` (MIT, 34 MB) and won on every job, as well as on speed.
  - Both models were downloaded from Hugging Face at one exact version.
  - Every file was checked against Hugging Face's own fingerprint (SHA-256).
- **Data:** only made-up data from the simulator and hand-labelled cases. Each case was labelled before any model ran.
- **Honest numbers:** every threshold was chosen on one half of the cases (dev) and scored on the other half (test).
- **Speed:** measured on this cloud machine.
- **Paid calls:** one approved run, 3 calls to the small model (gpt-5.4-mini). It used 3,013 input tokens and 1,333 output tokens. At OpenAI's published $0.75 and $4.50 per million tokens, that's about **$0.008** in total. All 3 calls were recorded in `ai_usage` on the test database's throwaway account.

## 1. Picking Ray's memories: a win

The job: which saved memories go in front of Ray for this message. Today it matches words, so it misses "I'm vegetarian" when you ask "what should I make for dinner".

| | Today (words) | With the local model |
|---|---|---|
| New meaning cases, test half: right memories found | 70% | **82%** |
| Wrong memories sent | 0% | **0%** |
| The 11 existing cases (must all stay right) | 100% right, 0 wrong | **100% right, 0 wrong** |
| Memories sent per message | 5.5 | 6.9 |
| Added to a chat turn | none | 42 ms with 25 memories, about 160 ms at most (100 memories) |

What it still misses:
- "potluck" → vegetarian and peanut allergy;
- "coffee shop" → lactose intolerant;
- "plan my Wednesday morning" → walk the dog.

How it keeps the rules:
- **Nothing is stored.** The vectors are worked out for each message and dropped (the COO's rule 1), so there is nothing to seal, sweep or delete.
- **The memory test stays green**, with new cases for the meaning option.
- **It only ever adds a memory, never removes one.** Instructions still always come.
- **It's capped.** At most the 100 most recent memories are checked; the rest go by their words, as today.
- **A cold start never waits.** On a server that just started, the first message goes by words while the model loads in the background (about 0.3 s), and the next message has meaning.

**Gate:** better on the meaning cases, at least as good on every existing case, under 300 ms, and it fits Vercel. **Go for Step 2.**

## 2. Choosing tools: no-go

The job: which tool groups go with a message. Fewer means a cheaper request.

- **Today already wins on our tests.** All 202 questions (the Jarvis eval and every skill's eval) get every tool group they need, with 0.44 extra groups on average. Skill routing does most of that.
- **With skill routing off,** the word lists still beat meaning:

  | With skill routing off | Word lists | Meaning alone | Both |
  |---|---|---|---|
  | Every needed group | 45% | 29% | 48% |
  | Extra groups | 0.45 | 0.65 | 0.99 |

- **Result:** meaning adds little and roughly doubles the extra groups. It stays as it is. The experiment lives in `scripts/local-models/tools-experiment.mts`, not in the app.
- **One caveat:** our test questions all route to a skill, so they say little about real follow-up messages ("ok, do that"). If we ever want to revisit this, the first step is a set of real-looking follow-ups.

## 3. Sorting purchases: no-go

The job: purchases our rules and keywords don't recognise (87 of the 300 made-up shops) go to one small AI batch.

| On the unknown shops (test half, 48) | Paid AI batch (today) | Local model |
|---|---|---|
| Right | **37** | 10 |
| Wrong | 11 | 5 |
| Left unsorted | 0 | 33 |

- **All purchases:**
  - keywords alone sort 61% right;
  - with the AI batch, 85%;
  - with the local model instead, 67%.
- **The paid batch costs very little.** Under a cent for all 87 shops (3 calls, about $0.008).
- **Result:** the local model is nowhere near as good, so the paid batch stays. The experiment is in `scripts/local-models/tidy-experiment.mts`, not in the app.

## Hosting (the COO's rule 2)

- **Switch off (the default):** the runtime and the model are in no function. The chat's function is 3.3 MB, the same as before this work.
- **Switch on:** only the chat's function carries them (Linux x64 runtime 46 MB plus model 24 MB).
  - That makes the chat's function 73 MB, about 135 MB with Next's own server, of Vercel's 250 MB limit.
  - The build fetches the model only when the switch is on. If Hugging Face is down, the build warns and the job uses today's way; a deploy never fails over it.
- **Two build problems found and fixed:**
  - Reading the model folder made the tracer copy the whole project (60 MB) into the chat's function, even with the switch off.
  - The runtime's native library was left out, which would have broken loading on Vercel.
- **Checked in the real app:** on a switch-on production build, the memory e2e tests pass and the server log shows the model loading.
- **Still to measure:** a real Vercel cold start is only measured once the switch is on in a preview.

## What Step 2 would be (needs the owner's yes)

1. Set `LOCAL_MODEL_MEMORY=on` for the owner's account and the demo account only.
   - Today the switch is for the whole deployment, so this needs a small per-account check first. It would be a pre-approved small change once you say yes.
2. Run for a week of real use.
   - The owner checks "What Dev knows" and whether Ray remembered the right things.
   - Every miss becomes a labelled case.
3. Then a yes or no to turn it on for everyone (Step 3). The old way stays behind the switch.

No new company sees any data. Nothing trains on anyone, and nothing is stored.
