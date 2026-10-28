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
