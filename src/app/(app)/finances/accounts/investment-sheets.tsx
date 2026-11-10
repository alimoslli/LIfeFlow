"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { ActionState } from "@/server/actions";
import { GrowthCalculator } from "./growth-calculator";

type FormAct = (p: ActionState, fd: FormData) => Promise<ActionState>;

export const HOLDING_TYPES: Record<string, string> = {
  equity: "Stocks",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  crypto: "Crypto",
  bond: "Bonds",
  cash: "Cash",
  other: "Other",
};

/**
 * What used to fill the Investments page, one tap deeper (owner's page map, 2026-11-10: simplified, not removed):
 * adding a holding, "what if I invest every month?", and the basics. Each opens over Accounts.
 */
export function InvestmentSheets({
  accounts,
  startCents,
  add,
  lessons,
  note,
}: {
  accounts: { id: string; name: string }[];
  startCents: number;
  add: FormAct;
  lessons: { id: string; title: string; body: string; open: boolean }[];
  note: string;
}) {
  const [open, setOpen] = useState<null | "add" | "whatif" | "basics">(null);
  const close = () => setOpen(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {accounts.length > 0 && (
          <button type="button" onClick={() => setOpen("add")} className="lf-sb lf-sb-app lf-sb-sm">
            <PixelIcon name="plus" className="h-4 w-4" aria-hidden /> Holding
          </button>
        )}
        <button type="button" onClick={() => setOpen("whatif")} className="lf-sb lf-sb-app lf-sb-sm">
          What if I invest monthly?
        </button>
        <button type="button" onClick={() => setOpen("basics")} className="lf-sb lf-sb-app lf-sb-sm">
          Investing basics
        </button>
      </div>

      <Sheet open={open === "add"} onClose={close} title="Add a holding">
        <ActionForm action={add} onSuccess={close}>
          <Field label="Account" htmlFor="h-acct">
            <Select id="h-acct" name="accountId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Name" htmlFor="h-name">
              <Input id="h-name" name="name" required placeholder="Total Stock Market ETF" />
            </Field>
            <Field label="Symbol" htmlFor="h-sym">
              <Input id="h-sym" name="symbol" placeholder="VTI" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="h-type">
              <Select id="h-type" name="securityType" defaultValue="etf">
                {Object.entries(HOLDING_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" htmlFor="h-q">
              <Input id="h-q" name="quantity" inputMode="decimal" required />
            </Field>
            <Field label="Worth now ($)" htmlFor="h-v">
              <Input id="h-v" name="value" inputMode="decimal" required />
            </Field>
            <Field label="You paid ($)" htmlFor="h-c">
              <Input id="h-c" name="costBasis" inputMode="decimal" />
            </Field>
            <Field label="Fund fee (%)" htmlFor="h-er" hint="Optional, like 0.03">
              <Input id="h-er" name="expenseRatio" inputMode="decimal" />
            </Field>
          </div>
          <SubmitButton className="self-end">Add holding</SubmitButton>
        </ActionForm>
      </Sheet>

      <Sheet open={open === "whatif"} onClose={close} title="What if I invest monthly?">
        <GrowthCalculator startCents={startCents} />
      </Sheet>

      <Sheet open={open === "basics"} onClose={close} title="Investing basics">
        <ul className="flex flex-col gap-2">
          {lessons.map((l) => (
            <li key={l.id}>
              <details className="rounded-2xl bg-surface-2/70 p-4 text-sm" open={l.open}>
                <summary className="cursor-pointer font-medium">{l.title}</summary>
                <p className="mt-2 text-text-2">{l.body}</p>
              </details>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{note}</p>
      </Sheet>
    </>
  );
}
