# Product after the excellence program (2026-11-10, evening)

The same walk as the [baseline](2026-11-10-product-baseline.md), by the COO, on main at `a5c14a8` plus the lighter
pixel pictures (`pixel-markup.test.ts`), production build on a local database, 390 x 844 phone. "Before" pages were
rebuilt from the baseline commit `2f15326` and measured with the same account and the same data, so the numbers
compare. A brand-new student ("Maya") walked the real welcome with the real AI model (gpt-5.5).

## The numbers

| What | Before (morning) | After (evening) |
|---|---|---|
| Screens before a new person can use the app | 4 welcome steps, then an 8-step tour | 4 welcome steps, no tour; sign-up to a usable Today in about 19 s, telling the week included |
| A week told in one message | 21.3 s, 4 model steps, 8 tool calls | 5.4 s in the welcome ("Saved 10 things: BIO 110, ENG 102, Campus Coffee shifts through Dec 1, and your BIO exam..."), 1 tool call; the sky above fills in |
| Places to learn on a phone | 4 tabs holding 16 sub-pages | 3 tabs (Today, Money, School) and More (8 doors with a live line each); Money is 3 plain rows |
| Ways into the chat | 3 (the tab, the floating button, the bar on Today) | 1 on every page: the skyling's bar on the dock (on Today, the bar under the sky) |
| Where notifications can be turned on | Settings › Notifications › This device only | The end of the welcome, the first promise or reminder, the iPhone Add to Home Screen hint, and Settings |
| The job that sends reminders | once a day, 15:37 UTC | every 10 minutes; the morning brief, evening wrap-up and Sunday review arrive at each person's own time |
| Screen load, local (same account) | 96 to 439 ms | 79 to 228 ms |
| First load of script | 338 KB | 293 KB |
| A later page, transferred (Money / Settings / School / Updates) | 205 / 204 / 212 / 373 KB | 191 / 196 / 182 / 234 KB |
| The eleven AI questions (real model) | 66 s in all | 44 s; output tokens −57%, input +13%, cost about the same |
| "Can I afford $60 this weekend?" | two verdicts in one answer | one verdict, decided by our code, the same every time |
| Words, same data: Today / Calendar / Goals / Updates / Ideas | 86 / 312 / 282 / 609 / 451 | 74 / 308 / 278 / 610 / page gone |

## What else changed

- The look is ours: Settings comes up from below as doors, lists are tiles, related views are horizon tabs, on/off is
  the sky switch, and every icon in the app is our pixel art (about 70, guarded by `look.test.ts` with no exceptions).
- One tap: when the skyling offers to do something, "Do it" and "Not now"; under an answer that created to-dos or events,
  Undo takes exactly those back (anything changed since stays).
- Privacy: with the Money lock on, notifications say only "Money heads-up" and cards hide money lines.
- Nothing lies over anything: the timeline's labels and stars, the floating button (gone), the idea cloud over Today's bar.
- Celebrations, the new logo and opening screen, and a laptop Today that uses the screen.

## Still not good enough

1. Updates is the wordiest screen (610 words, 95 controls on a busy day). Next: one card per day with the rest folded.
2. Today's page is still heavy (343 KB of markup, mostly the sky drawing); it loads fast, but it's the next weight to cut.
3. The welcome's week box can end with an offer ("Want me to find free study blocks?") that can't be answered there.
4. Only the owner can unlock: the App Store (Apple Developer), real banks (Plaid production), texting (Twilio), Teams
   (Microsoft), Gmail for everyone (Google verification) and payments (Stripe keys).
5. No real student has used it yet. The 10-student test is the real-world test that counts.

Next: a marketing and relaunch plan for the owner's approval.
