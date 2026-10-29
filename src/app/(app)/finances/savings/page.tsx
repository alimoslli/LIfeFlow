import { BILLS_SUBS, SegmentedNav } from "@/components/ui/segmented-nav";
import type { Metadata } from "next";
import { ExternalLink, Search } from "lucide-react";
import { moneyGate } from "@/app/(app)/money-gate";
import { ActionButton } from "@/components/action-form";
import { Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { webSearchClient } from "@/server/integrations/web-search";
import { billsToReview, listSavings, negotiationScript } from "@/server/services/finance/savings-finder";
import { findSavingsAction, savingsStatusAction } from "./actions";
import { ScriptSheet } from "./script-sheet";

export const metadata: Metadata = { title: "Save money" };

const LABEL = {
  phone: "Phone",
  internet: "Internet",
  insurance: "Insurance",
  streaming: "Streaming",
  credit_card: "Credit card rate",
  loan: "Loan rate",
  other: "Bill",
} as const;

export default async function SavingsPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => ({ ...(await billsToReview(s)), ...(await listSavings(s)), tz: u.timezone }));
  const searchOn = !!webSearchClient();
  const targets = [
    ...d.bills.map((b) => ({ key: b.id, name: b.name, category: b.category, line: `${formatCents(b.monthlyCents)} a month`, target: { recurringId: b.id } })),
    ...d.rates.map((r) => ({
      key: r.id,
      name: r.name,
      category: r.category,
      line: `${r.aprPercent}% APR on ${formatCents(r.balanceCents)}, about ${formatCents(r.monthlyCents)} a month in interest`,
      target: { accountId: r.id },
    })),
  ];
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <header>
        <SegmentedNav label="Bills and subscriptions" items={BILLS_SUBS} active="save" />
        <h1 className="mt-4 font-display text-[34px] leading-tight font-medium tracking-tight">Save money</h1>
        <p className="mt-1 text-sm text-text-2">Cheaper plans for your bills, with sources.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card as="div" className="p-4">
            <p className="text-sm text-muted">Savings found</p>
            <p className="tabular font-display text-[26px] font-medium">
              {formatCents(d.foundYearlyCents)}
              <span className="text-sm text-muted">/yr</span>
            </p>
          </Card>
          <Card as="div" className="p-4">
            <p className="text-sm text-muted">You acted on</p>
            <p className="tabular font-display text-[26px] font-medium text-success">
              {formatCents(d.actedYearlyCents)}
              <span className="text-sm text-muted">/yr</span>
            </p>
          </Card>
        </div>
      </header>
      {!searchOn && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">Live price checks aren&apos;t available yet.</p>}
      {targets.length === 0 && (
        <Card className="p-5 text-[15px] text-text-2">
          Add your phone, internet, insurance or streaming bills on Bills or Subscriptions, or a card&apos;s APR on Accounts, and Jarvis can look for cheaper
          options.
        </Card>
      )}
      {targets.map((t) => {
        const options = d.rows.filter((r) => (r.recurringId ?? r.accountId) === t.key && r.status !== "dismissed");
        return (
          <Card as="section" key={t.key} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{LABEL[t.category]}</p>
                <h2 className="text-[16px] font-semibold break-words">{t.name}</h2>
                <p className="text-sm text-text-2">{t.line}</p>
              </div>
              {searchOn && (
                <ActionButton
                  action={findSavingsAction.bind(null, t.target)}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
                >
                  <Search className="h-4 w-4" /> {options.length ? "Check again" : "Find cheaper"}
                </ActionButton>
              )}
            </div>
            {options.length > 0 && (
              <ul className="mt-3 flex flex-col gap-3">
                {options.map((o) => (
                  <li key={o.id} className="rounded-2xl bg-surface-2 p-3" data-testid="savings-option">
                    <p className="text-[15px]">
                      <b>{o.provider}</b> {o.plan}: {formatCents(o.offerMonthlyCents)}/mo.{" "}
                      <span className="font-semibold text-success">Saves about {formatCents(o.yearlySavingsCents)}/year.</span>
                    </p>
                    {o.details && <p className="mt-0.5 text-xs text-muted">{o.details}</p>}
                    <a
                      href={o.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent"
                    >
                      <ExternalLink className="h-4 w-4" /> Source: {o.sourceTitle}
                    </a>
                    <p className="text-xs text-muted">Checked {formatIn(o.searchedAt, d.tz, "MMM d, h:mm a")}. Prices change; confirm before switching.</p>
                    {o.status === "acted" ? (
                      <p className="mt-2 text-sm font-medium text-success">You acted on this.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ScriptSheet provider={o.provider} script={negotiationScript(o)} />
                        <ActionButton
                          action={savingsStatusAction.bind(null, o.id, "acted")}
                          className="rounded-full bg-surface px-4 text-sm font-medium shadow-soft"
                        >
                          I switched or negotiated
                        </ActionButton>
                        <ActionButton action={savingsStatusAction.bind(null, o.id, "dismissed")} className="rounded-full px-3 text-sm text-text-2">
                          Not for me
                        </ActionButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
