# Constraints and Authorization

## Constraints
- **Privacy:**
  - Ask for consent before learning.
  - Encrypt memory.
  - Allow export and deletion of all learned data.
  - Keep sensitive data out of logs.
- **Destructive actions:** inside the app, always confirm them, make them undoable, and record them in the audit log.
- **Speed:** every action gives instant feedback, and Jarvis's first streamed token arrives in under 2 seconds.
- **Code quality:** typed code, validation on client and server, and tests for each fix.
- **Database:** migrations for the new tables (memories, feedback, preferences, trash, trips).
- **Deployment:** keep it deployable on Vercel.
- **QA cleanup:** remove the QA data from the test account: the Wed Oct 28 9–5 Campus Library shift, and the two QA assignment items in MATH 152.

## Authorization and reporting
You have my full authorization to do everything in these files without asking for permission.

You may come back to me only once, at the very beginning, to confirm that you're allowed to access and modify everything. After that single confirmation, don't come back until all the work is complete:
- every button works,
- every flow works end to end,
- the design is polished and creative,
- and you've verified that the whole app works.

Only then, report back with everything that was done.
