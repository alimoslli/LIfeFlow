# Our own small models, from Hugging Face: a proposal

2026-11-12, LF Main, for the owner through the COO. Asked for by the owner: "write up the huggingface #1 proposal, let's make sure if we're finna replace the open ai api we do it right and ask the way through".

Status: **Steps 0 and 1 done (2026-11-12); the report is `docs/backlog/2026-11-12-local-models-report.md`.**
- Memory picking wins and is built behind `LOCAL_MODEL_MEMORY`, off.
- Tool choosing and purchase sorting lose to what we have, and stay as they are.
- Step 2 (memory picking on for the owner and the demo account) needs his yes.

## In one line

Start with three small jobs that don't need a big AI: picking Ray's memories, choosing Ray's tools, and sorting bank purchases into categories. Run free, open models for them on our own servers. Measure them side by side with what we do now. Switch over only where they win. Replacing the OpenAI chat itself is a later, separate decision with its own tests and yes (ADR 0023, level 2).

## What OpenAI does for us today

There are five places the app calls OpenAI. Each one already goes through the usage gate and writes a usage record (ADR 0035; `tests/unit/ai-paid-clients.test.ts` lists them).

| Job | Where | Model | This proposal |
|---|---|---|---|
| Ray's chat and Today's bar | `jarvis/providers/openai.ts` (behind `ModelProvider`, so it can be swapped) | the main model; the small model for simple turns | stays for now (later, level 2) |
| Reading emails, receipts, schedules and syllabuses | `services/inbox/extract.ts` | the main model | stays for now (a later proposal) |
| Sorting unknown purchases into categories | `services/finance/tidy.ts` | the small model, one batch | **Step 1: a local model** |
| Web prices and cancel steps | `integrations/web-search.ts` | web search | stays |
| Talking to Ray | `jarvis/voice.ts` | the voice service | stays for now (a later proposal) |

Two more jobs don't call OpenAI at all today. They use word lists, and a small model would make them better:

- **Picking memories** (`jarvis/memory-retrieval.ts`): matches words today. It misses "I'm vegetarian" when you ask "what should I cook". The file already says it can switch to meaning-matching ("embeddings") without changing anything around it.
- **Choosing Ray's tools** (`jarvis/tool-select.ts`): word lists pick which tool groups go with a message. A miss means Ray lacks the tool it needs, or a request carries more tools than it needs, which costs more.

## Step 1: what we'd move, and why these three

| Job | Today | With a small open model | What it gives us |
|---|---|---|---|
| Picking memories | word matching | an embedding model, about 30 MB (for example `bge-small-en-v1.5`, MIT licence, or `all-MiniLM-L6-v2`, Apache 2.0) | Ray remembers the right things by meaning. No new cost. |
| Choosing tools | word lists | the same embedding model, matched against short descriptions of each tool group | fewer misses, smaller requests to OpenAI, so each chat costs a little less |
| Sorting purchases | rules, then keywords, then a paid AI batch for unknown shops | rules, then keywords, then the local model, choosing only from the person's own category names | the paid batch goes away for most purchases |

How it runs: with `transformers.js` (Apache 2.0) inside our own server. No other company sees the data, no per-call bill, and no API key.

Why start here:
- These are small, well-defined jobs where small models are known to be good.
- Nothing about the conversation changes for users.
- Each one can be measured exactly against what we have now.
- It's the cheapest way to learn how open models behave on our servers before anything bigger.

What Step 1 does **not** do: it doesn't replace Ray's chat, document reading or voice. Each of those is a later step below, with its own proposal and yes.

## The rules it keeps

- **Data stays with us.** Step 1 runs on our own servers, so no new company receives user data, and the privacy page needn't change. If a later step sends data to a new company (Hugging Face's hosted models, for example), the privacy page and Settings change first, and that step needs the owner's yes.
- **Nothing is trained on real users.** Step 1 trains nothing; it uses ready-made models as they are. If we ever fine-tune, it's on made-up data from the simulator and the situation library only. Real data only ever comes with that person's explicit opt-in. Google data, health data, and email or message content never train anything (ADR 0023, "Data rules").
- **The Money lock and AI permission still hold.** Sorting purchases still runs only for people who allowed AI, and still answers only with their own category names. Memories stay encrypted. A local model reads them in memory only, and never writes or stores them anywhere new.
- **Usage is still counted.** A local model isn't a paid call, so it doesn't use up anyone's monthly limit. We still record that it ran and how long it took (numbers only, no content), so the owner can see it working on Admin › App.
- **We can always switch back.** Each job keeps its current way behind one switch. Turning the switch off brings back today's behaviour at once.

## Two rules before anything is built (COO, 2026-11-12)

1. **Memory vectors are treated like the memory itself.** An embedding is made from a memory's words, so it is as private as they are.
   - Best: work them out in memory for each request and store nothing.
   - If any are stored (for example the save-time fallback below), they are:
     - sealed the way `memories.content` is (ADR 0014);
     - never used to search or sort by content in SQL;
     - deleted with the memory and with the account;
     - wiped by the under-13 lock (and listed in its sweep, `KEEP_ON_LOCK`/`HANDLED_ON_LOCK` and the foreign-key guard test).
2. **Size and cold start first.** Before any of the three jobs is built, measure our Vercel function's size and its cold start with `transformers.js` on the WebAssembly runtime (`onnxruntime-web`) and on the native one (`onnxruntime-node`). If neither fits, report back with the numbers before picking a fallback.

The measuring run uses the development key, once, and the report records each call and its cost.

## Rule 2, measured: size and cold start (2026-11-12)

How it was measured:
- `bge-small-en-v1.5`, int8 (34 MB, 384 numbers per text), with Hugging Face's tokenizer, on `onnxruntime-node` 1.30 and on `onnxruntime-web` 1.31 (WebAssembly, one thread).
- Each runtime ran in a fresh Node 22 process, twice, on this cloud container (4 cores).
- What each runtime adds to a function was traced with Vercel's own file tracer (`@vercel/nft`).
- The app's current functions were sized from our production build's trace files.
- Scripts are in the chat's scratchpad. Nothing was added to the app.

| | native (`onnxruntime-node`) | WebAssembly (`onnxruntime-web`) |
|---|---|---|
| Adds to a function | 46 MB runtime (Linux x64 only), plus the 34 MB model | 14 MB runtime (one `.wasm` file), plus the 34 MB model |
| Cold start: load the runtime and model, plus the first text | about 0.26 s | about 0.7 s |
| Each text after that | 4.5 ms (95% under 6 ms) | 13 ms (95% under 16 ms) |
| Memory | about 170 MB | about 390 MB |

**Does it fit on Vercel?** The limit is 250 MB uncompressed per function. Today:
- our biggest page traces about 8 MB;
- Next's own server about 62 MB.

| | Total | Room left under 250 MB |
|---|---|---|
| Native | about 150 MB | about 100 MB |
| WebAssembly | about 120 MB | about 130 MB |

Both fit, under two conditions:
- **Native:** the tracer also pulls in the Linux ARM copy of the runtime (25 MB). It must be left out with `outputFileTracingExcludes`. The full `@huggingface/transformers` package would also bring the image library `sharp` (19 MB a copy, two copies). For text alone we use the runtime and the tokenizer directly (about 80 MB with the model), or exclude `sharp`.
- **The model goes only into the functions that use it:** chat, the tidy step and the sync crons. It does not go into every page.

**Speed against the rule:** the target is under 300 ms added to a chat turn, both warm and on a cold start.
- **Native meets it on both.** Picking memories and tools takes two or three texts per turn, about 15 ms warm.
- **WebAssembly misses it on a cold start** (about 0.7 s). Warm, it is fine.

**Pick: native**, with these caveats:
- These timings are from this container. A real cold Vercel instance reads files from colder storage, so its first load will be slower. The first preview deploy with the switch on (still off for users) measures that, and the comparison report will show it.
- With Fluid compute an instance serves many requests, so the load is paid once per instance, not per turn.

**Two things this measurement turned up:**
1. **Getting the model files.** This cloud environment cannot reach `huggingface.co` (the network refuses it).
   - For this measurement, a copy of the same model was taken from an npm package. It was not checked against Hugging Face's own file hash, so it was used for timing only.
   - For the real build we take the official files from Hugging Face. We pin the exact version and check its hash in the build, the way we pin Prettier.
   - So this environment needs `huggingface.co` added to its network list. That's a settings change only the owner can approve, so it goes to him through the COO. Vercel's own builds can already reach it.
2. **Meaning-matching isn't a sure win on its own.** On a first try, "what should I cook tonight" scored closer to "Remind me to call mom" (0.65) than to "I'm vegetarian" (0.62). It was no better with the model's search prefix.
   - So Step 1 measures the model on the labelled cases rather than assuming it wins.
   - It also tries mixing it with today's word matching, or a second small model (MiniLM) for comparison.
   - Memory picking moves only if it beats today on those cases, as the gate says.

## How we do it right: steps, each with a yes or no

### Step 0. Measure where we are now (no change for anyone)

- **Memories:** the labelled cases in `tests/unit/memory-retrieval.test.ts` (recall and precision), plus about 50 new cases where meaning matters and words don't ("what should I cook" → "I'm vegetarian").
- **Tools:** every question in the Jarvis eval (`tests/fixtures/jarvis-eval.ts`) and the skill evals, scored by whether the right tool groups were picked and how many extra groups came along.
- **Purchases:** 300 made-up transactions from the simulator, each labelled with its right category, scored for how many land in the right one.
  - Measuring today's paid AI batch on the same set means a small real-model run: about 12 calls to the small model, a few cents in total. Per the AI spend rule, that run needs the owner's yes first. Everything else uses made-up data and no paid calls.

**Owner's answer (2026-11-12, via the COO): yes**, to Steps 0 and 1 and to the ~12-call run.

### Step 1. Build it beside what we have, and compare

- Each job gets the local model behind a switch that is off by default. Users keep today's behaviour.
- A comparison report runs the old way and the new way on the Step 0 sets, and shows, for each job:
  - accuracy;
  - speed;
  - what each costs;
  - the cases where they disagree, written out so the owner can read them.
- **A job moves on only if:**
  - **Memories:** recall and precision are both at least as good as today's on every existing case, and better on the meaning cases. The test must stay green (CLAUDE.md).
  - **Tools:** at least as many questions get every tool group they need, with fewer extra groups on average.
  - **Purchases:** at least as accurate as today's AI batch on the 300, and never invents a category outside the person's own list.
  - **Speed:** under 300 ms added to a chat turn, measured after the model has loaded and on a cold start.
  - **Hosting:** it fits our Vercel hosting (the size limits and cold starts are the biggest risk; see "Risks").

**Owner's yes or no, per job:** the report with its numbers, then go or no go for that job.

### Step 2. On for the owner and the demo account only

- The switch is turned on just for the owner's account and the demo account, for a week of real use.
- The owner sees the result, and any problems go into the situation library as new cases.

**Owner's yes or no:** turn it on for everyone.

### Step 3. On for everyone, with the switch kept

- Turned on for everyone, the old way stays in the code behind the switch for at least a month, and the daily cost on Admin › App shows the change.

## The bigger replacements, later, each with its own proposal and yes

These replace OpenAI for real jobs. Each one gets the same steps (measure, side by side, owner, everyone), and none starts without a yes.

1. **Reading documents** (receipts, schedules, syllabuses, emails): an open vision model (for example `Qwen2.5-VL` or `Florence-2`). It would need a GPU (a graphics card), so either a hosted endpoint or a GPU server of our own. Data would go to that host, so it's a privacy change and needs the owner's yes. It's measured on a labelled set of made-up documents.
2. **Voice:** open speech-to-text (`Whisper`) and text-to-speech (for example `Kokoro`) for Ray's own voice. That's a GPU host again, with the same privacy rule.
3. **Ray's chat itself:** an open model (for example a `Qwen` or `Llama` model), fine-tuned on the situation library and hosted by us. This is ADR 0023 level 2, after the 10-student test. It replaces OpenAI only when it beats the current model on the whole situation library and the Jarvis eval, at an acceptable cost per message. It needs roughly 5,000 to 10,000 good examples, which come from growing the simulator.

Until a job passes its own tests and gets its own yes, OpenAI keeps doing it.

## Risks and what we'd do about them

- **Hosting size and cold starts on Vercel:** the model files (about 30 MB) and the runtime (tens of MB) may push our serverless functions past their size limits, or make the first request slow.
  - Step 1 measures this first.
  - If it doesn't fit, the fallbacks are running the embedding model once when a memory or category is saved (so a chat turn only compares numbers), or a small separate server.
  - Either fallback is still ours, with no new company involved.
- **Accuracy on real life:** made-up data isn't real life. That's why Step 2 runs on the owner's own account first, and every miss becomes a test case.
- **Upkeep:** open models don't update themselves. We pin the exact model version, like we pin Prettier, and an upgrade gets the same side-by-side check.
- **Licences:** only models whose licence allows business use (MIT or Apache 2.0 for Step 1), recorded in the decision record.

## What it costs

- **Step 1:** no AI bill. A few days of building. The only paid calls are the ~12 calls to the small model in Step 0, and only with a yes.
- **Savings:** the paid purchase-sorting batch goes away for most purchases, and Ray's chat requests get a little smaller. We'll show the real numbers from the usage records after Step 2, not guesses.

## What the owner has said

- 2026-11-12: yes to Steps 0 and 1, and yes to the ~12-call run on the small model ("yes to both").
- 2026-11-12: "go the hugging face", with a yes on the approval prompts for Hugging Face's hosts on the LifeFlow environment.
  - The run needed 3 of the 12 calls, about $0.008.
- Next: Step 2 comes back as its own yes or no, with the comparison report and its numbers.
