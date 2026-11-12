# The long-chat trim (2026-11-12)

Owner's yes through the COO (2026-11-12, "yes do all"): ships only on its own gate, with the full assistant eval and the skill evals passing on the fake model and a case for a question that refers back to something saved or looked up turns earlier.

## The problem (measured, free)

`tests/integration/request-size.test.ts` runs the real assistant loop on the 12 eval questions (the made-up student) and records the real OpenAI request body, against a fake model that answers with each question's own tool plan. Counted with OpenAI's public tokenizer (`scripts/local-models/request-tokens.mts` on `claude/local-models`):

- A new chat: 16,259 to 27,634 input tokens per answer (median 20,396).
- The same 12 questions in one chat: mean 37,811 per answer, the last ones up to 52,462. Every earlier tool call stayed in the history and kept its tool group on the list, so the 9th question carried 80 tools (17,640 tokens) instead of 35.

## The change

`keepRecentToolSteps` (src/server/jarvis/history-trim.ts), applied in `runJarvisTurn` before the tools are picked and the model is called: every earlier message and answer stays; only the last finished turn and the current one keep their tool calls and results.

- A follow-up on the last answer ("ok and tomorrow?") still sees that lookup.
- Something saved further back is still in the chat's words, and the tools to find it again are always sent (list_tasks and update_task are in the core group), so "move that advisor to-do to Monday" four turns later looks it up and moves it (`tests/integration/history-trim-followups.test.ts`).
- A turn being continued keeps its own tool steps.
- The database keeps everything; only what is sent changes. Undo is unaffected (it reads the saved rows).

## Result (measured, free)

The 12-question chat: mean 37,811 → 25,273 input tokens per answer (−33%), the worst 52,462 → 33,078, never more than 43 tools. New chats are unchanged.

At gpt-5.5's published prices ($5 in, $0.50 cached, $30 out per million) and 70% cached, a long-chat answer goes from about $0.083 to $0.060 (estimate).
