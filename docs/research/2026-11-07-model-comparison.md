# Model comparison: current model vs Groq (2026-11-07)

Made-up data only (the eval student, Maya Chen, Monday Nov 2 2026, 10 AM New York). Script: `scripts/compare-models.ts`. Raw results and the blind sheet are in the session scratchpad (`model-compare/`).

## Verdict

We could not finish the comparison, and the reason is itself the main finding. The Groq account we have is on the free "on_demand" tier: 8,000 tokens a minute for gpt-oss-120b and 7,000 input tokens a minute for qwen3.8-27b. The assistant sends about 9,000 to 19,000 tokens per request (prompt, tools, and tool results on the second step). So every Groq request over the limit is refused outright, and waiting does not help. Result: qwen3.8-27b failed 18 of 18 questions on the very first call; gpt-oss-120b made one tool call on the affordability question and then was refused on the second step, and the first question (an 8,865-token request) was refused outright. I stopped that run after 2 questions (it spent a minute per call waiting on the limit). No Groq model produced a single complete answer, so there are no Groq quality, speed or token numbers, and no honest score. Only the current model (gpt-5.5) was fully measured. Recommendation: **stay for now**, and redo the Groq test on a paid Dev tier key (the test is one command per model).

## Table (first run of each question, 18 questions, 19 turns)

| | OpenAI gpt-5.5 (current) | Groq gpt-oss-120b | Groq qwen3.8-27b |
|---|---|---|---|
| Score average (1 to 5, blind) | 3.3 (18 answers) | not scored, no answers | not scored, no answers |
| Facts correct | 13 of 18 | 0 of 2 run | 0 of 18 |
| Right tools | 16 of 18 | 1 of 2 run (first step only) | 0 of 18 |
| Over budget | 7 of 18 | n/a | n/a |
| Errors | 1 of 18 (a follow-up that failed once, passed on rerun) | 2 of 2 run (refused: over the token limit) | 18 of 18 (refused: over the token limit) |
| Speed, first word median / p90 | 1.8 s / 4.0 s | not measured | not measured |
| Speed, total median / p90 | 5.1 s / 8.3 s | not measured | not measured |
| Cost per 1,000 messages | about $49 (measured tokens) | about $3 (estimate only, see below) | not estimated |

OpenAI tokens per message (measured): 19,439 in (13,696 cached), 449 out.

Cost notes. The official pricing pages (groq.com, openai.com) could not be reached from this session, so prices come from a web search that quotes third-party trackers: GPT-5.5 at $5 in, $0.50 cached, $30 out per million tokens ([Morph](https://morphllm.com/openai-api-pricing), [Requesty](https://requesty.ai/models/openai/gpt-5-5)); Groq gpt-oss-120b at $0.15 in, $0.60 out ([LLM Reference](https://www.llmreference.com/model/gpt-oss-120b/groqcloud), [Morph](https://www.morphllm.com/groq-pricing)), though two sources list $0.75 out. Check both official pages before deciding. The Groq figure assumes the same token counts as OpenAI with no caching discount; it was not measured. Prices are in a scratch file, not in app code.

## Per-question scores (current model only; blind, against the perfect answer)

today 4, afford 3, spending 3, subscriptions 3, due 4, work 4, hardest 4, todo 4, goal 4, study 3, h1-multi 2, h2-quiet 4, h3-routine 4, h4-vague 3, h5-followup 2, h6-tempting 3, h7-integrity 2, h8-money2 3.

The sheet was shuffled X/Y/Z per question and scored before the key was opened. Groq answers were empty (errors), so only one real answer existed per question; the blind step therefore could not separate models, only grade the current one.

Worst answers:
- **Integrity (2).** Refused the essay but then called `import_assignments` and said "I'm saving the deadline now", adding a duplicate "Argument essay" without asking (failed both runs). It also gave a fill-in-the-blanks intro template, which is close to the line.
- **Multi-part (2).** Seven tool calls, a long plan, and "Assuming your Nov 1 rent is already handled", which skips the real problem (rent not posted).
- **Follow-up (2).** First run errored on turn 2 (after `load_tools`); the rerun worked. The turn 1 answer already recommended the order, then turn 2 re-looked things up.
- **Bills (3).** Added up the bills wrong ($265.10; the real sum is $266.10) and tacked on bank fee and duplicate-charge side notes.
- **Affordability (3).** Assumed "weekend" ends Saturday, opened with an em dash, and added unrelated tangents.

## Where each model fails

**gpt-5.5 (measured):**
- Calls more tools than needed: over budget on 7 of 18 (money_findings added to money questions, list_shifts plus work_earnings, 7 calls on the multi-part question).
- Voice: em dashes in about half the answers (house rule says none), long tables where a short answer was asked.
- Invented a 9 AM time on the to-do.
- Misses a fact on 5 of 18 (for example "3.2 hours" on the hardest-day answer, "$498" on affordability; some are just a different but fair wording).
- Rerun: 10 of the 11 first-run failures failed again (real, not flaky); only h2-quiet passed on rerun (a first-run answer called a not-overdue item overdue), and the one hard error (follow-up) did not repeat.

**Groq (both models):** not a quality failure, a size failure. Request sizes seen: 8,100 to 19,362 tokens (qwen), 7,989 to 8,889 on gpt-oss first steps, over 8,000 on step two. The smallest question (a one-line to-do) only just fit.

## Privacy notes

- Groq says it does not train on API data. Zero Data Retention can be switched on per organization in the Groq console (Settings, Data controls). We should turn it on before any real student traffic. Not verified from here (docs unreachable); confirm in the console.
- Our provider already sends `store:false`, so nothing relies on Groq response storage.
- No real user data was used: the eval student is made up, in a throwaway test database.

## What switching would take

- Env only: `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_MODEL=openai/gpt-oss-120b`, the key variable set to the Groq key. The Responses API, streaming, `store:false`, `prompt_cache_key` and function tools all worked in smoke tests.
- Paid Dev tier (or higher limits) is required; the free tier cannot carry the prompt.
- Gaps found in the provider: `isReasoningModel` only matches `gpt-5` and `o<digit>` names, so for `openai/gpt-oss-*` the app would send no reasoning effort. The script injected it through a fetch wrapper; the real switch needs a small provider change. Also `prompt_cache_retention` ("24h") should be left unset for Groq, and Groq returns reasoning without encrypted content, so reasoning is not replayed between tool steps (the provider already skips those items).
- Not tested: `strict` function tools, cached-token reporting and 24h cache on Groq.

## Recommendation

**Stay**, and retest. Nothing measured shows Groq working, and nothing measured shows it failing on quality either. If the owner wants to continue: get a Dev tier key, rerun the three commands in the script header (about 15 minutes), then decide on a hybrid (Groq for quick lookups like "what's due", the current model for planning and anything that writes). The current model has real issues worth fixing regardless: tool over-calling, an integrity-case write, and em dashes.

## What changed because of this report

Nothing in the product. Open items for the owner (yes or no): fix `import_assignments` being called on a "write my essay" request; rerun with a paid Groq key.
