import type { JarvisModule } from "@/server/db/schema";

export const STARTERS: Record<JarvisModule, string[]> = {
  home: ["What do I need to get done today?", "Summarize my week and tell me what to focus on", "Help me plan tomorrow around my commitments"],
  finances: ["How much have I spent on food this month?", "Why am I spending more than usual?", "Can I afford to spend $100 this weekend?"],
  wealth: ["What's my current net worth?", "Summarize my investment accounts", "How are my savings goals tracking?"],
  school: ["What's due this week?", "Add these assignments for me: …", "Build a study plan for my next exam"],
  work: ["How many hours am I scheduled this week?", "Estimate my earnings this month", "Do any shifts conflict with my classes?"],
  calendar: ["What does my week look like?", "Find time for three 1-hour study sessions", "Any conflicts in the next two weeks?"],
  tasks: ["What should I work on first?", "Break my biggest task into subtasks", "Add: renew parking permit by Friday"],
  notes: ["Turn my latest note into an action plan", "Find my notes about…", "Help me organize my business idea into a plan"],
  settings: ["What do you remember about me?", "Which integrations are connected?", "Remember that I prefer studying in the morning"],
};

/** Follow-ups keyed by the last tool Jarvis used. */
export const FOLLOW_UPS: Record<string, string[]> = {
  import_assignments: ["Plan study time for these", "Show everything due this week"],
  create_tasks: ["What should I do first?", "Schedule time for these tasks"],
  spending_summary: ["Compare with last month", "How can I cut this without much hassle?"],
  compare_spending: ["Set a budget for my top category", "Show the biggest transactions"],
  get_agenda: ["Find free time for studying", "Any conflicts I should fix?"],
  get_daily_briefing: ["Plan my day hour by hour", "What can I push to tomorrow?"],
  check_affordability: ["Which bills are coming up?", "How would this affect my savings goal?"],
  work_earnings: ["Compare with my actual deposits", "How many hours until I hit my goal?"],
};
