# App Store readiness report (2026-11-08)

Read-only audit. Nothing was changed except this file. Evidence is in file paths. "Built" means the code exists. "Missing" means it does not. "Risk" means Apple may reject it.

## The short version
- The iPhone app is a thin Capacitor shell that loads the live website. The `ios/` folder does not exist yet (it is made on a Mac with `npx cap add ios`).
- Today the shell has no native features. Apple rule 4.2 (reject apps that are mostly a website) is the biggest risk.
- There is no in-app purchase. Pro is sold only through Stripe on the web. The app hides the Stripe button, so an iPhone user cannot buy Pro at all.
- Sign in with Apple is fully coded but not switched on (the live site says apple:false).
- Account deletion exists in the app, but it does not yet cancel Stripe, remove Plaid links or revoke the Apple sign-in token.
- Privacy policy and terms pages exist. A support page and a reviewer demo login are not ready.

## 1. Guideline 4.2: not just a website
Apple reads "minimum functionality" strictly for apps that only wrap a site.

| Native feature | Status | Evidence |
| --- | --- | --- |
| Capacitor shell | Built (config only) | `capacitor.config.ts` (app id `app.lifeflow`, loads `CAP_SERVER_URL`); `@capacitor/core, cli, ios` in `package.json`. No `ios/` folder yet. |
| Push notifications | Missing for iOS. Web Push only. | `web-push` in `package.json`, `src/server/services/push.ts`. Web Push does not work reliably inside the app view. The plan for APNs (Apple's push system) is in `docs/native-app-plan.md` step 3, no code. No `@capacitor/push-notifications` installed. |
| Face ID / passkeys | Built on the web side | `src/app/api/auth/passkey/[step]/route.ts`, `src/components/auth/passkey-client.ts`, "Lock Money with Face ID". Needs Associated Domains and `/.well-known/apple-app-site-association` to work in the app. Neither exists (no match in `src`, `public`). |
| Apple Health | Partly. Not real HealthKit. | Data arrives from an iOS Shortcut through `/api/apple-health/ingest` (`src/server/services/health.ts`). Apple counts this as a web feature, not a native one. No HealthKit plugin. |
| Offline screen | Built (web) | `src/app/offline/page.tsx`, `public/sw.js`. Apple sees this as a website feature. |
| Share sheet | Partly | `src/app/share-target/route.ts` is a web share target (the PWA way). No native share extension. |
| Haptics | Not native | `src/lib/haptics.ts` uses `navigator.vibrate`, which does nothing on iPhone. |
| Widgets | Planned, not built | `docs/native-app-plan.md` step 5. |

Verdict: not enough native value today. A reviewer who opens the app sees the website. Risk is high.

Cheapest fix, in order of value for effort:
1. Native push (APNs) through `@capacitor/push-notifications`. The app's whole point is daily nudges, so this is real value and a clear reason for being an app. Medium.
2. Native haptics plus status bar, keyboard and splash plugins. Small. Cheap polish, but not enough alone.
3. One home screen widget ("Next up"). Medium, needs Swift in Xcode. Apple likes widgets.
4. Real HealthKit read (steps, sleep) through a plugin instead of the Shortcut. Medium. Also removes a setup step for users.
Push plus haptics plus one widget is a safe set. Also write a short "why this is an app" note for App Review.

## 2. In-app purchase for Pro
- Built (web): Stripe Checkout and customer portal, signed webhook sets `users.plan`. Evidence: `src/server/billing.ts`, `/api/billing/webhook`, `src/app/(app)/settings/plan/page.tsx`. ADR 0018.
- Built (hiding): the Plan page detects the `LifeFlowApp` user agent so the web checkout is not offered inside the app (`settings/plan/page.tsx` line 30). `capacitor.config.ts` still lists `checkout.stripe.com` and `billing.stripe.com` as allowed pages in the app. Remove them when IAP lands.
- Missing: any purchase on iOS. No StoreKit, no RevenueCat, no receipt or App Store Server Notification handler. ADR 0018 says IAP "can be added later through `users.plan`".
- The rule (guideline 3.1.1, and 3.1.3(b) for multiplatform services): digital subscriptions bought in the iOS app must use Apple IAP. The app may not show a button or link that sends people to web payment, and should not tell them to "subscribe on our website". A person who already pays on the web may sign in and use Pro (that is allowed). Apple takes 15% to 30%. Student price $5.99 needs a second product or an Apple offer code.
- Risk: without IAP, an iPhone user cannot get Pro, and the reviewer will not be able to test paid features. Also check the Plan page copy for any hint of web payment.
- Cheapest path: RevenueCat (a service that wraps StoreKit and sends a webhook). Plugin `@revenuecat/purchases-capacitor`, a webhook route that sets `users.plan`, two products in App Store Connect. Medium.

## 3. Sign in with Apple
- Built: `src/server/auth/apple.ts`, `src/app/api/auth/apple/start/route.ts` and `callback/route.ts`, `src/server/auth/oauth.ts` (linking rules), button in `src/components/auth/sign-in-options.tsx`, ADR 0011. Guarded by `appleConfig()`.
- Missing: the owner's setup in `docs/go-live-checklist.md` section 3 (Services ID, key, Team ID, Vercel variables). Until then the button is hidden (login page reports apple:false).
- Risk: Google sign-in is offered, so Apple sign-in is required on iOS (guideline 4.8). If the app ships with it off, rejection. The web flow uses a redirect through `appleid.apple.com` (allowed in `capacitor.config.ts`). Safer inside the app is the native Apple sign-in sheet. Test the web flow in the real shell first.
- Also check: the Services ID return URL must match the live domain, and the App ID needs the capability.

## 4. Account deletion inside the app
- Built: Settings, Privacy and data. `deleteAccountAction` in `src/app/(app)/settings/actions.ts` (type DELETE plus password), `deleteAccount` in `src/server/services/accounts.ts`. People with no password (Apple or Google only) can delete without a password prompt.
- Risk (gaps Apple and the privacy policy care about):
  - It only deletes database rows. It does not cancel the Stripe subscription, so a paying user could keep being charged. Check.
  - It does not call Plaid `/item/remove` (that call exists at `src/server/integrations/plaid.ts` line 648, but not on delete), so bank links stay open at Plaid.
  - It does not revoke the Sign in with Apple token. Apple requires this when an account is deleted (guideline 5.1.1(v)).
  - It does not revoke Google tokens (`revoke` helpers exist in `src/server/integrations/google.ts`).
- Fix: call these before the delete. Small to medium.

## 5. Privacy
- URLs: built. `src/app/(legal)/privacy/page.tsx` and `terms/page.tsx` (also `integrity`). Contact comes from `LEGAL_CONTACT_EMAIL` (`src/lib/legal.ts`). If that variable or name or state is not set, the page is not "configured". Set it before submitting. Add both URLs in App Store Connect.
- Privacy policy has a Google user data section (4) and an AI section (3), which Apple and Google both expect.
- App Privacy labels to declare (all "linked to the user", none used for tracking, no ads):
  - Financial info: account balances, transactions (Plaid).
  - Health and fitness: only if Apple Health is connected (Shortcut).
  - Contact info: email address, name; phone number if SMS is used (Twilio).
  - User content: emails read through Gmail (only if connected), notes, tasks, photos and files the user attaches, messages to the assistant.
  - Identifiers: user id, device token for push.
  - Usage data and diagnostics: error reports (`error_reports`), Jarvis run metrics (no message text).
  - Contacts (address book): none. Location: none. Tracking: none.
- Third-party services that touch user data (Apple asks you to know these): Plaid (banking), OpenAI (assistant and voice), Google (Gmail, Calendar), Microsoft (Outlook, read only), Stripe (web payments), Twilio (SMS), Resend or similar (email), Postmark (inbox forwarding), Vercel (hosting). Embedded SDKs inside the iOS app: Capacitor only today. RevenueCat would be added by IAP.
- Missing: Apple's `PrivacyInfo.xcprivacy` file (required reasons for some APIs). Capacitor ships its own; check the final Xcode project. Small.
- Risk: the policy must match the labels exactly, including that banking and Gmail data go to third parties.

## 6. Support URL, icon, splash, bundle id
- Bundle id: `app.lifeflow` in `capacitor.config.ts`. It cannot change after the first upload. Confirm it is the one the owner wants and that the domain is the owner's. Needs the same id for the App ID (Sign in with Apple, push, Associated Domains).
- Support URL: missing. There is no support page; only the contact email in the policy. Apple requires a working support URL. Cheapest: a `/support` page with the email and a few answers. Small.
- App icon: partly. `public/brand/lifeflow-mark-512.png` and `public/icons/icon-512.png` are 512 px. Apple needs a 1024 x 1024 PNG with no transparency and no rounded corners. Missing. Small (design).
- Splash: web splash exists in the app. A native launch screen is not set up (the `ios/` folder is not made). `backgroundColor` is `#f4f2ec`. Small.
- Screenshots: `public/screenshots/*` are web sizes. App Store needs real iPhone sizes (6.9 inch and 6.5 inch sets). Owner or engineering, from the simulator. Small.
- Server URL: `CAP_SERVER_URL` defaults to `https://lifeflow.example`. Must be the production URL when building.

## 7. Other common rejections for this kind of app
- Review login: a demo account exists (`scripts/seed-demo.ts`, `demo@budgetflow.local`, always Pro, flagged `account_kind = "demo"`). It is local/dev by default. Risk: reviewer needs a working login in production, and the password reset and 2FA must not block it. The seed has a production mode (see the header of the script). Plan: run it in production, put the email and password in App Store Connect "Sign-in required" notes. Check admin and sensitive checks exclude demo (they do in `src/server/auth/admin.ts`). Small.
- Bank connection in review: Plaid in production needs the app to be approved by Plaid for production, and OAuth banks need a universal link (`/plaid-oauth`, in the native plan). Reviewer must be able to see money screens; the demo account covers this with sample data. Check that demo money pages do not call live Plaid.
- Money advice wording: Apple dislikes apps that look like financial advice. Keep the in-app disclaimer. The app says no "safe to spend". Good.
- Health: Apple needs the usage reason shown. If real HealthKit is added, add `NSHealthShareUsageDescription` and the entitlement.
- AI and user content: guideline 1.2 and the new AI rules want a way to report bad answers and filter content. Check the assistant has a visible report or feedback route (`sendFeedback` exists).
- Gmail data: Google restricted-scope verification is a separate process for the Google side. Not an Apple blocker but a launch one. Check go-live section 2.
- Permissions: camera or photo use needs Info.plist text. Push needs a clear reason before the system prompt.
- Age rating and export compliance: answer in App Store Connect (uses HTTPS only, standard encryption).
- Links to web: the Settings, plan and legal links to Stripe pages must be hidden in the app. Review every in-app link that goes to external payment or sign-up.
- Terms of use (EULA) link must be in the app description for subscriptions.
- Crashes and slow loads: the app depends on the live site. If the server is down during review, it is rejected. Keep the site up and the offline page friendly.

## Owner's steps (only the owner can do these, in order)
1. Join the Apple Developer Program, $99 a year (developer.apple.com). Use the right legal entity. Approval can take a day or two.
2. Get a Mac with Xcode (free) or borrow one. Needed to build, sign and upload.
3. Decide the bundle id (default `app.lifeflow`) and confirm the production domain. They cannot change after upload.
4. Create the App ID with Sign in with Apple, Push Notifications and Associated Domains. Then do `docs/go-live-checklist.md` section 3 (Services ID, key, Team ID) and paste the values in Vercel. Check the login page then says apple:true.
5. Set `LEGAL_CONTACT_EMAIL`, legal name and state in Vercel so the privacy and terms pages are complete.
6. Create the app in App Store Connect: name, subtitle, category, age rating, privacy policy URL, support URL, screenshots, description.
7. Fill in App Privacy labels from section 5 above.
8. Create the Pro subscription products (monthly $9.99; student $5.99 or an offer code) in App Store Connect, sign the Paid Apps agreement, add bank and tax details.
9. Create a RevenueCat account (or the chosen IAP tool) and link the App Store key.
10. Set up the demo account in production and write its email and password in the review notes. Add a short note explaining the app's native features and the money data.
11. Apple push key (APNs `.p8`): create in the developer site and give it to engineering through Vercel variables.
12. With engineering: run `docs/go-live-checklist.md` 9d on the Mac, test on a real iPhone, upload to TestFlight, test with a few friends for a week.
13. Submit for review. Expect 1 to 3 days and possibly one round of questions.

## Engineering's steps
| # | Work | Size |
| --- | --- | --- |
| 1 | Run `npx cap add ios`, commit `ios/`, set the 1024 px icon, native launch screen, `PrivacyInfo.xcprivacy`, Info.plist texts | Small |
| 2 | Native push: `@capacitor/push-notifications`, APNs sender behind `services/push.ts`, `platform` column on `push_subscriptions` (migration), token registration, test | Medium |
| 3 | Status bar, splash, keyboard, haptics plugins; update `src/lib/haptics.ts` to use Capacitor when present | Small |
| 4 | In-app purchase: RevenueCat plugin, Plan page buy button in the app only, webhook route that sets `users.plan`, restore purchases, remove Stripe hosts from `allowNavigation`, student pricing, tests | Large |
| 5 | Plan page and any link copy: no web payment hints inside the app (user agent check already there; extend to every place) | Small |
| 6 | Associated Domains and `/.well-known/apple-app-site-association` so passkeys and the Plaid OAuth link open in the app; `/plaid-oauth` universal link | Medium |
| 7 | Check Sign in with Apple inside the shell (web flow in WKWebView), move to the native sheet if it fails | Small to medium |
| 8 | Account deletion: cancel Stripe, Plaid `/item/remove`, revoke Apple and Google tokens, tests | Medium |
| 9 | `/support` page with the contact email and answers; link in the app and App Store Connect | Small |
| 10 | Production demo account for the reviewer, with sample data and no live Plaid calls; verify every tab works | Small |
| 11 | One home screen widget ("Next up") with `GET /api/widgets/summary` and a revocable token (native plan step 5) | Medium |
| 12 | Real HealthKit read (optional but strengthens 4.2) | Medium |
| 13 | Report-a-problem on assistant answers if missing; review App Privacy labels against the code | Small |
| 14 | App Store screenshots from the simulator | Small |

Suggested order: 1, 3, 2, 9, 8, 10, 6, 7, 4, 5, then 11 or 12 if the reviewer pushes back on 4.2.
