# ADR 0005 — Memory: user approval, basis, corrections, relevance retrieval

**Status:** accepted (2026-10-27)

**Context.** Jarvis used to write memories directly, and every active memory went into every prompt. That made memory easy to poison (a note or email could get Jarvis to "remember" something), mixed facts the user stated with Jarvis's guesses, lost history on corrections, and sent unrelated personal details with every request.

**Decision**
- **Suggest, then approve.** `save_memory` / `update_memory` create `proposed` rows that the model never sees. The user taps Keep (→ `active`, `confirmed_at` set) or Not now (→ `rejected`, so it isn't suggested again for 180 days).
- **The one exception is checked on the server.** A memory is saved immediately only when the user's own message for this turn explicitly asks ("remember…", "don't forget…", "update your memory…") and the basis is `stated`. `explicitMemoryRequest()` reads `ToolContext.userText`, never the model's claim or tool output. It is deliberately conservative: unclear cases become suggestions.
- **Basis.** `stated` (the user said it) vs `inferred` (Jarvis concluded it). Inferred memories always need approval and are labelled in the prompt as "inferred, approved".
- **Corrections keep history.** A correction inserts a new row with `supersedes_id`, and approving it archives the old one. "Forget" archives rather than deletes. Settings can restore either, and only the user can permanently delete.
- **New `instruction` category** for how the user wants Jarvis to behave. Instructions are always sent.
- **Relevance retrieval** (`src/server/jarvis/memory-retrieval.ts`) works as follows:
  - It does deterministic lexical scoring (stemmed tokens, idf over the user's own memories) and topic matching: the current message counts in full, the previous message's topics count for follow-ups, and the module Jarvis was opened from counts as a weak nudge.
  - Limits are ≤12 memories and ≤2,400 characters, and the prompt says how many were left out. `list_memories` reaches the rest.
  - Labelled fixtures in `tests/unit/memory-retrieval.test.ts` are the regression baseline (currently recall 100%, no forbidden memory included).
  - Embedding-based retrieval can replace the scorer behind the same signature, and is accepted only if it scores at least as well on those fixtures.
- **Controls.** Users can turn suggestions off (`preferences.memorySuggestions = false`); explicit requests still work. At most 10 suggestions can be pending at once.

**Consequences.** One extra tap to save most memories. In exchange, nothing about the user becomes "true" without their approval, prompt injection can at most create a visible suggestion, and the prompt is smaller and more focused. Lexical retrieval misses paraphrases with no shared words or topics; the fixtures make that measurable.
