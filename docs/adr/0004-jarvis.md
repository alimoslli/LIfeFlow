# ADR 0004 — Jarvis: tool-calling agent over domain services

**Status:** accepted

**Decision**
- Jarvis is an agent loop (`src/server/jarvis/agent.ts`) over a registry of typed tools (`tools/*.ts`). Each tool has a zod schema (converted to JSON Schema for the model), a `mutates` flag, an optional `confirm` step, and an `execute` that calls the **same services the UI uses**.
- Provider-neutral interface (`providers/types.ts`). Production uses the **OpenAI Responses API** with streaming, parallel tool calls, and `store: false`; encrypted reasoning items are replayed within a turn for reasoning models. Model, reasoning effort and base URL come from env vars.
- Our database is the source of truth for conversation history (messages + tool calls/results), so conversations survive restarts and could switch providers.
- Destructive tools (delete task/assignment/event/note) never run directly: they create a `pending_action` and the UI shows Confirm/Cancel. Only the user's request to `/api/jarvis/actions/:id` executes it.
- Memory is explicit (`save_memory` and the Settings page), rejects secrets, supports expiry, and is injected into the system prompt with user preferences.
- Tool results are reported verbatim in the UI ("Saved 2 assignments · 1 needs a course"), so the UI shows what actually happened even if the model's wording is wrong.

**Testing:** a deterministic `ScriptedProvider` drives the loop in integration tests. E2E tests run the real OpenAI SDK against a local server that speaks the Responses streaming format.

**Voice later:** the agent emits transport-agnostic events; a voice front end can reuse the loop and tools unchanged.
