"use client";
import { useState } from "react";
import { Archive, EyeOff } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { ActionState } from "@/server/actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

type Act = () => Promise<ActionState>;
type FormAct = (p: ActionState, fd: FormData) => Promise<ActionState>;

/** One account as the Accounts page shows it, worded on the server. */
export type AccountView = {
  id: string;
  name: string;
  mask: string | null;
  institution: string | null;
  /** "Chase · updated Nov 9, 9:41 PM". */
  line: string;
  balance: string;
  owed: boolean;
  bank: boolean;
  manual: boolean;
  credit: boolean;
  loan: boolean;
  notInNetWorth: boolean;
  /** For the edit form, in dollars. */
  balanceDollars: string;
  limit: string;
  apr: string;
  minPayment: string;
  dueDate: string;
};

/**
 * A row you read at a glance (whose, which, how much); a tap opens its sheet: the details you can correct and how to stop
 * using it (owner, 2026-11-10: the old page showed every form at once and looked unfinished).
 */
export function AccountRow({ a, save, off }: { a: AccountView; save: FormAct; off: Act }) {
  const [open, setOpen] = useState(false);
  const initial = (a.institution || a.name).trim().charAt(0).toUpperCase();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="account"
        className="lf-hop flex w-full items-center gap-3 rounded-[1.25rem] bg-surface p-3 text-left shadow-soft ring-1 ring-border/60 hover:shadow-lift"
      >
        <span className="lf-chip-night h-11 w-11 shrink-0 rounded-[0.875rem] text-[1rem] font-semibold" aria-hidden>
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[0.9375rem] font-semibold">{a.name}</span>
            {a.mask && <span className="shrink-0 text-xs text-muted">••{a.mask}</span>}
          </span>
          <span className="block truncate text-[0.8125rem] text-muted">{a.line}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="tabular block text-[0.9375rem] font-semibold">{a.balance}</span>
          {a.owed && <span className="block text-[0.6875rem] text-muted">owed</span>}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={a.name}>
        <div className="flex flex-col gap-5">
          <div>
            <p className="tabular font-display text-[2.25rem] leading-none font-medium tracking-tight">
              {a.balance}
              {a.owed && <span className="ml-1.5 font-sans text-[0.9375rem] font-normal text-muted">owed</span>}
            </p>
            <p className="mt-2 text-sm text-text-2">
              {a.line}
              {a.notInNetWorth ? " · not counted in net worth" : ""}
            </p>
          </div>
          {(a.manual || a.credit || a.loan) && (
            <ActionForm action={save} reset={false} showSuccess className="gap-3">
              <div className="grid grid-cols-2 gap-3">
                {a.manual && (
                  <Field label={a.owed ? "Amount owed ($)" : "Balance ($)"} htmlFor={`bal-${a.id}`}>
                    <Input id={`bal-${a.id}`} name="balance" inputMode="decimal" defaultValue={a.balanceDollars} required />
                  </Field>
                )}
                {a.credit && (
                  <Field label="Credit limit ($)" htmlFor={`lim-${a.id}`}>
                    <Input id={`lim-${a.id}`} name="limit" inputMode="decimal" defaultValue={a.limit} />
                  </Field>
                )}
                {(a.credit || a.loan) && (
                  <>
                    <Field label="Interest rate (APR %)" htmlFor={`apr-${a.id}`}>
                      <Input id={`apr-${a.id}`} name="apr" inputMode="decimal" defaultValue={a.apr} placeholder="24.99" />
                    </Field>
                    <Field label="Minimum payment ($)" htmlFor={`min-${a.id}`}>
                      <Input id={`min-${a.id}`} name="minPayment" inputMode="decimal" defaultValue={a.minPayment} />
                    </Field>
                    <Field label="Next due date" htmlFor={`due-${a.id}`}>
                      <Input id={`due-${a.id}`} name="dueDate" type="date" defaultValue={a.dueDate} />
                    </Field>
                  </>
                )}
              </div>
              <SubmitButton className="self-end">Save</SubmitButton>
            </ActionForm>
          )}
          <div className="border-t border-border pt-3">
            {a.bank ? (
              // a bank account that's off stays off through every sync, and can be turned back on from the page
              <ActionButton
                action={off}
                confirm={`Stop using ${a.name} in LifeFlow? It's hidden and its bank transactions are removed. You can turn it back on any time.`}
                className="lf-sb-link text-sm text-text-2"
              >
                <EyeOff className="h-3.5 w-3.5" aria-hidden /> Don&apos;t use in LifeFlow
              </ActionButton>
            ) : (
              <ActionButton action={off} confirm={`Archive ${a.name}? Its transactions are kept.`} className="lf-sb-link text-sm text-text-2">
                <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
              </ActionButton>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}

/** "Add an account": the form, one tap deeper. */
export function AddAccount({ action }: { action: FormAct }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lf-sb lf-sb-app lf-sb-sm self-start">
        <PixelIcon name="plus" className="h-4 w-4" aria-hidden /> Add an account yourself
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add an account">
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          <Field label="Name" htmlFor="a-name">
            <Input id="a-name" name="name" required placeholder="Everyday Checking" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="a-type">
              <Select id="a-type" name="type" defaultValue="depository">
                <option value="depository">Checking / savings</option>
                <option value="credit">Credit card</option>
                <option value="investment">Investment / retirement</option>
                <option value="loan">Loan</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Balance ($)" htmlFor="a-bal" hint="What you owe, for a card or loan">
              <Input id="a-bal" name="balance" inputMode="decimal" required placeholder="1250.00" />
            </Field>
            <Field label="Bank" htmlFor="a-inst">
              <Input id="a-inst" name="institutionName" placeholder="Chase" />
            </Field>
            <Field label="Last 4 digits" htmlFor="a-mask">
              <Input id="a-mask" name="mask" inputMode="numeric" maxLength={4} />
            </Field>
          </div>
          <SubmitButton className="self-end">Add account</SubmitButton>
        </ActionForm>
      </Sheet>
    </>
  );
}
