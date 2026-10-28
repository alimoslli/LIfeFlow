# Test Findings

## Bugs to fix
1. Shifts and assignments can't be edited or deleted, and Jarvis has no tool for it either. Add edit and delete for both, plus matching Jarvis tools.
2. Submitting "Add shift" with an empty form creates a 9–5 shift for today, which then sets off a false overlap alert. Make the fields required.
3. "Add assignment" saves with no due date and closes without any message. Validate it, or clearly confirm it was saved with no date.
4. Money → Transactions shows "Credit Card Payment · undefined". Fix that, and guard against undefined or null text everywhere in the app.
5. Actions are slow and show no feedback:
   - about 2–3 seconds to add a to-do,
   - about 5 seconds for a new note,
   - about 20 seconds for a Jarvis reply.

   Add optimistic UI and loading states, stream Jarvis replies, and fix the slow endpoints.
6. Deleting a to-do has no confirmation or undo, while deleting a note does ask. Use one pattern everywhere: an undo toast plus a trash.
7. Saving a to-do gives no confirmation, and titles over 300 characters fail silently. Add save feedback and a visible character limit.
8. Spending totals don't match across pages:
   - Money shows $2,015 for October.
   - Transactions shows $7,901.
   - Budgets shows "$879.66 of $650", while Food alone is at $852 of $450.

   Put a clear time range on every total and make them reconcile.
9. The portfolio total on Today doesn't match the one on Money. Use one source of truth with a "last updated" time.
10. Shifts from past days still say "Scheduled". Prompt for actual hours, or mark them complete.
11. The Add button on Plan opens Jarvis instead of a form. Show a form first, with Jarvis as an option.
12. The Settings entry ("Welcome, Alex") doesn't look clickable, and some labels and chart text are too small.

## Missing features
- Drag-and-drop calendar events, with create and edit directly on the calendar
- Recurring to-dos and reminders
- Undo and trash
- A ⌘K search palette across the whole app
- Google Calendar sync
- A forgot-password flow

## Keep as is
- The Today dashboard and the "Jarvis noticed" cards
- The calm, glassy design
- Jarvis being honest about its limits
- Markdown notes and subtasks
- Data export and the audit log
- The friendly 404 page
