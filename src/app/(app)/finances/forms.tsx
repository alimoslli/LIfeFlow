"use client";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;
type Opt = { id: string; name: string };

export const KIND_LABELS: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer (own accounts)",
  refund: "Refund",
  reimbursement: "Reimbursement",
  investment: "Investment movement",
  adjustment: "Adjustment",
};

export function CategoryOptions({ categories }: { categories: (Opt & { parentId: string | null })[] }) {
  const parents = categories.filter((c) => !c.parentId);
  return (
    <>
      <option value="">Uncategorized</option>
      {parents.map((p) => (
        <optgroup key={p.id} label={p.name}>
          <option value={p.id}>{p.name}</option>
          {categories
            .filter((c) => c.parentId === p.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export function AddTransactionDialog({ action, accounts, categories, today }: { action: Action; accounts: Opt[]; categories: (Opt & { parentId: string | null })[]; today: string }) {
  return (
    <Dialog trigger="Add transaction" title="Add a transaction" triggerProps={{ variant: "secondary" }}>
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <Field label="Description" htmlFor="t-desc">
            <Input id="t-desc" name="description" required placeholder="Trader Joe's" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Amount ($)" htmlFor="t-amt">
              <Input id="t-amt" name="amount" inputMode="decimal" required placeholder="24.50" />
            </Field>
            <Field label="Direction" htmlFor="t-dir">
              <Select id="t-dir" name="direction" defaultValue="out">
                <option value="out">Money out</option>
                <option value="in">Money in</option>
              </Select>
            </Field>
            <Field label="Date" htmlFor="t-date">
              <Input id="t-date" name="date" type="date" required defaultValue={today} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account" htmlFor="t-acct">
              <Select id="t-acct" name="accountId" required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="t-cat">
              <Select id="t-cat" name="categoryId" defaultValue="">
                <CategoryOptions categories={categories} />
              </Select>
            </Field>
          </div>
          <Field label="Type" htmlFor="t-kind" hint="Leave on Automatic unless this is a transfer, refund or reimbursement.">
            <Select id="t-kind" name="kind" defaultValue="">
              <option value="">Automatic</option>
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton className="self-end">Add</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}

export function ImportCsvDialog({ action, accounts }: { action: Action; accounts: Opt[] }) {
  return (
    <Dialog trigger="Import CSV" title="Import transactions" description="Columns: date, description, amount (negative = money out). Optional: category, merchant. Re-importing the same file won't create duplicates." triggerProps={{ variant: "secondary" }}>
      {() => (
        <ActionForm action={action} showSuccess>
          <Field label="Into account" htmlFor="i-acct">
            <Select id="i-acct" name="accountId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CSV file" htmlFor="i-file">
            <Input id="i-file" name="file" type="file" accept=".csv,text/csv" required className="py-1.5" />
          </Field>
          <SubmitButton className="self-end" pendingText="Importing…">
            Import
          </SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}
