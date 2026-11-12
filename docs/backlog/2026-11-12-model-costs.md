# Model costs: what we test, what it costs, what to do (2026-11-12)

The owner asked eight questions (2026-11-12). Each answer below is marked **measured** (we ran it), **estimate** (worked out from measured numbers and published prices) or **not tested**. Nothing live was changed. The one code change here (the history trim) moved to its own branch, `claude/long-chat-trim` (owner's yes through the COO, its own gate).

Sources in this repo: `docs/research/2026-11-07-model-comparison.md` (the chat comparison, real calls), `docs/backlog/2026-11-12-local-models-report.md` (the Hugging Face report), `docs/audits/2026-11-10-product-baseline.md` (production token counts), and the new free measurement `tests/integration/request-size.test.ts` + `scripts/local-models/request-tokens.mts`. That measurement runs the real assistant loop and builds the real OpenAI request for the 12 eval questions (the made-up student Maya), with a fake model that answers using each question's own tool plan. Tokens were counted with OpenAI's public tokenizer (o200k), so they match OpenAI's own count to within a few percent. No model was called.

## 1. The Hugging Face model and where it runs

- **Model:** `all-MiniLM-L6-v2` (sentence-transformers), the Xenova ONNX int8 copy, pinned by revision and SHA-256. A BGE small model was the runner-up.
- **What it is:** a small *embedding* model. It turns text into a vector so we can match by meaning. It does not write answers or call tools. It is not a chat model and cannot replace OpenAI in the chat.
- **Hosting:** none. It runs on our own Vercel function's CPU (`onnxruntime-node`). There is no provider and no per-token price ($0 a call).
- **Status:** built behind `LOCAL_MODEL_MEMORY` (off) on `claude/local-models`. It is not on main and not live.

## 2. What it was compared against

- **Memory picking:** today's word matching (no AI). Measured.
- **Tool choosing:** today's word rules (no AI). Measured.
- **Purchase sorting:** the app's small OpenAI model, `gpt-5.4-mini`. Measured with 3 real calls.
- **The chat itself:** `gpt-5.5` was compared on 2026-11-07 with two open chat models on Groq (`gpt-oss-120b`, `qwen3.8-27b`). Groq's free tier refused every request as too large, so no open chat model has ever completed an answer for us.

The app today uses `gpt-5.5` for chat, documents and search, `gpt-5.4-mini` for low-effort turns (lookups and adds) and transaction tidying, and `gpt-realtime` for voice (env.ts defaults; production may override them).

## 3. Prices (per 1 million tokens)

| Model | Input | Cached input | Output | Source |
|---|---|---|---|---|
| gpt-5.5 | $5.00 | $0.50 | $30.00 | OpenAI's model page ([developers.openai.com](https://developers.openai.com/api/docs/models/gpt-5.5)) |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 | OpenAI's model page |
| gpt-oss-120b on Groq | $0.15 | about $0.075 | $0.60 | price trackers, not Groq's own page (unreachable from here); verify before deciding |
| gpt-oss-120b on Cerebras | $0.35 | not found | $0.75 | price trackers |
| MiniLM (ours) | $0 | $0 | $0 | runs on our server |

The app never hard-codes a price; production uses the `JARVIS_PRICE_*` settings, which this chat can't read.

## 4. What the tests show so far

**Chat, measured on 2026-11-07** (real calls, 18 questions, same student, same prompt and tools):

| | gpt-5.5 | gpt-oss-120b (Groq) | qwen3.8-27b (Groq) | gpt-5.4-mini |
|---|---|---|---|---|
| Facts right | 13 of 18 | no answers | no answers | not tested in chat |
| Right tools | 16 of 18 | 1 of 2 tried | 0 of 18 | not tested |
| Errors | 1 of 18 (passed on retry) | 2 of 2 (too large) | 18 of 18 (too large) | not tested |
| Speed, total median / p90 | 5.1 s / 8.3 s | not measured | not measured | not tested |
| Tokens per message | 19,439 in (70% cached), 449 out | | | |
| Cost per 1,000 messages | about $49 | | | |
| **Cost per correct answer, retries included** | **about $0.072** (estimate from the measured cost, 19 calls for 18 answers, 13 correct) | | | |

gpt-5.5's real problems (measured): it calls more tools than needed (over budget on 7 of 18), uses em dashes, and missed a fact on 5 of 18.

**Purchase sorting, measured** (48 unknown purchases, test half): gpt-5.4-mini 37 right, 11 wrong, 0 unsorted; our local model 10 right, 5 wrong, 33 unsorted. gpt-5.4-mini wins and stays. The 3-call run cost about $0.008 (3,013 in, 1,333 out), 4.8 s, 3.2 s and 1.4 s.

**Memory picking, measured:** recall 0.70 → 0.82 with the local model, no wrong memories added, 42 ms for 25 memories. The local model wins.

**Tool choosing, measured:** the local model lost to today's word rules. Word rules stay.

## 5. Same tasks, same context, same tools?

- **Chat (2026-11-07): yes.** Same made-up student, the same 18 questions through the real assistant loop (`scripts/compare-models.ts`), the same prompt and tools. Only the provider changed. But the open models never finished, so the comparison has one side.
- **Purchase sorting: yes.** The same 87 purchases and category names for both.
- **Memory and tools: yes**, the same labelled cases, split into a half to tune on and a half to report on.
- **gpt-5.4-mini in chat: not tested** on the whole eval. Today it only gets the turns `effort.ts` marks as low.

## 6. What could move to the cheaper model

**Safe now (measured):**
- Memory picking → our local model (free). Waiting for the owner's yes to turn on `LOCAL_MODEL_MEMORY`.
- Purchase sorting stays on gpt-5.4-mini.

**Likely, but only after a try-out (not tested):** read-only lookups whose facts come from our code: "what's due", "what's on today", hours this week, "when did I last pay X", subscriptions. The numbers come from tools, so the model only words them. 3 of the 12 eval questions already go to gpt-5.4-mini (due, work, todo).

**Stay on gpt-5.5:**
- Planning across several things (week plans, "help me catch up", finding study time).
- Anything that writes several records at once (a whole schedule, imports).
- Reading photos, PDFs and emails.
- Money conversations that need careful wording (the verdict is our code, the explanation is the model).
- Academic-integrity cases: gpt-5.5 still failed one, so a weaker model is a risk there.

## 7. Are we still sending 22,000 to 38,000 input tokens per answer?

**Measured today** (real request bodies, OpenAI's tokenizer):

| | Per model step | Per answer (2 steps) |
|---|---|---|
| A new chat | 8,056 to 14,019 (median about 10,000) | 16,259 to 27,634 (median 20,396) |
| The 9th to 12th question of one long chat | up to 26,353 | up to 52,462 (mean over the chat 37,811) |

So in a fresh chat we're below the old range; in a long chat we're still in it, and above it at the end. Where a step's tokens go (new chat): the fixed rules (INSTRUCTIONS) 4,223; the per-person context 180 to 380; tools 3,500 to 9,000; the question and tool results 30 to 1,250.

**Why long chats grow:** every earlier tool call stays in the history and keeps its tool group on the list, so the 9th question carried 80 tools (17,640 tokens) instead of 35 (7,024).

**What we can cut:**
1. **Old tool steps out of long chats (built on `claude/long-chat-trim`, owner's yes, its own gate).** `keepRecentToolSteps` (src/server/jarvis/history-trim.ts) keeps every earlier message and answer, and keeps tool steps for the last two turns only, so "ok, book the second one" still works. Measured on the same 12-question chat: mean per answer 37,811 → 25,273 (−33%), worst 52,462 → 33,078, and the long chat never goes above 43 tools. New chats are unchanged. All 781 unit and assistant tests pass.
2. **Shorter tool definitions (not built).** Of the tool tokens, about 75% are the parameter schemas (12,233 of 16,248 in the 80-tool list). The biggest: `set_up_schedule` 1,018, `create_tasks` 566, `update_event` 501. Trimming the wording inside them could cut about a quarter of the tool tokens. This changes what the model reads, so it needs the eval run again.
3. **Fewer groups per question (not built).** "Find 2 hours to study" and "what's due" get 30 tools (about 9,000 tokens). Tighter word rules could halve that.
4. **INSTRUCTIONS (4,223) is already cached** after the first call (90% off on gpt-5.5), so cutting it saves little.

## 8. Monthly savings, based on our usage

**We can't read production usage from this chat** (`ai_usage`, Admin › App › AI use). What we know: the app has no users yet, quiet days cost under $2 and days we test with the real model cost $12 to $16.

**Per answer (estimate**: measured tokens, 70% cached as measured on 2026-11-07, 449 output tokens, prices above):

| | New chat | Long chat today | Long chat with the trim |
|---|---|---|---|
| gpt-5.5 | $0.051 | $0.083 | $0.060 |
| gpt-5.4-mini | $0.0076 | $0.012 | $0.009 |
| gpt-oss-120b (Groq) | about $0.0023 | about $0.004 | about $0.003 |

**Per active student, 10 answers a day (300 a month)**, with today's mix (3 in 4 answers on gpt-5.5, half the answers in long chats):

| | Per student per month |
|---|---|
| Today | about $15.75 |
| With the history trim | about $13.05 (saves about $2.70, −17%) |
| Everything on gpt-5.4-mini (quality not tested) | about $2.50 |
| Everything on gpt-oss-120b (quality not tested) | about $0.75 |

A student pays $5.99. At 10 answers a day, gpt-5.5 alone costs more than that, so the price only works if most turns move to a cheaper model or students ask less. At 3 answers a day the same mix costs about $4.70 today and $3.90 with the trim.

**For the owner's bill now (estimate):** a $12 to $16 testing day is roughly 170 to 300 gpt-5.5 answers. If most are in long chats, the trim saves about $2 to $4 a testing day.

## Recommendation: use both

1. **Keep OpenAI for the chat now.** No open chat model has finished a single answer for us, so there is nothing measured to switch to.
2. **Owner's yes (free to run), given 2026-11-12:** the history trim (−33% in long chats, `claude/long-chat-trim`) and the local model for memory picking (`claude/local-models`).
3. **Owner's yes (paid, about $3):** one try-out on the 18-question eval with gpt-5.5 (a fresh baseline), gpt-5.4-mini on every question, and gpt-oss-120b. About 44 calls a model; estimated cost $1.00 + $0.15 + $0.05, under $3 with reruns. `scripts/compare-models.ts` has all three ready (`--model openai`, `openai-mini`, `groq-oss`). The Groq run needs a paid Groq tier: the free tier's 8,000 tokens a minute is below even our smallest request (8,056).
4. **After the try-out:** move the read-only lookups that pass to the cheaper model, then trim the tool definitions with the eval re-run.
5. **Later (level 2, after the 10-student test):** fine-tuning or hosting our own chat model, as ADR 0023 says.

## What changed because of this report

Nothing live. The history trim and the free request-size measurement are on `claude/long-chat-trim`; the token counter and `openai-mini` as a try-out candidate are on `claude/local-models`.

## The paid try-out (2026-11-12, owner's yes through the COO: about $3, stop above $5, one pass)

Same made-up student, the same 20 questions (the 12 eval questions and 8 hard ones) through the real assistant loop (`scripts/compare-models.ts --once`), each model on every question, no retries. Every call was priced from its own `ai_usage` row with the published prices. Raw answers, calls and costs: `docs/backlog/2026-11-12-tryout-results.json`.

**Real total spent: $1.41** ($1.19 gpt-5.5, $0.20 gpt-5.4-mini, $0.0086 for the one-question pilot, $0 for the Groq calls Groq refused). The $5 cap held as a hard stop before every turn.

**gpt-oss-120b was skipped, as agreed:** Groq's free tier refused every request as too large (requests of 8,898 and 14,830 tokens against its 8,000-a-minute limit). It needs the paid Dev tier on the owner's Groq account. Nothing was signed up for.

| Measured | gpt-5.5 | gpt-5.4-mini |
|---|---|---|
| Model calls | 45 | 47 |
| All automatic checks pass | 6 of 20 | 4 of 20 |
| Facts found by the automatic check | 11 of 20 | 7 of 20 |
| Right tools | 17 of 20 | 17 of 20 |
| More tool calls than needed | 4 | 5 |
| Wrote something it shouldn't | 1 (the integrity case saved a duplicate essay again) | 0 |
| Errors | 0 | 0 |
| First word, median / p90 | 2.5 s / 5.3 s | 2.6 s / 6.4 s |
| Whole answer, median / p90 | 3.7 s / 7.9 s | 3.7 s / 8.6 s |
| Input tokens (cached share) | 493,050 (63%) | 522,981 (67%) |
| Output tokens | 4,038 | 9,733 |
| Cost per question | $0.059 | $0.0099 |
| Cost per fully passing answer | $0.198 | $0.050 |

**Read with care.** The automatic fact checks are partly out of date: on "afford", "subscriptions", "work" and "hardest" both models miss the same numbers, and their answers quote the current tools' real figures instead ($842.17, −$498, $1,113.37 in bills, 15.5 hours, 8.5 and 7.2 hours). So "facts" undercounts both. Read side by side, the two models answer the same lookups with the same numbers and the same length.

Where they really differ:
- **gpt-5.4-mini:** one real mistake on the hardest money question. Asked "can I still afford groceries", it said "groceries look fine" from the $842.17 balance, ignoring that this week's bills are larger. It also writes more output tokens.
- **gpt-5.5:** on the integrity case it refused the essay but saved a duplicate assignment again (the bug in the 2026-11-07 report, still open). On "anything overdue?" its answer was weaker.
- Both: over the tool budget on money summaries and the multi-part question.

**What it says:**
- On read-only lookups, gpt-5.4-mini answers as well as gpt-5.5 at about a sixth of the cost, with the same speed. Moving those (what's due, today, hours, last payment, subscriptions, hardest day) to the small model is supported by this run, pending the COO's review.
- Money reasoning across several facts stays on gpt-5.5, and so does planning.
- Next, free: refresh the eval's answer checks to today's tool outputs before the next run, so the automatic score is trustworthy.
- Next, paid: an open model needs a paid Groq tier (owner's account) or another host.

