# Jarvis eval: right answer, fewest steps

The goal: Jarvis answers each question with the fewest tool calls that fully answer it, using only real numbers from those tools, in a short reply with one clear next step.

- Questions, plans and answers: `tests/fixtures/jarvis-eval.ts`
- Test: `tests/integration/jarvis-eval.test.ts`. It seeds the student below and checks that each question:
  - routes to the right skill;
  - is allowed by that skill's tools;
  - fits its tool-call budget;
  - gets tool results that contain every fact the answer quotes.
- Prompt rule (INSTRUCTIONS, "How you work"): "Use the fewest tool calls that fully answer. If one tool answers the question, call only that one. Call independent tools together in one step, and never fetch again what is already in this conversation."

## The student

It's Monday, Nov 2, 2026, 10 AM in New York.

- **Classes:**
  - BIO 110 meets MWF 10:00 to 10:50. Exam 2 is Thursday at 10 AM.
  - ENG 102 meets Tue/Thu 1:00 to 2:15. The Argument essay draft is due Wednesday at 11:59 PM.
- **Work:** barista at Campus Coffee, $15 an hour. Shifts are Monday 4 to 9 PM, Wednesday 5 to 10 PM, and Saturday 9 AM to 3 PM with a 30-minute unpaid break.
- **Money:**
  - Six months of a messy, realistic bank feed (`tests/fixtures/student-bank.ts`) and $842.17 in checking.
  - An emergency fund at $350 of $1,000, due Dec 31.
- **To-do:** return library books, due today.

## The 10 questions

| # | Question | Skill | Minimal plan | Budget |
|---|---|---|---|---|
| 1 | What do I need to get done today? | daily-planner | get_daily_briefing | 1 |
| 2 | Can I afford to spend $60 this weekend? | purchase-advisor | check_affordability (60, by Sunday) | 1 |
| 3 | Where did my money go last month? | budget-coach | spending_summary (October) | 1 |
| 4 | What subscriptions am I paying for? | subscription-hunter | find_subscriptions | 1 |
| 5 | What's due this week? | study-coach | list_assignments (week) | 1 |
| 6 | How many hours am I working this week and how much will I make? | shift-manager | work_earnings (this week) | 1 |
| 7 | Which day this week is going to be the hardest? | smart-scheduler | life_load | 1 |
| 8 | Add a to-do to email my advisor by Friday | reminders-follow-up | create_tasks | 1 |
| 9 | Am I on track for my savings goal? | savings-goals | list_goals | 1 |
| 10 | Find me 2 hours to study for my BIO exam before Thursday | study-coach | find_free_time, then create_events | 2 |

That's 11 tool calls for 10 questions.

## Perfect answers

1. You're in BIO 110 until 10:50, then work at Campus Coffee 4 to 9 PM. One to-do: return the library books. Coming up: your ENG 102 essay draft is due Wednesday at 11:59 PM and BIO 110 Exam 2 is Thursday at 10 AM. Use the 10:50 to 4 gap for the essay draft, and drop the books off on your way to work.
2. Not this weekend. You have $842.17 in checking, but rent ($950) usually comes out around the 1st and I don't see it yet. Progressive ($118.40) is due Thursday, plus a few small subscriptions. With your usual $27.80 a day, you'd be about $498 short by Sunday, even before the $60. Check that rent went through, and wait until your next paycheck lands.
3. In October you spent $2,328.26 and $1,304.13 came in, so you ran $1,024.13 short. The big pieces: Housing $1,052.73 (rent $950, Georgia Power $102.73), Shopping $398.55 (mostly Amazon, $299.20 over 6 orders), Food & Dining $351.57 (Kroger $262.72, Starbucks $88.85 over 14 visits) and Bills & Subscriptions $209.51. You also paid $38 in bank fees. Halving Amazon and Starbucks would save about $194 a month.
4. 8 subscriptions, $108.43 a month ($1,301.16 a year): Planet Fitness $24.99, OpenAI $20, Netflix $15.49, Amazon Prime $14.99, Spotify $11.99, Disney+ $9.99, Hulu $7.99 and Apple $2.99. Netflix, Disney+ and Hulu do the same job ($401.64 a year together), so dropping one or two is the easiest win. Spotify, Prime and Hulu have offered student plans, worth checking. Your bills are separate: rent $950, Progressive $118.40, Georgia Power about $102.73 (it varies) and T-Mobile $68.12. I found all of these in your bank history. Want me to track them?
5. Two things: your ENG 102 Argument essay draft is due Wednesday at 11:59 PM, and BIO 110 Exam 2 is Thursday at 10 AM. Want me to block study time for the exam?
6. 15.5 paid hours over 3 shifts at Campus Coffee (the unpaid break on Saturday is already taken out). I can't predict what you'll make from hours, because pay changes with taxes, tips and pay periods; once your paycheck lands, it'll show what you actually got.
7. Today (8.5 hours): BIO 110 this morning, about 1.6 hours of Exam 2 prep, and work 4 to 9 PM. Wednesday is close behind (7.2 hours) with work 5 to 10 PM. Tomorrow is light (3.2 hours), so that's the day to get ahead on Exam 2 and the essay.
8. Added: Email my advisor, due Friday, Nov 6. It's in your to-dos.
9. Not yet. Your emergency fund is at $350 of $1,000 (35%), with $650 to go by Dec 31. That's about $335.36 a month, and nothing has gone in recently. Want me to set up a weekly amount so you hit it?
10. Booked: Study for BIO 110 Exam 2, Tuesday 3 to 5 PM. Tuesday afternoon is wide open and it's two days before the exam. It's on your calendar.

## What the eval caught and fixed (Nov 1, 2026)

- **Affordability said yes when it should say no.**
  - Bills found in the bank feed but not tracked were ignored.
  - Spending was projected from this month only, which is $0 on the 2nd.
  - It now counts found bills (rent that hasn't posted yet is still due) and uses the 8-week day-to-day average, without bills.
  - The bill list also no longer gets overwritten by the total.
- **Free time offered slots that had already passed today.** Today now starts at the next quarter hour.
- **Goal math said $650 a month was needed for Nov 2 to Dec 31.** It now uses the real time left, so it's $335.36.
- **Raw bank text appeared as names.** "PAYPAL *HULU 402-935-7733" is now "Hulu", and "RENT PAYMENT ... ACH MPH3SYTB" is now "Rent Campus Edge Apts".
- **The daily briefing gave due times in UTC.** An essay due Wed 11:59 PM read as Thursday; it now uses local time.
- **Spotify was called a duplicate of Netflix.** Video and music are now separate groups.
- **"It gets lighter after today" was shown when Wednesday was nearly as heavy.** It now names the other heavy day.
- **Routing:** questions 1, 3, 5 and 7 matched no skill, and question 8 went to the email drafter. Added triggers, and each skill now says when one call is enough.

## Adding questions

1. Add an entry to `EVAL` with the question, skill, plan and budget.
2. Run `EVAL_PRINT=/tmp/out.txt npx vitest run tests/integration/jarvis-eval.test.ts` to see the real tool results.
3. Write the answer from those results only, and list the facts it quotes.
4. If routing fails, add a trigger to the skill and a prompt to its `evals.json`, then run `npm run skills`.

Scoring the live model's wording needs the real OpenAI key; this eval checks everything up to the model: routing, tools, budget and data.
