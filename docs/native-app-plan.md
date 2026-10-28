# Native app plan: Capacitor wrapper, widgets and Face ID

LifeFlow ships today as an installable web app (PWA). It has a service worker, offline reading, changes queued offline, push notifications, home-screen shortcuts and an install prompt. This plan covers the next step: an App Store / Play Store app built from the same code, plus the native-only extras (home-screen widgets, Face ID through the system APIs).

## Why Capacitor

- **One codebase.** Capacitor puts the existing Next.js app in a native WebView and adds a JavaScript bridge to native APIs. There's no rewrite. React Native or Swift would mean a second front end to keep in sync with every feature.
- **Same server.** The app loads `https://<your-domain>` (server-rendered pages, server actions, RLS), so business logic stays in `src/server/services`. A static export isn't possible because the app relies on server components and server actions.
- **What the PWA already gives us carries over:** safe areas, 44px targets, keyboard handling, haptics fallbacks, offline queue.

## Steps

1. **Project setup.** Add `capacitor/` (separate `package.json`, not imported by the web build) with `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`.
   - `capacitor.config.ts`:
     - `server.url = https://<domain>`
     - `server.allowNavigation = [<domain>, "cdn.plaid.com", "appleid.apple.com"]`
     - `ios.contentInset = "never"`
     - `backgroundColor = "#f4f2ec"`
   - App id: `app.lifeflow` (change before the first store upload; it can't be changed after).
2. **Shell polish.**
   - `@capacitor/status-bar`: match light/dark.
   - `@capacitor/splash-screen`: hand off to the web splash.
   - `@capacitor/keyboard`: `resize: "native"`. This replaces the `visualViewport` workaround inside the app.
   - `@capacitor/haptics`: `src/lib/haptics.ts` calls it when `window.Capacitor` exists, otherwise `navigator.vibrate`.
3. **Push.**
   - Use `@capacitor/push-notifications` (APNs on iOS, FCM on Android) alongside Web Push.
   - Add a `platform` column to `push_subscriptions` (`web` | `apns` | `fcm`). Add an APNs/FCM sender behind the same `Sender` type in `services/push.ts`.
   - `notification_log` keys stay the same, so a person with both the web app and the native app still gets each alert once per device.
4. **Face ID / Touch ID.**
   - Passkeys already use Face ID in Safari and in the installed web app (WebAuthn), and WKWebView supports them with Associated Domains.
   - **Sign-in:** add `webcredentials:<domain>` to the app's Associated Domains and serve `/.well-known/apple-app-site-association`. Passkeys created on the web then work in the app.
   - **Money lock:** in the native app, the idle lock for Money and investments can call `@capgo/capacitor-native-biometric` (LocalAuthentication) instead of a WebAuthn assertion. The server-side check stays a passkey assertion, so a compromised WebView can't skip it by faking a local result. The native prompt is a convenience layer on top, not the security boundary.
5. **Widgets (native code, small).**
   - **iOS:** a WidgetKit extension in Swift, with three widgets:
     - "Safe to spend today"
     - "Next up" (next class, shift or to-do)
     - "To-dos due today"
   - **Android:** a Glance app widget with the same three.
   - **Data:** a read-only endpoint `GET /api/widgets/summary`, authenticated with a widget token. That token is a separate, revocable, hash-stored key, like the Apple Health key, scoped to read the summary only.
   - **Refresh:** the widget timeline refreshes every 30 to 60 minutes (iOS budget) and after a push arrives.
   - Widgets never show amounts while the device is locked unless the user turns that on (`widgetShowAmounts` preference).
6. **Deep links.**
   - Universal Links (iOS) and App Links (Android) for `/tasks/*`, `/money*` and `/jarvis` open the app.
   - The Plaid OAuth redirect (`/plaid-oauth`) must be a universal link for bank sign-in on phones.
7. **Store requirements.**
   - App Store Guideline 4.2 (minimum functionality): native push, widgets and Face ID add enough beyond a website wrapper.
   - **Sign in with Apple** is required on iOS because the app offers other third-party sign-in. It is already built (see ADR 0011).
   - **Account deletion in-app** is required, and it already exists in Settings, Privacy & data.
   - **Privacy nutrition labels:**
     - financial info, contacts (none), health (only if Apple Health is connected), identifiers
     - no tracking, no third-party ads
   - Plaid's Link SDK for iOS (`react-native` not needed; use the Plaid Link iOS SDK through a small plugin only if the web Link flow has issues in WKWebView. Plaid supports web Link in WebViews with the OAuth redirect set up.)

## Estimate

| Piece | Effort |
| --- | --- |
| Capacitor shell, status bar, splash, keyboard, haptics | 1 to 2 days |
| Native push (APNs + FCM) and sender | 1 to 2 days |
| Associated domains, passkeys in app, biometric lock | 1 day |
| Widgets (iOS + Android, endpoint, token) | 3 to 4 days |
| Store setup, screenshots, review fixes | 2 to 3 days |

## What's needed from the owner

- An Apple Developer account ($99/year) and a Google Play developer account ($25 once).
- An APNs key (.p8) and a Firebase project for FCM. These go in Vercel env vars, never in the repo.
- A Mac with Xcode to build and submit the iOS app (or a cloud Mac CI such as Xcode Cloud or Codemagic).
