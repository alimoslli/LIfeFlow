import { redirect } from "next/navigation";

/**
 * No Budget page (owner, 2026-11-10). Budgets the skyling set still show as Money's heads-ups, and changing one is a
 * sentence to the skyling. Old links land on Money.
 */
export default function BudgetsPage() {
  redirect("/money");
}
