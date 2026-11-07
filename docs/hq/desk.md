# The CEO's desk (ADR 0029)

The penthouse desk holds the owner's big tasks as files. Clicking the pile lists them; picking one plays a short MacBook animation and opens that task's Claude Code chat:
- **First click** (no chat yet): a new chat in the LifeFlow repo with the first prompt typed in. Press send. The prompt starts with `npx tsx scripts/hq.ts mission update <id> --status doing`, which tells HQ which chat took the task.
- **Later clicks**: the task's own chat opens and the next prompt ("Back on …, where it stands, next step") is copied, ready to paste.

A desk file is a mission with a `desk_prompt` (plain text, at most 1,500 characters). Add one from the desk ("Add a file to your desk") or from a chat: `npx tsx scripts/hq.ts mission add --role developer --title "…" --priority high --desk-prompt-file prompt.txt`. Finishing the task (`--status done`) takes it off the desk.

## The first files (owner, 2026-11-07)

### Finish the V3 redesign revision (designer)
```
You're LifeFlow's Product & Design lead (.claude/agents/product-designer.md). Goal: finish the V3 redesign revision so I can say yes to it.
1. Read docs/vision.md (the braid: Flow, the assistant, You; section 15), the newest reports in docs/research/ (their "Things to avoid" are rules) and the V3 work so far (the LF V3 chat's branch and notes).
2. In five lines, tell me what the revision still needs and anything you think is wrong with it.
3. Finish it as pictures only: phone first and web, at scale 2, every main screen of the revision. Follow the simple concept (understood in 5 seconds, one next step, no dense lists, nothing copied from iOS or other apps).
4. Send it to me as one decision card (npx tsx scripts/hq.ts approval --kind design ... with the pictures), with your recommendation.
No app code until I okay the pictures.
```

### Ship LifeFlow to the App Store (developer)
```
Goal: get LifeFlow into the App Store. Read docs/adr/0018-pro-plan-and-app-store.md, docs/go-live-checklist.md (9d) and capacitor.config.ts.
1. Readiness check, in plain words: what's built, what's missing and what could fail App Review. Cover guideline 4.2 for apps that load a website (which native features we use or need: push, Face ID, Apple Health, offline screen), in-app purchase for Pro ($9.99 a month, students $5.99; Apple requires it in the app), Sign in with Apple, the privacy labels, account deletion inside the app, and the support and privacy URLs.
2. Fix what's code and safe here (small fixes are approved; anything that changes how the app works or looks comes to me first as a decision card with pictures).
3. Write the App Store Connect texts: name, subtitle, description, keywords and the review notes with a demo login.
4. Give me the exact steps I do on my Mac with Xcode and in App Store Connect, numbered, each one short.
```

### Finish Twilio (text your assistant) (developer)
```
Goal: finish texting the assistant by SMS (Twilio) so it works for real. Read docs/adr/0017-text-jarvis-sms.md and docs/go-live-checklist.md (9b).
1. Check the whole path in code and tests: linking a number with the 6-digit code, /api/sms/inbound (Twilio signature over APP_URL, the per-number limit, after()), YES/NO confirmations, the money lock by text, and that a text is reported as sent only with Twilio's message id. Run the related tests and fix anything broken (failing test first).
2. Tell me exactly what's left on my side, in order: the Twilio number, A2P 10DLC brand and campaign registration (what to write so it's approved: use case, sample messages, opt-in and opt-out words), the Vercel variables (names only) and the webhook URL.
3. Add a short "Text your assistant" check to the go-live list if one is missing.
Never text anyone; never put a key in code or chat.
```

### Microsoft Teams and the other email providers (developer)
```
Goal: Microsoft Teams plus the other email providers we talked about (beyond Gmail). Read docs/adr/0010-voice-google-health.md, src/server/integrations/microsoft.ts and google.ts, and the Integrations part of CLAUDE.md.
1. Microsoft today is read-only Calendars.Read with Teams join links in events. Check that it works end to end (connect, sync, a school that blocks it, disconnect) and fix bugs.
2. Plan the next email providers: Outlook and Hotmail mail through Microsoft Graph (Mail.Read), iCloud Mail, Yahoo, and school email. For each: how it connects, the permission it needs, whether schools block it, what we store, and the risks. Email content is untrusted and never trains anything.
3. Bring me one decision card with your order and recommendation, and a picture of the connect screen, before building a new provider. Small fixes to what exists are approved.
```

### Make sure Plaid works end to end (developer)
```
Goal: make sure Plaid works end to end, for me now and for other people later. Read src/server/integrations/plaid.ts, the Plaid rules in CLAUDE.md and docs/go-live-checklist.md.
1. Run the Plaid unit and integration tests and an e2e pass of Money: connect (sandbox user_good / pass_good), first sync, Sync now with live balances, turning an account off and on, Choose accounts (update mode), re-auth errors, investments and liabilities, and the nightly sync cron. Fix what's broken (failing test first; money changes get an Opus review).
2. Check the app's error reports (npx tsx scripts/hq.ts errors) for anything Plaid-shaped and turn real problems into fixes.
3. Tell me what Plaid Production access needs from me (the application, the security questionnaire answers we can give, the privacy policy points), as a short numbered list.
Never invent bank data; demo data only through scripts/seed-demo.ts.
```

### Vercel work: deploy setup, variables and crons (developer)
```
Goal: the Vercel work: make the deploy setup complete and tidy. Read docs/go-live-checklist.md, vercel.json, package.json (vercel-build) and src/app/api/cron/.
1. Make one list of every environment variable the app reads (grep process.env), what each turns on, and whether it's required. Compare it with the go-live checklist and fix the checklist where it's out of date. Names only; never ask for or print a value.
2. Cron jobs: what runs, how often it needs to run, and what Vercel Hobby allows (once a day) versus Pro. Recommend one setup with its cost.
3. Check the build: vercel-build runs the migrations, the memory encryption, the demo seed and the skills. Make sure a failed step stops the deploy and nothing runs twice.
4. Previews: Neon preview branches connect as neondb_owner (RLS skipped). Say if that's acceptable or how to fix it.
5. Give me the exact clicks for anything only I can do in Vercel, numbered. Code fixes that are small are approved.
```

## Not on the desk yet (for the owner's yes)
Found in `docs/go-live-checklist.md` and the ADRs, not in the owner's list:
- **Stripe payments for Pro** ($9.99 a month, students $5.99; ADR 0018): the keys, the price and the webhook.
- **Sign in with Apple** (checklist 3): needed for the App Store anyway.
- **Smart inbox email forwarding** (Postmark, checklist 9).
- **Lawyer review of /privacy and /terms** before other users join.
- **Google verification** so other people's Gmail can connect (Testing mode is only for the owner).
- **Microsoft publisher verification**, so schools don't block the "unverified" app.
