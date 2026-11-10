# Plain words pass, 2026-11-10 (reset item 5)

Scope: Money, School, Notes, Calendar (Plan), To-dos and Settings. Copy only; no behaviour, data or features changed.

How it was measured: a static scan of the JSX text and prose strings in each page's folder (`src/app/(app)/<page>`), before and after. Words are summed over every text string; "longest" is the longest single text block. The scan counts a few code lines as text (School's 33 is one such), so the real longest blocks are listed in the last column.

| Page | Words before | Words after | Longest block before | Longest block after |
|---|---|---|---|---|
| Money | 219 | 217 | 16 | 16 |
| Finances (Activity, Bills, Accounts) | 945 | 850 | 34 | 22 |
| School | 507 | 480 | 22 (grade card) | 16 |
| Notes | 149 | 140 | 12 | 12 |
| Plan | 298 | 298 | 25 (a prefilled chat prompt, not on screen) | 25 |
| Calendar | 120 | 120 | 12 | 12 |
| To-dos | 151 | 126 | 10 | 10 |
| Settings | 2,335 | 2,081 | 32 | 22 |
| Total | 4,724 | 4,330 | | |

Biggest changes:
- Settings, Connections: "Send your skyling a screenshot or a PDF of a statement. It adds the account and the transactions it can read, so Money still shows what you spent and what came in." is now "Send your skyling a screenshot or PDF of a statement."
- "Plaid", "access token", "Synced" and "Link"-style words are gone from the screens ("Bank not listed?", "Use a code instead", "Updated ...").
- Notification help on iPhone and "blocked" help cut from about 30 words to 12 and 11.
- "Assignment" is "homework" on buttons and sheet titles (Add homework, Edit homework, Delete homework, the trash list).
- Accounts and Bills: "kept up to date by themselves", "sync every day, and whenever your bank has something new" and similar behind-the-scenes lines are now short or gone.

Left long on purpose:
- The text-message consent paragraph in Settings, Text (legal), and the Terms and Privacy links.
- The delete-account warning, the two-step and passkey warnings, and the backup-codes line.
- The OpenAI disclosure on the AI switch in Settings (consent).
- The Apple Health Shortcut steps (someone follows them one by one; they are behind a fold-out).
- The page-level findings on Bills (real data, built from the person's own numbers).
- Pre-filled chat prompts (they go to the assistant, not on screen).
- Calendar day aria-labels ("15: 0 items") because a test relies on them and screen readers need them.

Not touched: Today, timeline, chat, the skyling's pages, Goals, Health, Work (another chat), the shell files.
