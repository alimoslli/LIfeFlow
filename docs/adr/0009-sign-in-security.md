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

**Tightened after a fresh-eyes security review (same day):**
- **Password sign-in only.** Email codes are offered only when the first step was the password (`login_challenges.first_factor`, migration 0042). After Google or Apple sign-in the inbox is usually the same account, so it can't count as a second factor.
- **Not after a reset, until a strong sign-in.** A password reset sets `users.email_codes_blocked_at` (migration 0043). Email codes stay off until the person signs in once with their authenticator, a backup code or a passkey. Waiting doesn't help (a second review found a fixed 7 days could simply be waited out), so control of the inbox alone can never get past two-step sign-in.
- **Truly single use.** The challenge is removed with `delete … returning`, so two simultaneous requests can't both start a session.
- **The sign-in cookie lasts as long as the code.** It's refreshed when a code is sent.
- **The sign-in never waits on the email service.** The notice is sent with `after()`, and every Resend call has a 10-second limit.

**Trade-off, accepted by the owner:** whoever controls the account's email AND knows the current password (not set through a reset since their last strong sign-in) can get in, admin included, because the admin check looks at the account's two-step setup, not at how this session signed in. Authenticator codes, backup codes and passkeys stay the stronger options.

### "Lost your app? Start over" (owner, 2026-11-06)
- **Why:** turning two-step off, or making new backup codes, needs a code from the old app. Someone who lost the app but got in with an email code couldn't set up a new one.
- **Where:** Settings → Security now has "Lost your app? Start over with an email code".
- **How:**
  - The signed-in person enters their password.
  - A 6-digit code is emailed: the same machinery and rules as the sign-in email code (`beginTwoFactorRestart` → `issueLoginEmailCode`, so it's refused after a password reset until a strong sign-in).
  - The code is checked through `completeLoginChallenge`, and must belong to the signed-in account (`finishTwoFactorRestart`).
- **What it resets:** the authenticator secret and every backup code. The person goes straight into setting up a new app and gets new backup codes.
- **Notice:** an email confirms the reset.
- **Logged:** `auth.2fa.restart_code_sent` and `auth.2fa.reset_by_email`.
- **Cookie:** `bf_2fa_restart`, httpOnly, strict, scoped to `/settings/security`, 10 minutes.
- **After a third review:**
  - **First passwords.** Setting a first password on a two-step account (one made with Google or Apple) also sets `email_codes_blocked_at`, so a stolen session plus the inbox can't set a password and then reset two-step.
  - **Other devices.** The restart signs out every other session; the one doing the reset stays signed in.

### Remember this phone, and Google skips our code (owner, 2026-11-10)
- **Decision:** the owner asked "why do I have to put the 6 digit code every time". Two changes:
  1. **Remember this phone for 30 days.** The second step page has a checkbox, checked by default ("Remember this phone for 30 days"). After a correct code (authenticator, backup or emailed), the browser gets cookie `lf_device` ("<id>.<token>", httpOnly, Secure in production, SameSite=Lax, 30 days). Only the SHA-256 of the token is stored (`remembered_devices`, migration 0059: user, created, expires, last used), compared in constant time. At sign-in the cookie is looked at only after the password is correct (`login`), so it can never start a session by itself. A new phone or computer asks for the code once. Rate limits are unchanged.
  2. **Google skips our code.** A Google sign-in on an account with two-step on starts the session directly (`skipsSecondStep`, oauth.ts), because Google already verified the person. Apple is unchanged. Every other rule in oauth.ts stands (never link on email alone, single-use `auth_challenges`).
- **Revoked** (all of the person's remembered devices): password change or reset, turning two-step off, "Lost your app? Start over", "Sign out others", the admin's sign out everywhere and suspend, and account deletion (cascade). Settings > Security has "Forget remembered devices".
- **Risks and mitigations:**
  - A stolen phone with a live cookie plus the password gets in without a code. Mitigation: the password is still required, 30 days at most, one tap to forget, and a password change or a lost-app restart ends it.
  - A Google account takeover now opens LifeFlow without a second step. Mitigation: that is Google's protection to keep strong; the admin account is excluded.
  - **Admin:** `requireAdmin()` decides by the account's two-step setup, which a skipped step would not prove. Sessions started via a remembered phone or Google are marked (`sessions.second_step_skipped`) and `requireAdmin()` refuses them (404). Admin accounts are also never remembered and never skip on Google, so the owner always types the code or uses a passkey.

### An emailed code also remembers the phone (owner, 2026-11-14, choice A)
- **Decision:** after a correct emailed code, a normal account's phone is remembered for 30 days, the same as after the authenticator or a backup code. The owner was locked out while the emailed code was the only factor he could use, and had to type it on every sign-in. The QA rule of 2026-11-10 ("an emailed code never earns it") is replaced. The 30 days is unchanged (the owner said "30 or 60"; 30 for now).
- **Unchanged:** the admin account is never remembered, whatever the method (`earnsRememberedDevice(method, { admin })`, `shouldRememberDevice`), so it types a code or uses a passkey every time, and a remembered or Google session is still refused by `requireAdmin()`. A remembered phone is still looked at only after the correct password, and every remembered phone is still revoked by a password change or reset, two-step off or restart, "Sign out others", suspension and deletion. A password reset still blocks emailed codes until a strong sign-in, so a reset can't be turned into a remembered phone by email.
- **Risk:** someone with the password and the inbox could already sign in with an emailed code each time; now one sign-in keeps that phone for 30 days. Mitigation: the same limits (password first, 30 days at most, the sign-in notice email on every emailed-code sign-in, one tap to forget, revoked by every event above). Needs the security review before main.
