# ADR 0033: The north star

Date: 2026-11-08. Status: accepted (owner's direction, 2026-11-08). Recorded in `docs/plan-v2.md` ("North star").

## Why
LifeFlow must not feel like another AI assistant. Its own category is a life, connected, on one screen, that helps with the tiny everyday decisions before they happen.

## Decision
- The product is the connected facts first and the assistant second. Everything must be useful with no AI.
- `services/tonight.ts` is the first piece: the next 24 hours from the person's own records (what is due, shifts and events, free hours before 11 PM, cash minus bills due this week unless Money is locked) and, for a plan the person gave, what it costs in the same units. No AI, no guesses; it states what it assumes.
- The assistant's instructions open with what it is for (the small decisions, the trade-off in plain numbers from their records, one friendly take, one action offered, never a lecture) and tell it to call `tonight` first. It never invents a number: it asks for a price or a length of time.
- The `tonight` tool is read-only, in the core group, and leaves money out when Money is locked.

## Next (held for the owner's okay on a picture)
A "Tonight" card on Today, one notification before the decision, a widget, a watch glance. Each shows only what is connected and says what isn't ("Connect your shifts to see this").

## Not decided
Wake and bedtime are fixed at 11 PM for now. Calories and sleep join the card when health data is connected.
