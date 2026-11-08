# Plaid and Microsoft check, 2026-11-08

Engineering read the code against the rules in CLAUDE.md and ran the tests with fake Plaid and fake Microsoft. Nothing real was called.

## What works (tested)

Plaid:
- Link token for transactions only, with the webhook address from APP_URL. Update mode for Reconnect and for Choose accounts.
- The token is stored encrypted. The item is registered for webhooks.
- Sync: accounts, cursor based transactions (added, changed, removed), pending replaced by posted, the user's own category kept.
- Turned off accounts stay archived through every sync, their bank data is removed, and turning one on starts the cursor over.
- Accounts the bank stops sharing are archived and their bank data removed.
- Investments and liabilities are asked for only when the item has those account types. A problem with them never fails the sync. A sign-in-again error does.
- Sync now asks for live balances and falls back to the saved copy.
- A sign-in-again error marks the connection "error" with a Reconnect message, and that status stays.
- Webhooks must carry a valid signature. Disconnect removes the item at Plaid and the synced data here.
- The sync cron (every 30 minutes) runs every connection and records failures on the connection.

Microsoft:
- Read-only calendar scope, PKCE and state, one pinned redirect address.
- Code exchange, refresh with the rotated token kept, a retry on a 401, paging, Teams join links, all-day events, deleted events removed, disconnect removes tokens and events.
- A school that blocks consent shows: "Your school or workplace needs to approve LifeFlow before you can connect..." with the screenshot fallback.

## What I fixed

1. Microsoft: if Microsoft answered a refresh with "interaction_required" or "consent_required" (a password change, a new sign-in rule), the person was told "Couldn't reach Microsoft right now" with no Reconnect. Now it is treated like a removed access and shows Reconnect.
2. Plaid: an account the bank stopped sharing and then shared again came back with no history, because the cursor had moved on after we removed its data. The cursor now starts over when such an account returns.
3. Plaid: if an investment account was emptied (everything sold), its old holdings stayed forever. Now every shared investment account is refreshed, so empty means empty.

Each has a test that failed first. New tests also cover: a temporary Microsoft problem does not ask for Reconnect, the 401 retry, and a problem with the investments product.

## What is left (not fixed, suggestions)

- The cron still syncs connections that already need a sign in. Each run writes a failed sync record every 30 minutes. Suggest skipping connections with status "error" until Reconnect.
- The Microsoft cron path does not record non-sign-in failures on the connection (Plaid does). The user sees no reason if Graph keeps failing.
- After Reconnect, a Plaid connection shows "error" until the next sync. The LOGIN_REPAIRED webhook is not handled. Suggest handling it with a sync.
- NEW_ACCOUNTS_AVAILABLE is not handled (the user can use Choose accounts).
- Two syncs at once (cron and webhook for the same item) are not locked. A duplicate insert could fail one of them. It is rare and the next sync repairs it.
- A cursor mutation error from Plaid in the middle of paging (TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION) is not retried from the start. The next sync fixes it.
- The callback route's mapping of Microsoft error codes to messages has no automated test.
- A bank account the user archived by hand is brought back by the next Plaid sync.

## Owner steps still needed

Plaid Production:
1. In the Plaid dashboard, request Production access and finish the application (company profile, use case, security questionnaire).
2. Ask for the Transactions product. Investments and Liabilities are only needed for holdings and debt details; they cost extra and the app asks for them only when a bank has those accounts.
3. In Vercel set PLAID_ENV=production, PLAID_CLIENT_ID, and PLAID_SECRET to the Production secret (not the Sandbox one).
4. In the Plaid dashboard, add the allowed redirect address and set PLAID_REDIRECT_URI to the same value. Banks that sign in through their own app need this.
5. Set APP_URL to the live site address so the webhook address is right (/api/integrations/plaid/webhook).
6. Make sure CRON_SECRET is set in Vercel so the 30 minute sync can run.
7. Connect one real bank once and check the first sync.

Microsoft:
1. In Microsoft Entra (portal.azure.com), App registrations, New registration. Name it LifeFlow.
2. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts". The app uses the "common" address, so a single tenant app will not work.
3. Platform: Web. Redirect URI: your APP_URL plus /api/integrations/microsoft/callback.
4. API permissions, Microsoft Graph, Delegated: Calendars.Read, User.Read, offline_access, openid, email, profile. You do not need to grant admin consent.
5. Certificates and secrets: create a client secret and copy its Value right away.
6. In Vercel set MICROSOFT_CLIENT_ID (the Application client ID) and MICROSOFT_CLIENT_SECRET (the secret Value). Redeploy. MICROSOFT_TENANT stays unset (it defaults to common).
7. For schools that block student consent, publisher verification of the app helps. Without it, those students see the plain "ask your school" message.
8. Connect one personal Microsoft account and one school account once and check Plan.
