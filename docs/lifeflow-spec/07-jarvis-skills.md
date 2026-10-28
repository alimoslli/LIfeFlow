# Jarvis Skills

## Skills system
Give Jarvis a modular skills system. A skill is a self-contained capability. Each one needs:
- A Markdown file (`skills/<name>/SKILL.md`) that says when to use it, step-by-step instructions, quality rules, and example inputs and outputs.
- The tools it's allowed to use, such as web search, calendar, to-dos, money, trips, memory and notes.
- An eval set of 5–10 test prompts with expected behavior.

How skills run:
- **Routing:** before replying, Jarvis picks the relevant skill or skills based on the request and the user's context, loads their instructions, then acts. It can chain several skills, for example trip planning with budgeting and calendar.
- **Self-improving:** usage and feedback are logged per skill. Low-rated answers are flagged so the skill's instructions can be refined. Track each skill's success rate on an admin and debug screen.
- **Extensible:** adding a new skill only takes a new folder. There's no core code change.

## Starter skills

**Planning and time**
- **Daily planner:** builds the morning brief, time-blocks the day, and resolves clashes.
- **Weekly review:** recaps the week, shows wins and what slipped, and plans next week.
- **Smart scheduler:** finds free time, books study blocks, and moves things around when conflicts come up.
- **Task breakdown:** splits a big task or project into subtasks with time estimates.
- **Reminder and follow-up:** sets reminders and nudges about anything left open.

**School**
- **Syllabus parser:** turns a PDF syllabus into deadlines and a study plan.
- **Study coach:** builds study plans, spaced repetition and practice quizzes from notes and materials.
- **Tutor:** explains concepts step by step, checks the user's understanding, and doesn't just hand over answers.
- **Writing helper:** outlines, gives feedback, checks citations, and stays academically honest.
- **Exam prep:** counts down to exams and plans the topics to cover each day.

**Work**
- **Shift manager:** handles shifts, hours, pay estimates and trades, and spots overload.
- **Career helper:** reviews resumes, preps for interviews, and tracks job applications.

**Money**
- **Budget coach:** explains spending, catches overspending, and suggests fixes.
- **Paycheck planner:** splits each paycheck across bills, budgets and goals.
- **Subscription hunter:** finds recurring charges and suggests what to cancel.
- **Savings goals:** builds a plan to reach each goal and tracks progress.
- **Purchase advisor:** asks "can I afford this?" against the user's budget and upcoming bills.

**Travel**
- **Trip planner:** plans whole itineraries, day by day.
- **Layover planner:** works out usable time, airport transfers, a route through the city and a "head back by" time.
- **Local transport guide:** trains, metro and buses, with routes, prices, schedules and tickets.
- **Packing and prep:** packing lists, documents, visa and entry checks, and weather.

**Research and knowledge**
- **Web research:** live search across multiple sources, with citations and verified facts only.
- **Fact checker:** verifies claims before stating them, and labels anything it couldn't confirm.
- **Summarizer:** summarizes articles, PDFs, emails and long notes.
- **Comparison:** builds side-by-side comparisons of products, options or plans.

**Life and wellbeing**
- **Wellbeing check-in:** tracks energy and mood, watches for burnout, and handles rough day mode.
- **Habit builder:** tracks streaks and suggests gentle adjustments.
- **Health basics:** sleep, meals and exercise planning. It's not medical advice, and it points to professionals when needed.
- **Meal and grocery planner:** budget-friendly meal plans and shopping lists.
- **Life admin:** forms, deadlines, renewals, and appointments to book.
- **Student perks finder:** discounts, financial aid deadlines and campus resources.

**Communication**
- **Message drafter:** drafts emails and texts to professors, managers or friends. The user reviews and sends them.
- **Meeting prep:** puts together agendas, talking points and notes.

**Memory and personalization**
- **Get to know you:** asks curious, well-timed questions and saves the answers to memory.
- **Memory manager:** keeps learned facts accurate, removes duplicates, and shows the user what Jarvis knows.

**Actions in the app**
- **App operator:** creates, edits and deletes anything in LifeFlow on command, then confirms exactly what changed. Deletions and anything involving money get confirmed first.

## Rules for every skill
- Follow everything in `04-jarvis-behavior.md`: be accurate, cite sources, never guess, ask when something is unclear, and actually do the task.
- Use the user's memory and app data to personalize the result.
- Keep answers short by default, with detail on request.
