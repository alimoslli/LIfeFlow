# ADR 0011: Passkeys, Sign in with Apple, password reset and the Money lock

**Status:** accepted (2026-10-28)

**Context.** The owner tested LifeFlow on an iPhone and asked for four things:
- Face ID sign-in
- Sign in with Apple, including Hide My Email and linking to an existing account
- an optional Face ID lock on Money
- "Forgot password"

All of it had to keep the existing rules: server-verified everything, no secrets in code, audit and rate limits.

**Decision**

- **Passkeys** (`src/server/auth/passkeys.ts`, SimpleWebAuthn v14).
  - **Storage:** only the public key, credential id, counter and transports are stored, in `passkeys`. There's no RLS, because they're looked up before a session exists, like `sessions`.
  - **Ceremonies:** registration and authentication both use **user verification required** and resident keys. That means the passkey shows up in the email field's autofill (`autocomplete="username webauthn"`) and in the "Sign in with a passkey" button.
  - **Challenges:** they live in `auth_challenges`. The browser gets a random token in an httpOnly SameSite=Strict cookie, and only its hash is stored. A challenge is taken (deleted) on use, has a purpose and lasts 5 minutes.
  - **Verification:** responses are checked against our origin and RP ID: `APP_URL`, optional `WEBAUTHN_RP_ID`, and the request origin only in development. The counter must increase, and the `userHandle` must match the stored owner.
  - **Rate limits:** per IP for sign-in and per user for registration and unlock.
  - **Audit:** `auth.passkey_added`, `auth.passkey_renamed`, `auth.passkey_removed` and `auth.login {method: passkey}`.
  - **2FA:** a passkey with user verification already combines something you have and Face ID or a device passcode. So passkey sign-in doesn't also ask for the authenticator-app code. Password and Apple sign-ins still do.
  - **Offer prompt:** after a password sign-in, a short-lived `lf_offer_passkey` cookie triggers a one-time "Use Face ID next time?" sheet. It only appears if the device has a platform authenticator and the account has no passkey yet. Declining it is remembered on the device.
- **Sign in with Apple** (`src/server/auth/apple.ts`).
  - **Flow:** the web flow with `response_mode=form_post`. A single-use state and nonce are saved server-side, and the state is bound to the browser with an httpOnly cookie. That cookie is SameSite=None because Apple posts cross-site; it's compared with a timing-safe compare.
  - **Token exchange:** the code is exchanged using a client secret (an ES256 JWT, 5 minutes) signed with the `.p8` key from env.
  - **id_token checks:** jose verifies the signature against Apple's JWKS, plus the issuer, audience, expiry and nonce.
  - **Identity:** the Apple `sub` identifies the person, stored in `oauth_identities`.
  - **New accounts:** they use the email Apple shares, which can be a Hide My Email relay (noted on the identity). The name is taken from Apple's first-time `user` field, parsed as untrusted input. These accounts have no password: `password_hash = "!apple"` never matches. People can set one later or use "Forgot password".
  - **Existing accounts:** an existing account with the same email is **never linked on email alone**. A pending link (15 minutes, bound to that account) is stored, and the person signs in to the account once by password, 2FA or passkey. Only then is Apple linked. In Settings, a signed-in person can also link or unlink Apple; unlinking needs a password, so nobody gets locked out.
  - **2FA:** if two-step sign-in is on, Apple sign-in still goes through `/login/verify`.
  - **When not configured:** without the Apple env vars, the button isn't shown.
- **Password reset** (`src/server/auth/password-reset.ts`, Resend via `src/server/integrations/email.ts`).
  - **The link:** a one-hour, single-use token. Only its SHA-256 is stored.
  - **No account discovery:** the answer is identical whether or not the account exists, including when the per-email limit is hit.
  - **Token in the fragment:** the link puts the token in the URL fragment (`/reset-password#…`), so it never reaches server logs or a Referer header. The page also sets `referrer: no-referrer`.
  - **No host-header poisoning:** links use `APP_URL` in production, never the Host header.
  - **What a reset does:** it marks the token used before changing the password, so only one request wins. Then it signs out every session and is audited.
  - **When not configured:** without `RESEND_API_KEY`/`EMAIL_FROM` the page says so, and nothing claims an email was sent. An email counts as sent only when Resend returns an id.
- **Money lock** (`src/server/auth/money-lock.ts`).
  - **Setting:** optional, in Settings → Security, and it needs a passkey.
  - **The rule:** each session has `money_unlocked_at`. Money is locked when the lock is on and the last unlock is older than the idle window (1, 5, 15 or 30 minutes). Using Money slides the window.
  - **Where it's enforced:** on the server in **every Money page** (`moneyGate()` runs before any data loads). Layouts don't re-run on client navigation, so the check isn't in a layout.
  - **Today:** its money card and money insights are hidden while locked.
  - **Jarvis:** `ToolContext.moneyLocked` makes finance and money-coach tools refuse, the daily briefing tool omits money, and confirming a pending money action returns 423.
  - **Unlocking:** a passkey assertion for that user (`passkey-unlock` challenge).
  - **No easy way around it:** turning the lock off, or removing a passkey, while locked is refused.

**Alternatives considered.**
- Emailed one-time codes instead of passkeys: phishable, and they need email first.
- A local-only Face ID check on the device: it can be bypassed. The server must verify a signature.
- Linking Apple to an existing account automatically when the email matches: that risks account takeover, and the owner asked for confirmation.

**Testing.**
- **Integration (`tests/integration/sign-in.test.ts`):**
  - challenge single-use, purpose and expiry
  - RP derivation; refusing unknown or replayed passkey responses
  - money-lock rules
  - Apple client-secret claims; code exchange with a fake fetch; id_token issuer, audience, expiry, nonce and foreign-key rejection with a local JWKS
  - account creation with a private relay email; no auto-link on email; pending link only for the matching account; refusing an Apple ID linked elsewhere
  - password reset end to end (with a fake Resend): no-account answer, weak-password refusal, sessions revoked, token reuse refused
  - Jarvis refusing money tools while locked
- **End to end (`tests/e2e/sign-in-phone.spec.ts`, iPhone profile):** this runs **real WebAuthn ceremonies** against Chromium's virtual platform authenticator:
  - password sign-in, then the "Use Face ID next time?" offer, then registration
  - rename the passkey
  - turn on the Money lock; it locks after idle; unlock with Face ID
  - sign in by passkey autofill, and by the button
  - check the audit trail
- **Not tested here:** real Apple servers and a real iPhone's Secure Enclave (network and devices unavailable). The owner verifies those with the go-live checklist.
