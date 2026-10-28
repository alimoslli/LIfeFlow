"use server";
import { PlaidError, removeItem } from "@/server/integrations/plaid";
import { applyBudgetPlan } from "@/server/services/finance/smart-budgets";
import { contributeToGoal, deleteGoal } from "@/server/services/finance/goals";
import { todayIn } from "@/lib/dates";
import { applyRuleToPast, deleteCategoryRule } from "@/server/services/finance/categorize";
import { formBool, formCents, formObject, mutate, type ActionState } from "@/server/actions";
import { ServiceError } from "@/server/services/errors";
import { archiveAccount, createManualAccount, updateAccountBalance, updateAccountDetails } from "@/server/services/finance/accounts";
import { createGoal, createRecurring, deleteBudget, setBudget, setRecurringStatus, updateGoal } from "@/server/services/finance/planning";
import { createTransaction, deleteTransaction, importTransactionsCsv, updateTransaction } from "@/server/services/finance/transactions";

const need = (v: number | undefined, what: string) => {
  if (v == null || Number.isNaN(v)) throw new ServiceError(`Enter a valid ${what}.`);
  return v;
};

export async function createAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("account.create", async (s) => {
    await createManualAccount(s, {
      name: f.name ?? "",
      type: (f.type as "depository") ?? "depository",
      subtype: f.subtype,
      institutionName: f.institutionName,
      mask: f.mask,
      currentBalanceCents: need(formCents(f.balance), "balance"),
      creditLimitCents: formCents(f.creditLimit),
      includeInNetWorth: f.includeInNetWorth !== "off",
    });
  });
}

export async function updateBalanceAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("account.balance", async (s) => {
    await updateAccountBalance(s, id, need(formCents(f.balance), "balance"));
  });
}

export async function updateAccountDetailsAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  const apr = f.apr != null ? Number(f.apr.replace(/%/g, "")) : null;
  return mutate("account.update_details", async (s) => {
    if (apr != null && !Number.isFinite(apr)) throw new ServiceError("Interest rate must be a number, like 24.99.");
    const a = await updateAccountDetails(s, id, {
      ...(f.balance != null && { currentBalanceCents: need(formCents(f.balance), "balance") }),
      creditLimitCents: formCents(f.limit) ?? null,
      aprBps: apr != null ? Math.round(apr * 100) : null,
      minPaymentCents: formCents(f.minPayment) ?? null,
      nextPaymentDueDate: f.dueDate ?? null,
    });
    return `Saved ${a.name}.`;
  });
}

export async function archiveAccountAction(id: string): Promise<ActionState> {
  return mutate("account.archive", async (s) => {
    await archiveAccount(s, id);
  });
}

export async function createTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("transaction.create", async (s) => {
    const amount = need(formCents(f.amount), "amount");
    const signed = f.direction === "in" ? Math.abs(amount) : -Math.abs(amount);
    await createTransaction(s, {
      accountId: f.accountId ?? "",
      date: f.date ?? "",
      description: f.description ?? "",
      amountCents: signed,
      categoryId: f.categoryId,
      kind: (f.kind as "expense") || undefined,
      notes: f.notes,
    });
  });
}

export async function updateTransactionAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("transaction.update", async (s) => {
    const row = await updateTransaction(
      s,
      id,
      { kind: f.kind as "expense", categoryId: f.categoryId ?? null, notes: f.notes ?? null, excluded: formBool(f.excluded) },
      { learn: true },
    );
    if (row.learnedRule) {
      const n = row.learnedRule.othersToUpdate;
      if (f.applyToPast && n) {
        const changed = await applyRuleToPast(s, row.learnedRule.id);
        return `Saved. ${row.learnedRule.merchant} will be categorized this way from now on, and ${changed} past transaction${changed === 1 ? " was" : "s were"} updated.`;
      }
      return `Saved. ${row.learnedRule.merchant} will be categorized this way from now on.${n ? ` ${n} older transaction${n === 1 ? "" : "s"} from it still use${n === 1 ? "s" : ""} another category.` : ""}`;
    }
    return "Saved.";
  });
}

export async function applyRuleAction(ruleId: string): Promise<ActionState> {
  return mutate("category_rule.apply", async (s) => {
    const n = await applyRuleToPast(s, ruleId);
    return `Updated ${n} transaction${n === 1 ? "" : "s"}.`;
  });
}

export async function deleteRuleAction(ruleId: string): Promise<ActionState> {
  return mutate("category_rule.delete", async (s) => {
    await deleteCategoryRule(s, ruleId);
    return "Rule removed. Future transactions from this merchant won't follow it.";
  });
}

export async function deleteTransactionAction(id: string): Promise<ActionState> {
  return mutate("transaction.delete", async (s) => {
    await deleteTransaction(s, id);
  });
}

export async function importCsvAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = String(fd.get("accountId") ?? "");
  const file = fd.get("file");
  return mutate("transaction.import_csv", async (s) => {
    if (!(file instanceof File) || file.size === 0) throw new ServiceError("Choose a CSV file.");
    if (file.size > 2 * 1024 * 1024) throw new ServiceError("CSV files must be 2 MB or smaller.");
    const r = await importTransactionsCsv(s, accountId, await file.text());
    return `Imported ${r.imported} transaction${r.imported === 1 ? "" : "s"}${r.duplicates ? `, skipped ${r.duplicates} already imported` : ""}${r.errors.length ? `, ${r.errors.length} row(s) couldn't be read (first: line ${r.errors[0].line})` : ""}.`;
  });
}

export async function setBudgetAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("budget.set", async (s) => {
    await setBudget(s, { month: f.month ?? "", categoryId: f.categoryId ?? "", limitCents: need(formCents(f.limit), "limit") });
    return "Budget saved.";
  });
}

/** Saves the lines of a suggested plan. Fields: month, and line:<categoryId> = dollars (blank or 0 skips). */
export async function applyBudgetPlanAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const month = String(fd.get("month") ?? "");
  const lines: { categoryId: string; limitCents: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("line:") || typeof v !== "string") continue;
    const cents = formCents(v.trim() || undefined);
    if (cents && cents > 0) lines.push({ categoryId: k.slice(5), limitCents: cents });
  }
  return mutate("budget.apply_plan", async (s) => {
    if (!lines.length) throw new ServiceError("Enter at least one amount.");
    const r = await applyBudgetPlan(s, { month, lines });
    return `Saved ${r.saved} budget${r.saved === 1 ? "" : "s"}.`;
  });
}

export async function deleteBudgetAction(id: string): Promise<ActionState> {
  return mutate("budget.delete", async (s) => {
    await deleteBudget(s, id);
  });
}

export async function createRecurringAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("recurring.create", async (s) => {
    const amount = Math.abs(need(formCents(f.amount), "amount"));
    await createRecurring(
      s,
      {
        name: f.name ?? "",
        amountCents: f.kind === "income" ? amount : -amount,
        frequency: (f.frequency as "monthly") ?? "monthly",
        nextDueDate: f.nextDueDate,
        kind: (f.kind as "bill") ?? "bill",
        categoryId: f.categoryId,
      },
      f.detected ? "detected" : "manual",
    );
  });
}

export async function setRecurringStatusAction(id: string, status: "active" | "paused" | "cancelled"): Promise<ActionState> {
  return mutate("recurring.status", async (s) => {
    await setRecurringStatus(s, id, status);
  });
}

const PURPOSES = ["emergency", "travel", "car", "home", "debt", "investing", "education", "big_purchase", "other"] as const;
const purposeOf = (v: string | undefined) => PURPOSES.find((p) => p === v) ?? "other";

export async function createGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("goal.create", async (s) => {
    const g = await createGoal(s, {
      name: f.name ?? "",
      targetCents: need(formCents(f.target), "target"),
      savedCents: formCents(f.saved) ?? 0,
      targetDate: f.targetDate,
      accountId: f.accountId,
      monthlyPlanCents: formCents(f.monthly) ?? null,
      purpose: purposeOf(f.purpose),
    });
    return `Goal "${g.name}" created.`;
  });
}

export async function updateGoalAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("goal.update", async (s) => {
    const g = await updateGoal(s, id, {
      name: f.name,
      ...(f.target != null && { targetCents: need(formCents(f.target), "target") }),
      targetDate: f.targetDate ?? null,
      monthlyPlanCents: formCents(f.monthly) ?? null,
      ...(f.purpose && { purpose: purposeOf(f.purpose) }),
    });
    return `Saved "${g.name}".`;
  });
}

export async function contributeGoalAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("goal.contribution", async (s, u) => {
    const amount = need(formCents(f.amount), "amount");
    const r = await contributeToGoal(s, {
      goalId: id,
      amountCents: f.withdraw ? -Math.abs(amount) : Math.abs(amount),
      date: todayIn(u.timezone),
      note: f.note,
    });
    return r.achieved ? "Recorded. You reached your goal!" : `Recorded. ${Math.round((r.savedCents / r.targetCents) * 100)}% of the way there.`;
  });
}

export async function deleteGoalAction(id: string): Promise<ActionState> {
  return mutate("goal.delete", async (s) => {
    const g = await deleteGoal(s, id);
    return `Deleted "${g.name}".`;
  });
}

export async function archiveGoalAction(id: string): Promise<ActionState> {
  return mutate("goal.archive", async (s) => {
    await updateGoal(s, id, { status: "archived" });
  });
}

export async function disconnectBankAction(integrationId: string): Promise<ActionState> {
  return mutate("integration.plaid.disconnected", async (s) => {
    try {
      const r = await removeItem(s, integrationId);
      return `${r.name} disconnected. ${r.accountsRemoved} synced account${r.accountsRemoved === 1 ? "" : "s"} removed.`;
    } catch (e) {
      if (e instanceof PlaidError) throw new ServiceError(e.message);
      throw e;
    }
  });
}
