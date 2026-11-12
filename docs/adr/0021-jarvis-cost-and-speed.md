# ADR 0021: Jarvis cost and speed — tool groups, prompt caching, auto thinking

Date: 2026-11-01. Status: accepted.

## Context

Every Jarvis request sent all 105 tool definitions, about 16,400 tokens. That was more than 7 times the instructions (about 2,100 tokens). Each extra model step sent them all again.

Most of the bill and the wait before the first word came from tools the question didn't need.

The reasoning level was one fixed setting for every request. Quick lookups paid for thinking they didn't need, and real decisions didn't get more.

## Decision

### 1. Tool groups

- **Groups (`jarvis/tool-groups.ts`).** Tools are in fixed groups: core, school, calendar, money, money_edit, savings, work, notes, email, health, habits, projects and memory. Core is always sent. It holds the to-dos, the daily briefing, memory saving, web search and `load_tools`, about 3,000 tokens.
- **Selection (`jarvis/tool-select.ts`).** Other groups are added only when one of these calls for them:
  - the page Jarvis was opened from;
  - the routed skills' tools;
  - words in the message;
  - tools this chat already used.

  Plain dates ("Friday", "this weekend") don't add the calendar; the briefing covers a day. `money_edit` comes only with a change word (add, change, categorize, track, …). A file or photo gets every group.
- **`load_tools`.** If the model finds a tool missing, it calls `load_tools` and the agent adds the group for the rest of the turn. The prompt says to check before ever saying "I can't".
- **Order.** `toolSpecsFor` gives the same groups in the same order every time. OpenAI caches a prompt by its exact start, and a changed tool list misses the cache.
- **Result.** On the 10 eval questions, the tools sent average 28% of the full list. `tests/integration/jarvis-eval.test.ts` checks that every planned tool is still sent and that each request stays under half.

### 2. Prompt caching

- **Cache key.** Each request carries `prompt_cache_key`, a per-user SHA-256 hash, never the id itself. One person's requests then land on the same cache, including the second step of a turn, which repeats the whole first prompt.
- **24-hour retention.** `prompt_cache_retention: "24h"` is sent where the model supports it. If OpenAI refuses the parameter, the provider retries once without it and stops sending it for that model.
- **Instructions.** `INSTRUCTIONS` stays static (ADR 0006), so the start of every prompt is shared.

### 3. Auto thinking (`jarvis/effort.ts`)

`OPENAI_REASONING_EFFORT` defaults to `auto`. Each turn picks one level:

- **Low:** lookups and adds ("what's due", "add a to-do", hours this week).
- **Medium:** advice, decisions and plans. That means planning and money-decision skills, or words like "should I", "can I afford", "on track", "plan my", "find me 2 hours".
- **High:** attached files, very long requests, or whole-semester or multi-week plans.

A fixed level in the environment still wins. The level stays the same within a turn, because changing it also misses the cache.

## Consequences

- Smaller requests and cached starts: cheaper, and a faster first word.
- A new tool must be added to a group in `GROUP_TOOLS`. A unit test fails if a tool is in no group or in two.
- A missed group costs one extra step (`load_tools`), not a wrong answer.
- Voice still sends all tools (Realtime sessions are set up once), minus `load_tools`.

## Addendum (2026-11-12): the long-chat trim and the cache

`keepRecentToolSteps` (src/server/jarvis/history-trim.ts) sends earlier turns' words but only the last two turns' tool steps; a step that saved or changed something leaves one line with its outcome, a confirm card says what really became of it (from `pending_actions`), and a turn that ended without an answer is never trimmed. The tool groups are picked from the trimmed history, so a group used early in a chat can leave the list and come back, which breaks the cached start of those requests.

Chosen: the smaller list. Measured free on the 12 eval questions in one chat (request bodies from `tests/integration/request-size.test.ts`, OpenAI's tokenizer, OpenAI's documented prefix cache, gpt-5.5's published $5 and $0.50 per million):

| | Input tokens | Cacheable | Input cost per answer |
|---|---|---|---|
| No trim | 465,928 | 72.2% | $0.0679 |
| Trim, groups from the trimmed history (chosen) | 315,699 | 68.5% | $0.0505 |
| Trim, groups from the whole history | 408,776 | 75.4% | $0.0548 |

The cache share drops a little, but the requests are a third smaller, so each answer costs less. Revisit if real `ai_usage` rows show a lower cached share than this.
