"use server";
import { applyRuleToPast, deleteCategoryRule } from "@/server/services/finance/categorize";
import { formBool, formCents, formObject, mutate, type ActionState } from "@/server/actions";
import { ServiceError } from "@/server/services/errors";
import { archiveAccount, createManualAccount, updateAccountBalance } from "@/server/services/finance/accounts";
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

export async function createGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("goal.create", async (s) => {
    await createGoal(s, {
      name: f.name ?? "",
      targetCents: need(formCents(f.target), "target"),
      savedCents: formCents(f.saved) ?? 0,
      targetDate: f.targetDate,
      accountId: f.accountId,
    });
  });
}

export async function updateGoalAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("goal.update", async (s) => {
    await updateGoal(s, id, { savedCents: need(formCents(f.saved), "amount") });
  });
}

export async function archiveGoalAction(id: string): Promise<ActionState> {
  return mutate("goal.archive", async (s) => {
    await updateGoal(s, id, { status: "archived" });
  });
}
