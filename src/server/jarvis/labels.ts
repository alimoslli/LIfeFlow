import type { ToolResultRecord } from "../db/schema";

const LABELS: Record<string, string> = {
  get_daily_briefing: "Reviewing your day",
  list_tasks: "Checking tasks",
  create_tasks: "Creating tasks",
  update_task: "Updating task",
  get_task: "Reading task",
  delete_task: "Preparing to delete task",
  list_projects: "Checking projects",
  create_project: "Creating project",
  list_courses: "Checking courses",
  create_course: "Creating course",
  list_assignments: "Checking assignments",
  import_assignments: "Saving assignments",
  update_assignment: "Updating assignment",
  delete_assignment: "Preparing to delete assignment",
  course_materials: "Course materials",
  get_agenda: "Checking your schedule",
  find_free_time: "Finding free time",
  create_events: "Adding to calendar",
  update_event: "Updating event",
  delete_event: "Preparing to delete event",
  list_accounts: "Reading account balances",
  spending_summary: "Analyzing transactions",
  compare_spending: "Comparing spending",
  query_transactions: "Searching transactions",
  add_transaction: "Recording transaction",
  list_categories: "Reading categories",
  budget_status: "Checking budgets",
  set_budget: "Saving budget",
  recurring_payments: "Reviewing bills & subscriptions",
  check_affordability: "Checking affordability",
  financial_goals: "Reviewing goals",
  investment_holdings: "Reading investments",
  list_jobs: "Checking jobs",
  add_job: "Adding job",
  list_shifts: "Checking shifts",
  add_shifts: "Adding shifts",
  record_shift_hours: "Recording hours",
  work_earnings: "Estimating earnings",
  search_notes: "Searching notes",
  get_note: "Reading note",
  save_note: "Saving note",
  delete_note: "Preparing to delete note",
  save_memory: "Saving to memory",
  list_memories: "Reading memory",
  forget_memory: "Forgetting",
  integration_status: "Checking integrations",
  draft_email: "Drafting email",
  read_attachment: "Reading attachment",
};

export const describeToolCall = (name: string) => LABELS[name] ?? name.replace(/_/g, " ");

/** Short factual summary of a tool result for the chat UI. */
export function describeToolResult(name: string, r: ToolResultRecord): { summary: string; viewAt?: string } {
  if (!r.ok) return { summary: r.error ?? "Failed" };
  const d = (r.data ?? {}) as Record<string, unknown>;
  const viewAt = typeof d.viewAt === "string" ? d.viewAt : undefined;
  const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
  const plural = (c: number, w: string) => `${c} ${w}${c === 1 ? "" : "s"}`;
  switch (name) {
    case "create_tasks":
      return { summary: `Created ${plural(n("created"), "task")}`, viewAt };
    case "import_assignments": {
      const parts = [`Saved ${plural(Number(d.savedCount ?? 0), "assignment")}`];
      if (n("skippedDuplicates")) parts.push(`${n("skippedDuplicates")} already existed`);
      if (n("needsCourse")) parts.push(`${n("needsCourse")} need a course`);
      if (n("errors")) parts.push(`${n("errors")} failed`);
      return { summary: parts.join(" · "), viewAt };
    }
    case "create_events":
      return { summary: `Added ${plural(n("created"), "event")}${n("conflicts") ? ` · ${plural(n("conflicts"), "conflict")}` : ""}`, viewAt };
    case "add_shifts":
      return { summary: `Added ${plural(n("created"), "shift")}`, viewAt };
    case "save_memory":
      return { summary: d.alreadyKnown ? "Already remembered" : "Saved to memory", viewAt: "/settings/memory" };
    case "save_note":
      return { summary: `Note ${d.action ?? "saved"}`, viewAt };
    case "draft_email":
      return { summary: "Draft prepared (not sent)" };
    default:
      return { summary: "Done", viewAt };
  }
}
