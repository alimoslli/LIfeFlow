# 0017: Text Jarvis over SMS (Twilio)

Date: 2026-10-30. Status: accepted (ready; turns on when the owner adds a Twilio number).

## Decision
- **Same Jarvis:** an incoming text runs `runJarvisTurn` in the user's SMS conversation, with the same tools, memory, skills and integrity rules as the app.
- **Linking:** Settings → Text Jarvis texts a 6-digit code (hashed, 10 minutes, 5 tries) to the number; only a verified number (`users.sms_phone`, unique) reaches the account. Unknown numbers get no reply.
- **Confirmations:** a confirm tool's question is texted with "Reply YES to confirm or NO to cancel"; the reply runs the shared `decidePendingAction` (also used by the app's Confirm button).
- **Money by text is off by default** (texts show on lock screens): SMS turns run with the money lock on unless the user turns "Money details by text" on.
- **Webhook:** `/api/sms/inbound` checks Twilio's signature over `APP_URL` + path, rate-limits per number (30/hour), answers Twilio immediately and replies after (`after()`), sending through the REST API. A text is only reported as sent with Twilio's message id.
- **Hidden until configured:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` and `APP_URL`.

## Later
WhatsApp (Meta Business, approved templates) and phone calls can use the same `answerText` entry point.
