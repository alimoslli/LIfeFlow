import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-form";
import { BankConnections } from "@/components/finance/bank-connections";
import { MySkyling } from "@/components/skylings/sprite";
import { COINS, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { formatIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { listAccounts, listTurnedOffAccounts, spendableCents, summarizeBalances } from "@/server/services/finance/accounts";
import { listPlaidConnections, plaidConfig } from "@/server/integrations/plaid";
import { archiveAccountAction, createAccountAction, disconnectBankAction, setBankAccountUsedAction, updateAccountDetailsAction } from "../actions";
import { AccountRow, AddAccount, type AccountView } from "./account-row";
import { PixelIcon } from "@/components/pixel/pixel-icon";

export const metadata: Metadata = { title: "Accounts" };

const GROUPS: [string, string[]][] = [
  ["Cash", ["depository", "cash"]],
  ["Cards", ["credit"]],
  ["Loans", ["loan"]],
  ["Investments", ["investment"]],
  ["Other", ["other"]],
];
const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

/**
 * Accounts (owner, 2026-11-10: "looks very under made"): what you're worth in the sky up top, then each account as one
 * readable row by kind (a tap opens what you can correct), your bank connections, and adding one yourself a tap away.
 */
export default async function AccountsPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => ({
    accounts: await listAccounts(s),
    off: await listTurnedOffAccounts(s),
    banks: await listPlaidConnections(s),
    tz: u.timezone,
  }));
  const totals = summarizeBalances(d.accounts);
  const owedTotal = totals.creditOwedCents + totals.loansOwedCents;
  const view = (a: (typeof d.accounts)[number]): AccountView => ({
    id: a.id,
    name: a.name,
    mask: a.mask,
    institution: a.institutionName,
    // available now, the same figure as the total above; what's still pending is named so the bank's own posted number makes sense
    line: [
      a.institutionName,
      spendableCents(a) < a.currentBalanceCents ? `${formatCents(a.currentBalanceCents - spendableCents(a))} pending` : null,
      `updated ${formatIn(a.balanceUpdatedAt, d.tz, "MMM d, h:mm a")}`,
    ]
      .filter(Boolean)
      .join(" · "),
    balance: formatCents(spendableCents(a)),
    owed: a.type === "credit" || a.type === "loan",
    bank: a.source === "plaid",
    manual: a.source === "manual" || a.source === "demo",
    credit: a.type === "credit",
    loan: a.type === "loan",
    notInNetWorth: !a.includeInNetWorth,
    balanceDollars: (a.currentBalanceCents / 100).toFixed(2),
    limit: a.creditLimitCents != null ? (a.creditLimitCents / 100).toFixed(0) : "",
    apr: a.aprBps != null ? String(a.aprBps / 100) : "",
    minPayment: a.minPaymentCents != null ? (a.minPaymentCents / 100).toFixed(2) : "",
    dueDate: a.nextPaymentDueDate ?? "",
  });

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-7">
      <header>
        <h1 className="font-display text-[2.375rem] leading-none font-medium tracking-tight">Accounts</h1>
        <p className="mt-2 text-sm text-text-2">Your banks, cards and cash, kept up to date by themselves.</p>
      </header>

      <SkyWindow tz={d.tz} className="rounded-[1.75rem]">
        <div className="relative min-h-[11rem] px-6 pt-6 pb-6">
          <p className="text-sm text-white/80">Net worth</p>
          <p className="lf-sw-num tabular mt-1 font-display text-[3rem] leading-none font-medium tracking-tight" data-testid="net-worth">
            {whole(totals.netWorthCents)}
          </p>
          <p className="mt-2 max-w-[62%] text-sm text-white/80">
            {whole(totals.cashCents)} available now{owedTotal > 0 ? ` · ${whole(owedTotal)} owed` : ""}
            {totals.investmentsCents > 0 ? ` · ${whole(totals.investmentsCents)} invested` : ""}
          </p>
          <div className="absolute right-5 bottom-0 flex flex-col items-center">
            <MySkyling className="relative z-10 -mb-1.5 h-16 w-16 cursor-pointer" />
            <PixelArt art={COINS} className="w-12" />
          </div>
        </div>
      </SkyWindow>

      {d.accounts.length === 0 && (
        <div className="flex items-center gap-3 rounded-[1.5rem] bg-surface p-4 shadow-soft">
          <span className="lf-chip-night h-10 w-10 shrink-0 rounded-[0.75rem]" aria-hidden>
            <PixelIcon name="card" className="h-4 w-4" />
          </span>
          <p className="text-[0.9375rem] text-text-2">No accounts yet. Connect your bank below and they fill in by themselves.</p>
        </div>
      )}

      {GROUPS.map(([label, types]) => {
        const items = d.accounts.filter((a) => types.includes(a.type));
        if (!items.length) return null;
        const sum = items.reduce((s, a) => s + spendableCents(a), 0);
        return (
          <section key={label} aria-label={label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">{label}</h2>
              <p className="tabular text-sm text-text-2">
                {whole(sum)}
                {types.includes("credit") || types.includes("loan") ? " owed" : ""}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((a) => (
                <li key={a.id}>
                  <AccountRow
                    a={view(a)}
                    save={updateAccountDetailsAction.bind(null, a.id)}
                    off={a.source === "plaid" ? setBankAccountUsedAction.bind(null, a.id, false) : archiveAccountAction.bind(null, a.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {d.off.length > 0 && (
        <section aria-label="Not used in LifeFlow" className="flex flex-col gap-2">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Not used in LifeFlow</h2>
          <ul className="lf-tiles">
            {d.off.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] text-text-2">
                  {a.name}
                  {a.mask && <span className="ml-1.5 text-xs text-muted">••{a.mask}</span>}
                </p>
                <ActionButton action={setBankAccountUsedAction.bind(null, a.id, true)} title={`Use ${a.name} again`} className="lf-sb lf-sb-app lf-sb-sm">
                  Use again
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Your banks" className="flex flex-col gap-2">
        <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Your banks</h2>
        <div className="rounded-[1.5rem] bg-surface p-5 shadow-soft">
          <p className="mb-4 text-sm text-text-2">Balances, transactions, investments and cards sync every day, and whenever your bank has something new.</p>
          <BankConnections
            configured={!!plaidConfig()}
            disconnect={disconnectBankAction}
            connections={d.banks.map((b) => ({
              id: b.id,
              name: b.displayName ?? "Bank",
              status: b.status,
              lastSynced: b.lastSyncedAt ? formatIn(b.lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
              error: b.lastError,
            }))}
          />
        </div>
        <AddAccount action={createAccountAction} />
      </section>
    </div>
  );
}
