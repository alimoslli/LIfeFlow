# One-page website (owner, 2026-11-21)

The owner: "I want it all on one page ... the perfect landing page and website for them to sign up. If they're signed in,
that page will just be the land where the waitlist is and where they can try the app out." The whole path, from the first
visit to lifeflowweb.com to being on the waitlist and excited, must be great.

## Done means

1. **One page for visitors (`/`, signed out).** In this order: the night with the skylings (what it is, one button), meet
   the five, what a skyling notices (the three examples), what it connects to, sunrise, **about us** (the About page's
   story and the two people, from `/about`), trust and why, **how the waitlist works** (only while the owner's switch is
   on), questions, the last ask, the footer. The header links jump within the page (What it does, About, Questions).
   No other page is needed to understand it or to sign up.
2. **The button says what happens.** While the waitlist switch is on, the buttons say "Join the waitlist" and the page
   says the launch note the owner set (the waitlist page's own line). While it is off, they say "Get started" and the
   page says nothing about a line. Never a made-up date, count or price.
3. **`/about` goes to `/#about`** (old links and the footer keep working). The footer's About link is the anchor.
4. **After sign-up, straight to the waitlist** (switch on, not let in): setup no longer comes first. `waitingNow` no
   longer waits for setup to finish. The birthday is asked first on the waitlist page (the Terms' 13 and older); under
   13 locks the account at once with the same rules as setup (`saveBirthday`, `blockUnderAge`, `afterAgeLock`). Their
   place, the invite and the try-it sky come after.
5. **When they're let in**, setup runs on Today as before (their birthday already saved).
6. With the switch off nothing changes for anyone signed in.

## Edge cases

- An invite link (`/?invite=`) keeps its "X invited you" line and carries the code to sign-up.
- Someone already partway through setup when the switch goes on now goes to the waitlist; setup resumes when they're in.
- Admins and the demo account are never waiting.
- Phone and laptop, light theme sections and the night sections, reduced motion, Extra large text: nothing cut or overlapping.

## Out of scope

- The App Store paywall (owner: only in the App Store app after sign-in, later).
- New pictures or new claims about the product; the words come from the landing and About pages already live.

## Tests

- `tests/e2e/landing.spec.ts`: the page holds the about section and the people, the anchors work, `/about` lands on it,
  the button words follow the switch.
- `tests/e2e/waitlist-phone.spec.ts`: a new sign-up with the switch on lands on the waitlist, is asked the birthday
  first, then sees their place; under 13 is locked.
- The same spec: someone still in setup with the switch on is sent to the waitlist from every app page.
