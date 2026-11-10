import { describe, expect, it } from "vitest";
import { savesSomething } from "@/lib/tool-saves";
import { toolSpecs } from "@/server/jarvis/registry";

// Lookups never get a "✓ Saved" line or redraw Today; anything that saves does.
const LOOKUPS = new Set([
  "budget_check",
  "budget_status",
  "cash_forecast",
  "check_affordability",
  "compare_spending",
  "course_materials",
  "debt_plan",
  "draft_email",
  "emergency_fund_plan",
  "find_free_time",
  "find_subscriptions",
  "goal_tradeoff",
  "goals_today",
  "grade_check",
  "integration_status",
  "investing_projection",
  "investment_holdings",
  "investment_overview",
  "life_load",
  "load_tools",
  "money_findings",
  "money_lesson",
  "money_overview",
  "monthly_money_report",
  "plan_paycheck",
  "query_transactions",
  "read_attachment",
  "read_email",
  "recurring_payments",
  "search_email",
  "search_notes",
  "spending_summary",
  "suggest_budgets",
  "tonight",
  "transactions_to_review",
  "web_search",
  "work_earnings",
]);
const isLookup = (n: string) => LOOKUPS.has(n) || /^(get|list)_/.test(n);

describe("savesSomething", () => {
  it("knows every registered tool: lookups don't save, everything else does", () => {
    const names = toolSpecs().map((t) => t.name);
    expect(names.length).toBeGreaterThan(50);
    const wrong = names.filter((n) => savesSomething(n) === isLookup(n));
    expect(wrong).toEqual([]);
  });
});
