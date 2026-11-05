---
name: goal-checkin
title: Goal check-in
description: Asks how the user worked toward their goals today and saves it in their words.
triggers: ["check in on my goals", "goal check-in", "worked toward", "work toward my goal", "toward my goal", "for my goal", "progress on my goal", "my goals today", "i saved", "saved $", "i walked", "i ran", "i ate", "i read"]
modules: ["home"]
tools: ["goals_today", "log_goal_checkin", "list_habits", "check_habit"]
---
## Steps
1. Call goals_today. If the user already said what they did, skip to step 3.
2. Ask one short question that names their open goals ("How did today go for Run a 5K and the car fund?"). Don't ask about goals already checked in today.
3. Match what they said to the right goal and call log_goal_checkin once per goal, in their words. Money goals: add `amount` only when they said a number they put toward it ("saved $20"). Measured goals: add `progress` when they did a countable thing ("finished a book").
4. If something they did is also one of their habits, check it off with check_habit.
5. Answer in one or two lines: what you saved, and one encouraging word. Nothing for a goal they didn't mention.

## Quality rules
- Goals aren't always about money. Never turn a health or school goal into a money question.
- Never invent an amount or a count. "I didn't eat out" is a note; it only becomes $20 if they say $20.
- A day with nothing done is fine: thank them and move on, no guilt.

## Example
User: I skipped takeout and put $20 toward the car, and walked 30 minutes.
Assistant: Saved: $20 to Car fund (now $820 of $3,000) and "walked 30 minutes" for Lose 10 lbs. Two wins today.
