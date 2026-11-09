# Widgets, Mac widgets and an Apple Watch glance

Date: 2026-11-09. Read-only research. No product code was changed. Nothing here is built.

## Short answer

Yes, all three are possible, and they share one piece of work. LifeFlow is a Capacitor shell that loads the live site, so a widget cannot read the web page. It needs its own small native (Swift, SwiftUI) WidgetKit extension that fetches a small JSON summary from our server and draws it.

- iPhone home-screen and lock-screen widgets: one extension target. This is the core.
- Mac widgets: free with that same extension. iPhone widgets show on a Mac desktop and Notification Center when the Mac is signed in to the same Apple ID (macOS Sonoma and later). No Mac app is needed.
- Apple Watch glance: a second small target (a watchOS app plus a widget extension). Do it after the iPhone widget ships.
- Smallest first version: two iPhone widgets (small "Sky card", medium "Tonight"), one endpoint, one revocable token. About 8 to 10 working days plus store setup.

This also fixes the App Store risk named in `docs/audits/2026-11-08-app-store-readiness.md`: guideline 4.2 (the app looks like a website). A widget is native value a website cannot give.

## 1. What is possible (with sources)

| Piece | What it is | Notes for us |
|---|---|---|
| Home-screen widgets | WidgetKit extension: small, medium, large. A "timeline" of entries; the system shows each at its time. | Core. [WidgetKit](https://developer.apple.com/documentation/widgetkit) |
| Lock-screen widgets | Same extension, "accessory" families (circular, rectangular, inline). | Cheap add. Needs the privacy rules in section 4. |
| Interactive widgets | iOS 17 and later: buttons and toggles in a widget run an App Intent without opening the app. | Later. Example: "Done" on a to-do. [App Intents](https://developer.apple.com/documentation/appintents) |
| Live Activities | A live card on the lock screen and Dynamic Island for something in progress, started from the app or by push. | Later, for "shift ends in 40 min". Needs ActivityKit and push-to-start tokens. [ActivityKit](https://developer.apple.com/documentation/activitykit) |
| Mac widgets | iPhone widgets appear on the Mac desktop through Continuity. A native Mac app is a separate project. | Take the free path. |
| Watch complications and Smart Stack | watchOS uses WidgetKit too (accessory families). The Smart Stack shows widgets by relevance. [Updating watchOS with timelines](https://developer.apple.com/documentation/widgetkit/creating-accessory-widgets-and-watch-complications) | Needs a watchOS target. App Groups do not span iPhone and Watch, so the watch fetches itself or gets data through WatchConnectivity. |
| Siri and Shortcuts | App Intents also give Shortcuts actions and Spotlight. | Free once App Intents exist. |

### Getting web-backed data into a widget

A widget extension is a separate process. It cannot read the WebView, `localStorage` or Capacitor Preferences (the [Ionic forum thread](https://forum.ionicframework.com/t/is-it-possible-to-access-capacitor-storage-data-from-ios-widget/221294) confirms this). There are two real ways:

1. **The widget fetches by itself.** The timeline provider calls `GET /api/widgets/summary` with a token. The token lives in the shared Keychain or an App Group file, written once when the user turns widgets on. Best fit for us: the data comes from the same services as the app, and it works when the app has not been opened for days.
2. **The app pushes a snapshot.** The web app calls a plugin, which writes JSON into the App Group (`UserDefaults(suiteName:)`) and calls `WidgetCenter.shared.reloadAllTimelines()`. Simple, but the data is only as fresh as the last app open. Use it as a bridge for the token and a first snapshot, not as the main feed.

Capacitor plugins that bridge to WidgetKit (all small, none from Apple, check licence and upkeep before use):

- [Capgo Widget Kit](https://capgo.app/docs/plugins/widget-kit/getting-started/): App Group JSON, SVG templates, Live Activities.
- [capacitor-widget-bridge](https://www.pkgstats.com/pkg:capacitor-widget-bridge): shared UserDefaults plus a reload call.
- [@hiloenergie/capacitor-plugin-shared-storage](https://www.npmjs.com/package/@hiloenergie/capacitor-plugin-shared-storage): App Group UserDefaults only.
- Also a pattern in [Sharing data between widgets and iOS apps](https://defn.io/2025/04/13/communicating-with-widgets-on-ios).

Recommendation: write about 60 lines of our own Capacitor plugin (`setWidgetToken`, `reloadWidgets`). The job is tiny, it handles a secret, and a third-party plugin is more supply-chain risk than it saves. The widget itself is hand-written SwiftUI either way. Plugins do not remove the Swift work.

### Refresh and budgets

From [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date):

- Widgets do not run live. WidgetKit gets a timeline (a list of future entries) and shows each at its date.
- The system gives each widget a daily reload budget that depends on how often it is seen. Apple gives no number. Third-party reports say roughly 40 to 70 a day for a widget people look at often. That figure is an estimate, not an Apple fact.
- A reload policy (`atEnd`, `after(date)`) is a hint, not a promise.
- Reloads from the app in the foreground, and from an App Intent, are not charged the same way. A push from our server can also wake the app, which then calls `reloadAllTimelines()`.

What this means: do not try to be live. Send a whole day of entries in one fetch.

## 2. Options compared

| Option | Gets you | Cost | Risk |
|---|---|---|---|
| A. Widget fetches a summary (recommended) | Always fresh enough, works without opening the app | Swift extension, one endpoint, token | Token handling, privacy on lock screen |
| B. App pushes a snapshot through a plugin | No token in the widget | Plugin plus Swift | Stale data when the app is not opened |
| C. Live Activity only | Great for a shift in progress | ActivityKit plus push tokens | Narrow; not a glance at the day |
| D. Native Mac app | Mac-only features | New target, new review | Not needed; iPhone widgets already reach the Mac |
| E. Watch app with full UI | Rich watch use | Large | Far too big for now |
| F. Do nothing native | Zero cost | none | Guideline 4.2 rejection risk stays high |

Pick A for the first version, B as the bridge for the token, C and the watch as follow-ups.

## 3. Recommended first version

### Widgets

1. **Small: "Sky card".** Background is the real sky gradient for the minute (top, middle, horizon colours from `src/lib/sky.ts`, blues and warm light only, no purple). On it: the next thing in one line ("Class in 40 min") and one pile line if it exists ("5 assignments").
2. **Medium: "Tonight".** Same sky strip on the left. On the right: the next 24 hours from `services/tonight.ts` in three lines at most: what is tied to the clock (shift, class, deadline), free hours left, and the pile. No money in v1.
3. **Lock screen (cheap, same data):** accessoryRectangular with the next thing and its time; accessoryInline with "Class 2:00 PM". Both obey the privacy rules below.

Not in v1: large size, interactive buttons, Live Activities, Money.

### The sky without live updates

The server sends sunrise and sunset (already in `lib/day-clock.ts`) and the widget draws the sky itself. Two choices:

- Easiest and safest: the server returns a `sky` list of colour stops for every 20 minutes from now to +24 hours. The widget makes one timeline entry per stop. Each stop is a few bytes. No Swift port of `skyAt`, so the Swift code cannot drift from the web.
- Later: port `skyAt` to Swift if we want the sky without any fetch.

### Refresh strategy

- One fetch returns 24 hours of entries. The widget shows each at its own time with no network.
- Timeline reload policy `after(now + 60 min)`, but the 24 hour list means a missed reload costs nothing.
- The app calls `reloadWidgets` whenever it opens, after a calendar or shift change, and after a push arrives.
- If the fetch fails, keep the last good timeline and show a calm "Updated 3:10 PM" line once it is older than 6 hours. Never show a blank or an error code.

### Data endpoint shape

`GET /api/widgets/summary`, bearer token `lfw_…`. JSON, a few KB, `Cache-Control: no-store`.

```json
{
  "version": 1,
  "generatedAt": "2026-11-09T18:02:11Z",
  "tz": "America/Chicago",
  "sun": { "riseMin": 412, "setMin": 1031 },
  "sky": [{ "at": "2026-11-09T18:20:00Z", "top": "#2a76d0", "mid": "#6aaae6", "horizon": "#c8e3f8", "dark": false }],
  "next": { "kind": "class", "title": "Bio 201", "short": "Class", "startsAt": "2026-11-09T19:00:00Z" },
  "clock": [{ "kind": "shift", "title": "Work at Cafe", "short": "Shift", "startsAt": "…", "endsAt": "…" }],
  "pile": { "label": "5 assignments", "count": 5, "nextDueAt": "…" },
  "tonight": { "freeMinutes": 190, "busyMinutes": 330, "assumes": "You're up until 11:00 PM." },
  "money": null
}
```

Built from services only (`getAgenda`, `listAssignments`, `listTasks`, the same `tonight()` call), inside `withUser`, never from components. Real records only: if there is nothing, `next` is null and the widget says "Nothing coming up", never invented data.

### Privacy rules (these are requirements)

- **Money is null in v1.** The server never puts money in the payload. Later it appears only when the person turned on a "Show money in widgets" setting AND the Money lock is open when the server builds it. A long-lived widget token must never be able to open the Money lock. If the lock closes, the next fetch drops money, and the widget replaces the stored copy.
- **Nothing private on the lock screen.** Lock-screen families use the `short` field ("Class", "Shift", "Due") with a time, not titles, unless the person turns on "Show titles on the lock screen". In SwiftUI, mark titles `.privacySensitive()` so the system redacts them when the phone is locked. This follows the notification rule in `docs/research/2026-11-06-notifications-that-bring-people-back.md` (nothing private on the lock screen when the Money lock is on). With the Money lock on, default to the short form everywhere on the lock screen.
- **Token.** Separate from the session. Format `lfw_<random>`, stored as a hash, one per device, read-only, scoped to this endpoint, revocable in Settings, deleted with the account. Same pattern as the Apple Health key: refuse a badly shaped bearer before counting any limit, count failures against the IP (`ipFromHeaders`), limit a real key only against itself. Public route in `proxy.ts`. Read the body with the usual limits; there is no body on GET.
- The token is stored in the shared Keychain access group, not in the web page's storage.
- No tracking, no third-party SDK in the extension, nothing logged with titles. Error reports stay scrubbed (`recordError`).
- User-facing words: never "Jarvis". Widget names: "Sky", "Tonight". The assistant's name only if the person chose one.

## 4. Build steps in order, with sizes

Needs a Mac with Xcode and the Apple Developer account first (section 6).

1. **Make the iOS project.** `npx cap add ios`, run on a real iPhone. (0.5 day. Already in the native plan.)
2. **Enable App Groups.** Create `group.app.lifeflow` in the Developer portal. Add the capability to the app target. (0.25 day)
3. **Server endpoint and token.** `lfw_` keys table (user-owned: `userId` + `ownerPolicy()`, FORCE RLS), create and revoke actions in Settings, `services/widgets.ts` building the payload, route, rate limits, tests for: no money by default, short form, bad token, revoked token, nothing leaks across users. (2 days)
4. **Capacitor plugin.** `setWidgetToken`, `reloadWidgets`, `isAvailable`, plus an "Add LifeFlow to your Home Screen" row in Settings shown only inside the app (`LifeFlowApp` user agent). (1 day)
5. **Widget extension target.** New "Widget Extension" in Xcode, bundle id `app.lifeflow.widgets`, same App Group, Keychain sharing group. Provider fetches, decodes, builds entries. (2 days)
6. **Sky card and Tonight views.** SwiftUI for small, medium, lock-screen families, previews, Dynamic Type, dark mode, redaction. (2 days)
7. **Privacy manifest and labels.** `PrivacyInfo.xcprivacy` for the extension (UserDefaults and network use), update the App Privacy answers. (0.25 day)
8. **Test.** Real device: airplane mode, locked phone, token revoked, Money lock on, clock change, time zone change, Mac desktop view. (1 day)
9. **App Review notes.** A short "why this is an app" note: widgets, native push, Face ID (once built). Screenshots of the widgets. (0.25 day)

Total about 9.5 days of work, after the shell and push exist.

Follow-ups, each its own plan:

- Interactive "Done" on a to-do (App Intents, iOS 17 and later). 1 to 2 days.
- Live Activity for a shift or class. 3 days plus a push path.
- Apple Watch: watchOS app target plus accessory widgets, fetching with its own token through WatchConnectivity or direct `URLSession`. 4 to 5 days.
- Android Glance widget (already in the native plan).

## 5. How this strengthens the "not just a website" case

- Apple's guideline 4.2 (minimum functionality) rejects apps that are a repackaged website. See [App Review Guidelines, 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality). Apple asks for features that make the app feel at home on the device. Widgets, lock-screen widgets, a Watch glance and Shortcuts are exactly the examples reviewers look for. They cannot exist in a website.
- Today the audit lists the shell as "no native features". With native push plus one real widget plus haptics, the audit's own safe set is met.
- It also fits the product: the widget shows "the mechanism" (the day as it is, the next thing, what is tied to the clock). It brings people back without a push, with no guilt words, and every line is a real record.
- Be honest in review: a widget that only advertises the app is not enough. Ours shows live personal data, so it passes the "real utility" test.
- Review risks to avoid: a widget that shows nothing useful when signed out (show "Open LifeFlow to sign in"), a widget that links to a web payment page (it must not, guideline 3.1.1), and any data collection not in the privacy label.

## 6. What the owner must do

1. Join the Apple Developer Program ($99 a year). It is needed for App Groups, push, Sign in with Apple, TestFlight and the store. Confirm that `app.lifeflow` is the id he wants (it cannot change after the first upload).
2. Have a Mac with Xcode (current release), or use a cloud Mac such as Xcode Cloud or Codemagic. Widgets cannot be built or tested on Linux. A real iPhone is needed for testing (the simulator is fine for layout).
3. In the Developer portal: register `group.app.lifeflow` and the two App IDs (app and widget extension), with App Groups and Keychain sharing.
4. Say yes to the first version (two widgets and the lock-screen forms). This is a new feature, so under `CLAUDE.md` it needs the owner's yes through the COO before it is built or shipped. A picture of both widgets comes first (new surfaces need the owner's okay on a picture).
5. Decide two settings defaults: titles on the lock screen (recommended off) and money in widgets (recommended not in v1).
6. Later, for the Watch: a paired Apple Watch to test on.

## 7. Open questions and gaps

- Apple gives no reload budget number. Plan for a few a day and test on a device.
- Plugin choice (own plugin versus a Capgo or other one) should be confirmed once the Xcode project exists.
- Whether Mac widgets also need the iPhone nearby depends on the macOS version. Treat the Mac as "comes with the iPhone widget" and test on a real Mac before promising it in marketing.
- Whether the watch can reuse the iPhone token directly or needs its own is settled when that target is built.
- Reviewers decide 4.2 by judgment. Widgets lower the risk. They do not remove it.

## Sources

- [WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [App Intents](https://developer.apple.com/documentation/appintents)
- [ActivityKit (Live Activities)](https://developer.apple.com/documentation/activitykit)
- [Accessory widgets and watch complications](https://developer.apple.com/documentation/widgetkit/creating-accessory-widgets-and-watch-complications)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Capgo Widget Kit for Capacitor](https://capgo.app/docs/plugins/widget-kit/getting-started/)
- [capacitor-widget-bridge](https://www.pkgstats.com/pkg:capacitor-widget-bridge)
- [Shared storage plugin](https://www.npmjs.com/package/@hiloenergie/capacitor-plugin-shared-storage)
- [Sharing data between widgets and iOS apps](https://defn.io/2025/04/13/communicating-with-widgets-on-ios)
- [Ionic forum: Capacitor storage from a widget](https://forum.ionicframework.com/t/is-it-possible-to-access-capacitor-storage-data-from-ios-widget/221294)
- In this repo: `capacitor.config.ts`, `docs/native-app-plan.md` step 5, `docs/adr/0018-pro-plan-and-app-store.md`, `docs/audits/2026-11-08-app-store-readiness.md`, `src/server/services/tonight.ts`, `src/lib/sky.ts`.

Note: most Apple pages were read through search summaries, not in full. Check the exact current wording (especially OS version minimums and the Mac widget behaviour) before building.

## What changed because of this report

Nothing yet. This report is a proposal. If the owner says yes, the COO adds a "Widgets" step to `docs/PLAN.md` under the native app area.
