# 0018: LifeFlow Pro and the App Store app

Date: 2026-10-30. Status: accepted (ready; turns on with Stripe keys and an Apple developer account).

## Decision
- **Plans:** Free keeps everything the user enters plus 15 Jarvis messages a day. Pro adds bank sync, Gmail/Google Calendar, texting, voice and unlimited Jarvis. `users.plan` is the one switch; `isPro`/`requirePro` (server/billing.ts) gate the routes.
- **Nothing is limited until Stripe is configured** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`), and the demo account is always Pro.
- **Stripe Checkout** (subscription) and the **customer portal** (card, cancel) are Stripe-hosted pages; LifeFlow never sees card numbers. Only the signed webhook changes the plan (`checkout.session.completed`, `customer.subscription.updated|deleted`).
- **App Store app:** Capacitor loads the live site (`capacitor.config.ts`, `CAP_SERVER_URL`), user agent tagged `LifeFlowApp`. Apple requires in-app purchase for digital subscriptions sold in the app, so the app hides the web checkout; in-app purchase can be added later through the same `users.plan` field.

## Owner steps
See `docs/go-live-checklist.md` (Stripe, iPhone app).
