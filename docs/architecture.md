# Architecture

## Overview

```
Browser (React, server-rendered pages + small client components)
   │  server actions (forms)        │  fetch /api/jarvis/chat (NDJSON stream)
   ▼                                ▼
Next.js server ──► auth (session cookie → user) ──► withUser(userId) transaction
   │                                                   │  SET app.user_id  → Postgres RLS
   ├─ pages/actions ──► services/* ◄── jarvis/tools/* ◄─┤
   │                       │                            │
   │                       ▼                            │
   │                   PostgreSQL (Drizzle)             │
   └─ jarvis/agent ──► providers/openai ──► OpenAI Responses API (server-side key)
```

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Presentation | `src/app`, `src/components` | Pages are Server Components that load data through services; forms call server actions; interactive pieces (chat, dialogs, checkboxes, charts) are small client components |
| Server actions | `src/app/**/actions.ts`, `src/server/actions.ts` | Parse form data, call a service inside `mutate()`, which authenticates, scopes to the user, audits, and revalidates |
| Services (business logic) | `src/server/services` | All reads and writes for one module. Validates input with zod. Shared by the UI and Jarvis, so both follow the same rules |
| Data access | `src/server/db` | Drizzle schema, pool, `withUser()` transaction that sets `app.user_id` for row-level security |
| Jarvis | `src/server/jarvis` | Agent loop, tool registry and definitions, executor (validation, confirmation, audit), system prompt, model providers |
| Integrations | `src/server/services/integrations.ts` (+ future `src/server/integrations/*`) | Honest status catalog now; provider clients behind service interfaces later |

## Security model

- **Authentication:** email + scrypt-hashed password. Sessions are random 256-bit tokens in an `httpOnly`, `SameSite=Lax` cookie. Only the token's SHA-256 is stored, and expiry slides daily. Login is rate-limited by IP and by email, and both failure cases take equal time.
- **Authorization, three layers:**
  1. Every request resolves the user from the session on the server. The proxy redirect is only a convenience.
  2. Services filter by `user_id` and check that referenced records (course, project, account…) belong to the user, because Postgres foreign-key checks bypass RLS.
  3. **Row-level security** is forced on every user-owned table. Queries run in a transaction with `app.user_id` set, so even an unfiltered query only sees that user's rows. Tests prove this.
- **Jarvis can't escalate:** the model only sees tool schemas. Tools run through `executeToolCall`, which validates arguments with zod and runs inside the authenticated user's RLS scope. The model never supplies the user ID. Deletions create a `pending_action` that only the user's Confirm click can execute. Unknown tools and invalid arguments return errors to the model.
- **Prompt injection:** the system prompt marks notes, files, transaction text, course text and email as untrusted data. Attachments are wrapped in `<untrusted_file>`. None of that content can change permissions, because permissions live in code.
- **Secrets:** server-only env vars (`src/server/env.ts` imports `server-only`). Integration tokens are encrypted with AES-256-GCM (`src/server/crypto.ts`). Exports strip credentials. Memory refuses passwords, keys, card numbers, SSNs, and account numbers.
- **Uploads:** 5 MB images / 1 MB text. File type comes from the file's contents (magic bytes, UTF-8 check), not the client's claim.
- **Other:** same-origin check on JSON APIs (server actions have Next's built-in origin check), security headers (`frame-ancestors 'none'`, `nosniff`…), CSV formula-injection escaping on export, audit log of sensitive actions (visible in Settings → Security).

## Jarvis turn lifecycle

1. `POST /api/jarvis/chat` → authenticate, rate-limit, validate.
2. `runJarvisTurn` creates or loads the conversation, links any attachments (only the user's own), and saves the user message.
3. Builds context: history from the DB (tool calls and results included), active memories, user preferences, the current time and a 14-day calendar in the user's time zone, and the module the user is in.
4. Calls the model with all tool schemas (streaming). For each tool call: validate → execute (or create a pending confirmation) → save the call and result → send a progress event to the UI → return the result to the model. Up to 8 steps per turn.
5. Saves the final text. Errors are saved and shown; a failure is never reported as success.

Events streamed to the browser: `conversation`, `text`, `tool_start`, `tool_end`, `confirmation`, `error`, `done`. The same event stream can drive a voice interface later.

## Dates and money

- All instants are `timestamptz`. "Today", week boundaries and due dates are computed in the **user's time zone** (`src/lib/dates.ts`, DST-tested). An assignment due date without a time means 11:59 PM local time, flagged `due_all_day`.
- Money is integer cents. Transaction amounts are signed (+ in / − out), and a `kind` decides how each one counts (see `services/finance/cashflow.ts`).

## Rendering

Pages render per request (no Cache Components; see ADR 0002), so data is always fresh after a mutation. Server actions call `revalidatePath` and the Jarvis UI calls `router.refresh()` after successful tool calls.
