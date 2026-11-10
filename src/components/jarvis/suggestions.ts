import type { JarvisModule } from "@/server/db/schema";

export const STARTERS: Record<JarvisModule, string[]> = {
  home: ["What do I need to get done today?", "Summarize my week and tell me what to focus on", "Help me plan tomorrow around my commitments"],
  finances: ["How much have I spent on food this month?", "Why am I spending more than usual?", "Can I afford to spend $100 this weekend?"],
  wealth: ["What's my current net worth?", "Summarize my investment accounts", "How are my savings goals tracking?"],
  school: ["What's due this week?", "Add these assignments for me: …", "Build a study plan for my next exam"],
  work: ["How many hours am I scheduled this week?", "How many paid hours this month?", "Do any shifts conflict with my classes?"],
  calendar: ["What does my week look like?", "Find time for three 1-hour study sessions", "Any conflicts in the next two weeks?"],
  tasks: ["What should I work on first?", "Break my biggest task into subtasks", "Add: renew parking permit by Friday"],
  notes: ["Turn my latest note into an action plan", "Find my notes about…", "Help me organize my business idea into a plan"],
  settings: ["What do you remember about me?", "Which integrations are connected?", "Remember that I prefer studying in the morning"],
};

/** Follow-ups keyed by the last tool Jarvis used. */
export const FOLLOW_UPS: Record<string, string[]> = {
  grade_check: ["Plan study time for the final", "Quiz me on the material"],
  import_assignments: ["Plan study time for these", "Show everything due this week"],
  create_tasks: ["What should I do first?", "Schedule time for these tasks"],
  spending_summary: ["Compare with last month", "How can I cut this without much hassle?"],
  compare_spending: ["Set a budget for my top category", "Show the biggest transactions"],
  get_agenda: ["Find free time for studying", "Any conflicts I should fix?"],
  get_daily_briefing: ["Plan my day hour by hour", "What can I push to tomorrow?"],
  check_affordability: ["Which bills are coming up?", "How would this affect my savings goal?"],
  work_earnings: ["Do these hours clash with school?", "Which week is my heaviest?"],
  web_search: ["Compare the top options", "What's the catch?"],
  money_overview: ["Which bills are coming up?", "Where did my money go this month?"],
  monthly_money_report: ["Where can I save next month?", "Plan my next paycheck"],
  budget_status: ["Move money between budgets", "Which category is running high?"],
  query_transactions: ["Group these by category", "Any charges I should cancel?"],
  find_subscriptions: ["Which ones should I cancel?", "Find a cheaper plan for my phone bill"],
  plan_paycheck: ["Set reminders for these bills", "Put the rest toward my goal"],
  list_tasks: ["What should I do first?", "Move what I can't finish to tomorrow"],
  money_findings: ["Help me ask my bank to refund a fee", "Track the subscriptions you found"],
  transactions_to_review: ["The rest are right", "Show me more"],
  categorize_transactions: ["Anything else you're unsure about?"],
  life_load: ["Move study time off my heaviest day", "Block time to get ahead on my lightest day"],
  create_events: ["Any conflicts this week?", "Add a reminder before it"],
  find_free_time: ["Block the first slot for studying", "Find time for the gym too"],
  list_assignments: ["Build a study plan for these", "What's due first?"],
  add_shifts: ["How many paid hours is that?", "Do these clash with classes?"],
  set_regular_hours: ["Do my hours clash with any classes?", "How many paid hours is that a month?"],
  add_job: ["Set my regular hours", "Add this week's shifts"],
  add_paycheck: ["When did I last get paid?", "Where should this paycheck go?"],
  add_account: ["What do I have available now?", "Set a savings goal"],
  delete_habit: ["Start a different habit", "Show my habits"],
  list_habits: ["Which habit is off track?", "Start a new habit"],
  list_goals: ["Am I on track for my goals?", "How much should I save each week?"],
  save_memory: ["What else do you know about me?"],
};

/** When no tool ran: two of the page's starters, skipping the question that was just asked. */
export function defaultFollowUps(module: JarvisModule, lastQuestion: string | undefined) {
  return STARTERS[module].filter((s) => !s.endsWith("…") && s !== lastQuestion).slice(0, 2);
}

/** The two taps under an answer that ends by offering to do something. "Do it" is sent as the person's reply. */
export const OFFER_REPLIES = ["Do it", "Not now"] as const;

/**
 * True when the answer's last sentence offers to act ("Want me to move it to Wednesday?", "Should I add it?"), so
 * yes is one tap instead of typing it. A plain question back ("Which class is it for?") is not an offer.
 */
export function offersToAct(text: string): boolean {
  const last = (
    text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .at(-1) ?? ""
  ).trim();
  if (!last.endsWith("?")) return false;
  return /\b(want me to|do you want me to|would you like me to|should i|shall i|ok(ay)? if i|want to do that|want that)\b/i.test(last);
}

/** Tools whose results the chat can take back with Undo (what a turn created); the server checks the same list. */
export const UNDOABLE_TOOLS = ["create_tasks", "create_events"] as const;
