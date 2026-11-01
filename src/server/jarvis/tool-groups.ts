import { z } from "zod";
import { defineTool } from "./tool";

/**
 * Jarvis's tools in fixed groups, so each request sends only what the question
 * needs (all of them are ~16k tokens; the core is ~2k). Groups never change
 * shape per request: OpenAI caches a prompt by its exact start, and a stable
 * set of tools keeps that cache warm. If the model finds it's missing a tool,
 * load_tools adds a group for the rest of the turn.
 */

export const TOOL_GROUPS = [
  "core",
  "school",
  "calendar",
  "money",
  "money_edit",
  "savings",
  "work",
  "notes",
  "email",
  "health",
  "habits",
  "projects",
  "memory",
] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];
export type LoadableGroup = Exclude<ToolGroup, "core">;

/** Every tool is in exactly one group (a unit test checks this). Core is always sent. */
export const GROUP_TOOLS: Record<ToolGroup, string[]> = {
  core: [
    "get_daily_briefing",
    "list_tasks",
    "create_tasks",
    "update_task",
    "get_task",
    "delete_task",
    "save_memory",
    "update_memory",
    "integration_status",
    "read_attachment",
    "web_search",
    "load_tools",
  ],
  school: [
    "sync_canvas",
    "grade_check",
    "list_courses",
    "create_course",
    "update_course",
    "delete_course",
    "list_assignments",
    "import_assignments",
    "update_assignment",
    "delete_assignment",
    "course_materials",
  ],
  calendar: ["life_load", "get_agenda", "find_free_time", "create_events", "update_event", "delete_event"],
  // Looking things up. Changes are in money_edit, sent only when the user asks to change something.
  money: [
    "money_overview",
    "list_accounts",
    "spending_summary",
    "compare_spending",
    "query_transactions",
    "transactions_to_review",
    "list_categories",
    "budget_status",
    "budget_check",
    "money_findings",
    "recurring_payments",
    "find_subscriptions",
    "check_affordability",
    "cash_forecast",
    "monthly_money_report",
  ],
  money_edit: [
    "add_account",
    "update_account_details",
    "sync_bank_accounts",
    "add_transaction",
    "edit_transaction",
    "delete_transaction",
    "categorize_transactions",
    "recategorize_transaction",
    "set_budget",
    "suggest_budgets",
    "apply_budget_plan",
    "add_bill",
    "update_bill",
    "delete_bill",
  ],
  savings: [
    "list_goals",
    "create_goal",
    "update_goal",
    "delete_goal",
    "contribute_to_goal",
    "goal_tradeoff",
    "emergency_fund_plan",
    "plan_paycheck",
    "debt_plan",
    "investment_holdings",
    "investment_overview",
    "investing_projection",
    "money_lesson",
  ],
  work: [
    "list_jobs",
    "add_job",
    "update_job",
    "remove_job",
    "set_regular_hours",
    "list_shifts",
    "add_shifts",
    "record_shift_hours",
    "update_shift",
    "delete_shift",
    "work_earnings",
    "add_paycheck",
  ],
  notes: ["search_notes", "get_note", "save_note", "delete_note"],
  email: ["search_email", "read_email", "draft_email", "send_email", "sync_google_calendar", "add_google_calendar_event"],
  health: ["get_health_summary", "log_health"],
  habits: [
    "list_habits",
    "create_habit",
    "delete_habit",
    "check_habit",
    "list_personal_goals",
    "create_personal_goal",
    "update_personal_goal",
    "delete_personal_goal",
    "goals_today",
    "log_goal_checkin",
  ],
  projects: ["list_projects", "create_project", "update_project", "delete_project"],
  memory: ["list_memories", "forget_memory"],
};

const GROUP_INFO: Record<LoadableGroup, string> = {
  school: "courses, assignments, exams, grades, Canvas",
  calendar: "schedule, events, free time, how full each day is",
  money: "look up accounts, transactions, spending, budgets, bills, subscriptions, affordability, cash forecast",
  money_edit: "add, edit, delete or categorize transactions; set budgets; add or change bills; accounts and bank sync",
  savings: "savings goals, paycheck plans, debt, investing",
  work: "jobs, shifts, hours, pay estimates, paychecks",
  notes: "the user's notes",
  email: "Gmail and Google Calendar",
  health: "sleep, steps, workouts",
  habits: "habits, streaks and goals that aren't about money (fitness, reading, school)",
  projects: "projects that group to-dos",
  memory: "list or forget what you remember about the user",
};

const groupOfTool = new Map(Object.entries(GROUP_TOOLS).flatMap(([g, names]) => names.map((n) => [n, g as ToolGroup] as const)));
export const groupOf = (tool: string): ToolGroup | undefined => groupOfTool.get(tool);

const loadable = TOOL_GROUPS.filter((g): g is LoadableGroup => g !== "core");

export const loadToolsTool = defineTool({
  name: "load_tools",
  description: `Adds a group of tools for the rest of this answer. Call it when the tools you have can't do what the user asked, before ever saying you can't. Groups: ${loadable.map((g) => `${g} (${GROUP_INFO[g]})`).join("; ")}.`,
  schema: z.object({
    groups: z
      .array(z.enum(loadable as [LoadableGroup, ...LoadableGroup[]]))
      .min(1)
      .max(loadable.length),
  }),
  mutates: false,
  async execute({ groups }) {
    return { loaded: groups, tools: groups.flatMap((g) => GROUP_TOOLS[g]) };
  },
});
