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
  investment_holdings: "Reading investments",
  list_jobs: "Checking jobs",
  add_job: "Adding job",
  list_shifts: "Checking shifts",
  add_shifts: "Adding shifts",
  record_shift_hours: "Recording hours",
  update_shift: "Updating shift",
  delete_shift: "Preparing to delete shift",
  work_earnings: "Estimating earnings",
  search_notes: "Searching notes",
  get_note: "Reading note",
  save_note: "Saving note",
  delete_note: "Preparing to delete note",
  money_overview: "Checking your money",
  sync_bank_accounts: "Syncing your banks",
  cash_forecast: "Forecasting your cash",
  budget_check: "Checking your budgets",
  suggest_budgets: "Building a budget plan",
  apply_budget_plan: "Saving budgets",
  recategorize_transaction: "Recategorizing",
  edit_transaction: "Updating transaction",
  delete_transaction: "Preparing to delete transaction",
  list_goals: "Checking your goals",
  create_goal: "Creating goal",
  update_goal: "Updating goal",
  delete_goal: "Preparing to delete goal",
  contribute_to_goal: "Preparing to record savings",
  goal_tradeoff: "Comparing options",
  plan_paycheck: "Planning your paycheck",
  find_subscriptions: "Finding subscriptions",
  debt_plan: "Building a debt plan",
  update_account_details: "Preparing to update account",
  emergency_fund_plan: "Planning your emergency fund",
  investment_overview: "Reviewing investments",
  investing_projection: "Projecting growth",
  monthly_money_report: "Preparing your money report",
  money_lesson: "Finding a lesson",
  search_email: "Searching your email",
  read_email: "Reading email",
  send_email: "Preparing to send email",
  sync_google_calendar: "Syncing Google Calendar",
  add_google_calendar_event: "Preparing to add to Google Calendar",
  get_health_summary: "Checking your health data",
  save_memory: "Remembering",
  update_memory: "Updating memory",
  list_memories: "Reading memory",
  forget_memory: "Forgetting",
  integration_status: "Checking integrations",
  draft_email: "Drafting email",
  read_attachment: "Reading attachment",
  web_search: "Searching the web",
  list_trips: "Checking trips",
  get_trip: "Reading the trip",
  create_trip: "Creating the trip",
  add_trip_items: "Adding to the trip",
  delete_trip_item: "Preparing to remove from the trip",
  update_course: "Updating course",
  delete_course: "Preparing to delete course",
  update_project: "Updating project",
  delete_project: "Preparing to delete project",
  update_job: "Updating job",
  remove_job: "Preparing to remove job",
  list_habits: "Checking habits",
  create_habit: "Starting a habit",
  check_habit: "Checking off habit",
  add_bill: "Tracking bill",
  update_bill: "Updating bill",
  delete_bill: "Preparing to stop tracking bill",
};

export const describeToolCall = (name: string) => LABELS[name] ?? name.replace(/_/g, " ");

/** Short factual summary of a tool result for the chat UI. */
export function describeToolResult(name: string, r: ToolResultRecord): { summary: string; viewAt?: string; sources?: { title: string; url: string }[] } {
  if (!r.ok) return { summary: r.error ?? "Failed" };
  const d = (r.data ?? {}) as Record<string, unknown>;
  const viewAt = typeof d.viewAt === "string" ? d.viewAt : undefined;
  const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
  const plural = (c: number, w: string) => `${c} ${w}${c === 1 ? "" : "s"}`;
  switch (name) {
    case "web_search": {
      if (typeof d.unavailable === "string") return { summary: d.unavailable };
      const sources = Array.isArray(d.sources) ? (d.sources as { title: string; url: string }[]) : [];
      return { summary: sources.length ? `Read ${plural(sources.length, "source")}` : "No sources found", sources };
    }
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
    case "update_memory": {
      const summaries: Record<string, string> = {
        saved: "Saved to memory",
        updated: "Memory updated",
        proposed: "Suggested, waiting for your OK",
        already_known: "Already remembered",
        already_suggested: "Already waiting for your OK",
        previously_dismissed: "Not suggested again (you dismissed it)",
        suggestions_off: "Not saved: suggestions are off",
        too_many_pending: "Not saved: too many suggestions waiting",
        unchanged: "Nothing to change",
        approved_by_user: "Saved to memory (you approved)",
        dismissed_by_user: "Suggestion dismissed",
      };
      return { summary: summaries[String(d.status)] ?? "Done", viewAt: "/jarvis/memory" };
    }
    case "forget_memory":
      return { summary: "Archived. You can restore it in What Jarvis knows", viewAt: "/jarvis/memory" };
    case "save_note":
      return { summary: `Note ${d.action ?? "saved"}`, viewAt };
    case "draft_email":
      return d.savedToGmail ? { summary: "Draft saved in Gmail (not sent)", viewAt } : { summary: "Draft prepared (not sent)" };
    case "search_email":
      return { summary: `Found ${plural(Number(d.count ?? 0), "email")}` };
    case "send_email":
      return { summary: d.sent ? "Sent (confirmed by Gmail)" : "Not sent" };
    case "sync_google_calendar": {
      const s = (d.synced ?? {}) as { total?: number };
      return { summary: `Synced ${plural(Number(s.total ?? 0), "event")}`, viewAt };
    }
    case "add_google_calendar_event":
      return { summary: "Added to Google Calendar", viewAt };
    default:
      return { summary: "Done", viewAt };
  }
}

/** A memory suggestion (Keep / Not now card) produced by this tool result, whether or not it's been decided since. */
export function memoryProposalOf(name: string, r: ToolResultRecord): { memoryId: string; content: string; replaces?: string } | null {
  if ((name !== "save_memory" && name !== "update_memory") || !r.ok) return null;
  const d = r.data as { status?: string; memory?: { id: string; content: string } | null; replaces?: { content: string } } | undefined;
  if (!d?.memory || !["proposed", "approved_by_user", "dismissed_by_user"].includes(d.status ?? "")) return null;
  return { memoryId: d.memory.id, content: d.memory.content, ...(d.replaces && { replaces: d.replaces.content }) };
}
