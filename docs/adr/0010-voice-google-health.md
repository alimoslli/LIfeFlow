# ADR 0010: Live voice, Google (Gmail + Calendar) and Apple Health

Date: 2026-10-28 · Status: accepted

## Context
The owner asked for a live voice conversation with the assistant (voice selectable), and for the assistant to have access to their Gmail, Google Calendar and Apple Health. Constraints from the owner: the OpenAI key never reaches the browser, nothing is sent without confirmation and provider success, third-party content is untrusted, and nothing is faked.

## Decisions

### Voice: OpenAI Realtime over WebRTC
- The server mints a short-lived client secret (`client.realtime.clientSecrets.create`, 120 s) with the assistant's instructions, tools and chosen voice baked in. The browser uses only that ephemeral key to open the WebRTC call; the real API key stays on the server.
- Tool calls arriving on the data channel are relayed to `/api/jarvis/voice/tool`, which runs them through the same `executeToolCall` as typed chat. Confirmation-gated tools (delete, send email, add Google event) produce the same pending action and Confirm card.
- Transcripts (text only, no audio) are saved to the conversation, and each call records a `jarvis_runs` row (`provider = openai-realtime`). Calls are capped at 15 minutes.

### Google: OAuth (PKCE + state) and plain REST
- Scopes: `openid email gmail.readonly gmail.compose calendar.events`. The callback requires a refresh token and every scope; otherwise it reports what was missing.
- Tokens are AES-GCM encrypted in `integrations` (`ENCRYPTION_KEY`). An `invalid_grant` on refresh marks the connection `error` in its own transaction, so the UI asks to reconnect.
- Gmail: search and read (wrapped as `<untrusted_email>`), drafts saved to Gmail, sending only after Confirm and reported only with Gmail's message id. Header values are stripped of CR/LF.
- Calendar: a mirror of the past 7 to next 60 days in `calendar_events` (`source = google`); adding an event needs Confirm. Disconnect revokes the token and removes mirrored events.
- Gmail scopes are "restricted": fine in Testing mode for the owner; a public launch requires Google verification and a security assessment.

### Apple Health: the user's own iOS Shortcut
- Apple offers no web API for HealthKit; only native iOS apps can read it. Building a native app needs the Apple Developer Program and App Review, so for now the user's Shortcut POSTs daily totals to `/api/apple-health/ingest`.
- Auth is a personal key (`lfh_...`, 192 bits) shown once; only its SHA-256 is stored (`health_tokens`, looked up before a user context exists, like sessions). Keys can be revoked; at most 5 active. Requests are rate-limited per key.
- `health_samples` holds one value per metric per local day (RLS + FORCE). Re-sending a day replaces it. Values are parsed leniently (Shortcuts sends "8,532"), converted (lb → kg, mi → km, minutes → hours) and range-checked; unknown fields are reported back, not stored.
- The assistant reads it with `get_health_summary` and is told never to diagnose.

## Consequences
- Nothing here is verified against the live providers from the build workspace (no network access to them). Tests use a fake Google and a fake OpenAI; live verification happens after deployment with real credentials.
- A native iOS app (HealthKit background delivery) can later replace the Shortcut and reuse `ingestHealth` unchanged.
