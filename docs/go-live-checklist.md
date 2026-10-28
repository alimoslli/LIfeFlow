# Go-live checklist (owner)

Everything below is already built in the code. These are the settings to add so it connects for real.
Never paste these values into code, chat, or GitHub. They go only in Vercel.

## 1. Vercel environment variables
Vercel → project → Settings → Environment Variables, then Deployments → ⋯ → Redeploy.

| Variable | What to put |
|---|---|
| `ENCRYPTION_KEY` | Run `openssl rand -base64 32` in Terminal, paste the result. Needed for Google and two-step sign-in |
| `OPENAI_API_KEY` | Your OpenAI key (chat and voice) |
| `APP_URL` | Your site, e.g. `https://yoursite.vercel.app` (no trailing slash) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 2 |
| `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_STATE` | Your name, contact email, US state (shown on /privacy and /terms) |
| `OPENAI_REALTIME_MODEL` | Optional, default `gpt-realtime` |

Database migrations run automatically on deploy.

## 2. Google Cloud (console.cloud.google.com)
1. New project → APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen → External → name LifeFlow → Privacy `https://yoursite/privacy`, Terms `https://yoursite/terms` → scopes `gmail.readonly`, `gmail.compose`, `calendar.events` → keep **Testing** → add your Gmail as a **test user**.
3. Credentials → Create OAuth client ID → Web application → redirect URI `https://yoursite/api/integrations/google/callback`.
4. Copy Client ID and Secret into Vercel, redeploy.
5. In LifeFlow: Settings → Integrations → Connect Google (keep all boxes checked).

Testing mode may ask you to reconnect about weekly. Other users' Gmail needs Google verification.

## 3. Apple Health (iPhone)
Settings → Integrations → Apple Health → Create a key (shown once) → follow "How to set up the Shortcut" → add a daily Automation.

## 4. Check it works
- Chat with the assistant, then tap the mic for a voice call.
- Google card shows "Connected"; ask "what's in my inbox?"
- Apple Health card shows "Receiving data" after the Shortcut runs.

## Later
- Lawyer review of /privacy and /terms before other users join.
- Update git remote to `alimoslli/LIfeFlow` (GitHub redirect works meanwhile).
