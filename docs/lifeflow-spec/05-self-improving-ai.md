# Self-Improving Jarvis

This is a per-user learning loop, not per-message model training.

1. **Learn from every message.** After each message, extract durable facts and preferences.
   - Store them in per-user memory with a confidence score, source and timestamp.
   - Merge duplicates, and let newer evidence win.
2. **Retrieve before replying.** Before each reply, pull in the relevant memories and context.
3. **Feedback loop.** Capture feedback and use it to tune tone, length and how proactive Jarvis is.
   - Explicit: thumbs up or down, corrections and edits.
   - Implicit: suggestions accepted, ignored or undone.
4. **Calibrate from outcomes.** Adjust time estimates, best study hours, spending patterns and travel preferences based on what really happened.
5. **Visible, editable memory.** In "Jarvis & memory", users can edit, delete, pause or reset what Jarvis has learned, and see a "what Jarvis learned this week" summary.
6. **Shared improvements are opt-in.** Any learning shared across users is anonymized and aggregated. Never mix one user's data into another user's answers.
7. **Measure it.** Track ratings, acceptance, task completion and answer accuracy, and keep a small eval suite so changes to prompts or memory are measured.
