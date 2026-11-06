# ADR 0009 — Sign-in security: password strength, two-step sign-in, IP hardening

**Status:** accepted (2026-10-28)

**Context.** A security checklist the owner shared listed common auth mistakes: session tokens in localStorage, no login rate limit, no 2FA, no password-strength check. An audit found the first two already handled. Sessions are random tokens in an httpOnly, secure, SameSite=Lax cookie, stored hashed. Login is limited per IP (30/15 min) and per email (8/15 min). The per-IP key trusted the client-controlled first X-Forwarded-For entry.

**Decision**
- **Password strength** (`src/lib/password-strength.ts`, zxcvbn-ts): at least 10 characters, a zxcvbn score of at least 3, and not mostly the user's own name or email. Enforced on the server at sign-up and password change. A live meter (`NewPasswordField`) shows it in the browser and loads the checker only on first keystroke. Seed and test accounts created through `registerUser` aren't checked, so deploys don't break.
- **Two-step sign-in** (`src/server/auth/two-factor.ts`). It's optional and turned on in Settings → Security.
  - Authenticator app (TOTP, RFC 6238: SHA-1, 6 digits, 30 s, ±1 step). Chosen over emailed codes because there's no email provider, it's free, and it's phishing-resistant enough for this stage.
  - The secret is stored AES-256-GCM encrypted (`ENCRYPTION_KEY`; the feature shows "not available" without it). Each code works once: the last step is stored and updated with a conditional query.
  - 10 one-time backup codes (40 bits each), stored as SHA-256 hashes and shown once.
  - Sign-in: a correct password with 2FA on creates a `login_challenges` row (hashed token in an httpOnly `bf_mfa` cookie, 10 minutes, 5 attempts, plus 20 tries per IP per 15 minutes). The session starts only after a valid code.
  - Turning it off needs the password and a code. New backup codes need a code. All changes are rate-limited per user and audited.
- **Client IP** (`ipFromHeaders`): prefer the host-set `x-vercel-forwarded-for`, then `x-real-ip`, then the last (proxy-appended) X-Forwarded-For entry.

**Testing.** Unit: strength rules, IP parsing. Integration: setup and confirmation, encryption at rest, replay, drift window, single-use backup codes, challenge lockout and expiry, cross-account attempts, disable and regenerate. e2e: weak password refused, then the full 2FA flow (enable → sign out → wrong code → backup code → reused backup code refused → fresh TOTP).

## Sign in with Google (added 2026-10-31)
- OpenID Connect with the same Google OAuth client as Gmail (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) and `APP_URL`; the button shows only when all three are set. Scope is `openid email profile` only; Gmail and Calendar stay a separate opt-in.
- `/api/auth/google/start` saves a single-use state (nonce + PKCE verifier) in `auth_challenges` with a SameSite=Lax cookie; the callback checks the cookie matches the state, takes the challenge once, swaps the code with the verifier, and verifies the id_token against Google's keys (issuer, audience, expiry, nonce).
- Apple and Google share `server/auth/oauth.ts`: a known provider id signs in (2FA still applies), an email matching an existing account needs one real sign-in before linking, and new accounts start with no password. Unlinking needs a password or the other provider.

## Addendum (owner, 2026-11-06): "Email me a code"
The owner was locked out: their account had two-step sign-in on, they couldn't find the authenticator entry, and their passkey wouldn't work. They asked for a code by email when that happens.

**How it works:**
- The second step can now also take a 6-digit code emailed to the account's address.
- It's only offered after the password step: it belongs to the pending `login_challenges` row, never to a bare email address.
- Only a SHA-256 hash of the code is stored, bound to that challenge (`email_code_hash`).
- A code works once and expires in 10 minutes.
- It shares the challenge's 5 tries.
- At most 3 codes per sign-in, plus 6 an hour per IP.
- Sending extends the sign-in to 10 minutes from now, never past 30 minutes from the password step.
- "Sent" is shown only when Resend returns an id. Without `RESEND_API_KEY`/`EMAIL_FROM` the button doesn't appear.
- After an email-code sign-in, a notice goes to the same address so a sign-in the person didn't make doesn't go unnoticed.
- The audit row records `secondFactor: "email"`.

**Trade-off, accepted by the owner:** whoever controls the account's email and knows the password can get in, admin included, because the admin check looks at the account's two-step setup, not at how this session signed in. Authenticator codes, backup codes and passkeys stay the stronger options.
