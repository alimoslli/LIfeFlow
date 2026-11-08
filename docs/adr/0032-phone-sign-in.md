# ADR 0032: Sign in with a phone number

Date: 2026-11-08. Status: built, held for the owner's okay on the login screen (picture rule).

## Decision
- Optional. A person adds a number in Settings and proves it with a code. Sign-in then takes the number and a 6-digit code.
- The code goes by text when texting is set up. Until then it goes to the account's email, and the screen says exactly that. Nothing claims a text was sent without the provider's id.
- The number is stored as `login_phone`, separate from `sms_phone`. A number proven only by an emailed code must never get texts for that account, because it was not shown to belong to that phone.
- Codes are hashed, single use, 10 minutes, 5 tries, 3 sends per hour per number, with per-network and per-number limits. The answer never says whether a number has an account.
- With two-step sign-in on, a right code leads to the usual second step.
- Autofill: the code field is marked as a one-time code, the sign-in email puts the code in the subject, and texts end with `@host #code` for Android. We do not read the person's Gmail to fill a code: anyone holding a password could make the app sign them in.

## Known limits
- Until texting is set up, anyone who controls the account's email can sign in with the phone option too; it adds no new access beyond the email code.
- A number held by one account can't be added to another. A squatter could hold someone's number; once texting is live a text-verified claim should take over an email-only one.
- Not built: an "Add your phone" step in onboarding (Settings only for now).
