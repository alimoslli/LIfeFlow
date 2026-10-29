"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { parseMoneyToCents } from "@/lib/money";
import { enqueue } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

type Kind = "todo" | "shift" | "spending";
type Ctx = { today: string; employers: { id: string; name: string }[]; accounts: { id: string; name: string; type: string }[] };

const CTX_KEY = "lf-quick-add";
const SAVED = "Saved on this phone. It will sync when you're back online.";
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Offline versions of the three forms: saved on the device, synced by PwaClient when back online.
const offlineTodo = async (fd: FormData) => {
  const title = str(fd, "title");
  if (!title) throw new Error("Add what you need to do.");
  const priority = str(fd, "priority");
  await enqueue({
    kind: "task.create",
    id: crypto.randomUUID(),
    data: {
      title: title.slice(0, 300),
      dueDate: str(fd, "dueDate"),
      dueTime: str(fd, "dueTime"),
      priority: priority === "low" || priority === "high" || priority === "urgent" ? priority : "medium",
    },
  });
  return SAVED;
};
const offlineShift = async (fd: FormData) => {
  const [employerId, date, startTime, endTime] = ["employerId", "date", "startTime", "endTime"].map((k) => str(fd, k));
  if (!employerId || !date || !startTime || !endTime) throw new Error("Pick the job, date, start and end time.");
  const breakMinutes = Number(str(fd, "breakMinutes") ?? 0);
  await enqueue({
    kind: "shift.create",
    id: crypto.randomUUID(),
    data: { employerId, date, startTime, endTime, breakMinutes: Number.isFinite(breakMinutes) ? breakMinutes : 0 },
  });
  return SAVED;
};
const offlineSpending = async (fd: FormData) => {
  const cents = parseMoneyToCents(str(fd, "amount") ?? "");
  const description = str(fd, "description");
  const accountId = str(fd, "accountId");
  if (!cents || cents <= 0) throw new Error("Enter an amount like 12.50.");
  if (!description || !accountId) throw new Error("Add what it was and which account paid.");
  await enqueue({
    kind: "transaction.create",
    id: crypto.randomUUID(),
    data: { accountId, amountCents: cents, description: description.slice(0, 300), date: str(fd, "date") ?? localToday() },
  });
  return SAVED;
};

/**
 * Quick capture: add a to-do, a shift or spending in one sheet. Opened from
 * Jarvis ("Capture"), any QuickAddButton, or ?add=todo|shift|spending (home-screen shortcuts).
 */
export function QuickAdd() {
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
        if (r?.ok) {
          const fresh = (await r.json()) as Ctx;
          setCtx(fresh);
          try {
            localStorage.setItem(CTX_KEY, JSON.stringify(fresh));
          } catch {}
        } else {
          // Offline: use the jobs and accounts from last time (cleared when signing out).
          try {
            const saved = JSON.parse(localStorage.getItem(CTX_KEY) ?? "null") as Ctx | null;
            if (saved) setCtx({ ...saved, today: localToday() });
          } catch {}
        }
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
          <ActionForm key={`t${formKey}`} action={createTaskAction} offline={offlineTodo} onSuccess={done} className="gap-4">
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
            <ActionForm key={`s${formKey}`} action={createShiftAction} offline={offlineShift} onSuccess={done} className="gap-4">
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
            <ActionForm key={`m${formKey}`} action={createTransactionAction} offline={offlineSpending} onSuccess={done} className="gap-4">
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
