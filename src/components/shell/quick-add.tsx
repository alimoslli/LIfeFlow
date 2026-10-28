"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createTransactionAction } from "@/app/(app)/finances/actions";
import { createTaskAction } from "@/app/(app)/tasks/actions";
import { createShiftAction } from "@/app/(app)/work/actions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { CountedInput } from "@/components/ui/counted-input";
import { Field, Input, Select } from "@/components/ui/field";
import { DateField, PriorityField, TimeField } from "@/components/ui/pickers";
import { Sheet } from "@/components/ui/sheet";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Kind = "todo" | "shift" | "spending";
type Ctx = { today: string; employers: { id: string; name: string }[]; accounts: { id: string; name: string; type: string }[] };

const SHOW_ON = /^\/($|plan|tasks$|work|calendar|school$|notes$|money$|finances\/transactions)/;
const defaultKind = (p: string): Kind => (p.startsWith("/work") ? "shift" : p.startsWith("/money") || p.startsWith("/finances") ? "spending" : "todo");

/**
 * The floating "+" on phones: add a to-do, a shift or spending from one
 * thumb-reachable place. Also opened by ?add=todo|shift|spending (home-screen shortcuts).
 */
export function QuickAdd() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("todo");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [formKey, setFormKey] = useState(0);

  const openWith = useCallback(
    async (k: Kind) => {
      haptic("light");
      setKind(k);
      setOpen(true);
      if (!ctx) {
        const r = await fetch("/api/quick-add").catch(() => null);
        if (r?.ok) setCtx((await r.json()) as Ctx);
      }
    },
    [ctx],
  );

  useEffect(() => {
    const k = params.get("add");
    if (k !== "todo" && k !== "shift" && k !== "spending") return;
    const t = setTimeout(() => void openWith(k), 0);
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    router.replace(url.pathname + url.search, { scroll: false });
    return () => clearTimeout(t);
  }, [params, openWith, router]);

  // Any "Add" button in the app can open this sheet (see QuickAddButton).
  useEffect(() => {
    const on = (e: Event) => void openWith(((e as CustomEvent).detail as Kind) ?? "todo");
    window.addEventListener("lf:quick-add", on);
    return () => window.removeEventListener("lf:quick-add", on);
  }, [openWith]);

  const done = () => {
    setOpen(false);
    setFormKey((k) => k + 1);
    haptic("success");
  };

  return (
    <>
      {SHOW_ON.test(pathname) && (
        <button
          type="button"
          onClick={() => void openWith(defaultKind(pathname))}
          aria-label="Quick add"
          className="lf-fab fixed right-4 bottom-[calc(var(--tabbar-space)-4px)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lift active:scale-95 md:hidden"
        >
          <Plus className="h-6 w-6" strokeWidth={2.4} />
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Quick add">
        <div role="tablist" aria-label="What to add" className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
          {(
            [
              ["todo", "To-do"],
              ["shift", "Shift"],
              ["spending", "Spending"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("min-h-11 rounded-xl text-sm", kind === k ? "bg-surface font-medium shadow-soft" : "text-text-2")}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "todo" && (
          <ActionForm key={`t${formKey}`} action={createTaskAction} onSuccess={done} className="gap-4">
            <Field label="What do you need to do?" htmlFor="qa-title">
              <CountedInput
                id="qa-title"
                name="title"
                required
                max={300}
                autoFocus
                placeholder="Email professor about the lab"
                className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[16px] focus:border-accent focus:outline-none"
              />
            </Field>
            {ctx ? <DateField name="dueDate" label="Due" today={ctx.today} /> : null}
            <TimeField name="dueTime" label="Time" />
            <PriorityField name="priority" />
            <SubmitButton className="h-12 w-full text-[15px]">Add to-do</SubmitButton>
          </ActionForm>
        )}

        {kind === "shift" &&
          (ctx && ctx.employers.length === 0 ? (
            <p className="py-4 text-sm text-text-2">Add your job on the Work page first, then shifts can be added here.</p>
          ) : (
            <ActionForm key={`s${formKey}`} action={createShiftAction} onSuccess={done} className="gap-4">
              <Field label="Job" htmlFor="qa-emp">
                <Select id="qa-emp" name="employerId" required className="h-12 text-[16px]">
                  {(ctx?.employers ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {ctx ? <DateField name="date" label="Date" today={ctx.today} required allowNone={false} /> : null}
              <TimeField name="startTime" label="Starts" required allowNone={false} />
              <TimeField name="endTime" label="Ends" required allowNone={false} />
              <Field label="Unpaid break (minutes)" htmlFor="qa-break">
                <Input id="qa-break" name="breakMinutes" type="number" inputMode="numeric" min={0} max={600} placeholder="0" className="h-12 text-[16px]" />
              </Field>
              <SubmitButton className="h-12 w-full text-[15px]">Add shift</SubmitButton>
            </ActionForm>
          ))}

        {kind === "spending" &&
          (ctx && ctx.accounts.length === 0 ? (
            <p className="py-4 text-sm text-text-2">Connect a bank or add an account on Money, Accounts first.</p>
          ) : (
            <ActionForm key={`m${formKey}`} action={createTransactionAction} onSuccess={done} className="gap-4">
              <input type="hidden" name="direction" value="out" />
              <Field label="Amount ($)" htmlFor="qa-amt">
                <Input id="qa-amt" name="amount" inputMode="decimal" required autoFocus placeholder="12.50" className="h-14 text-[22px]" />
              </Field>
              <Field label="What was it?" htmlFor="qa-desc">
                <Input id="qa-desc" name="description" required maxLength={300} placeholder="Lunch at Chipotle" className="h-12 text-[16px]" />
              </Field>
              <Field label="Paid from" htmlFor="qa-acct">
                <Select id="qa-acct" name="accountId" required className="h-12 text-[16px]">
                  {(ctx?.accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {ctx ? <DateField name="date" label="Date" today={ctx.today} defaultValue={ctx.today} allowNone={false} required /> : null}
              <p className="-mt-2 text-xs text-muted">The category is filled in from your rules and the merchant name; you can change it later.</p>
              <SubmitButton className="h-12 w-full text-[15px]">Log spending</SubmitButton>
            </ActionForm>
          ))}
      </Sheet>
    </>
  );
}

/** Opens the quick-add sheet (a form first; the assistant stays one tap away). */
export function QuickAddButton({ kind = "todo", className, children }: { kind?: Kind; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("lf:quick-add", { detail: kind }))} className={className}>
      {children}
    </button>
  );
}
