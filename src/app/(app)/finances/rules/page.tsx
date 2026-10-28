import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wand2 } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Card, EmptyState } from "@/components/ui/surface";
import { withCurrentUser } from "@/server/auth/current-user";
import { listCategoryRules } from "@/server/services/finance/categorize";
import { applyRuleAction, deleteRuleAction } from "../actions";

export const metadata: Metadata = { title: "Category rules" };

export default async function RulesPage() {
  const rules = await withCurrentUser((s) => listCategoryRules(s));
  return (
    <div className="mx-auto max-w-[680px]">
      <Link href="/finances/transactions" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-3.5 w-3.5" /> Transactions
      </Link>
      <h1 className="mt-2 font-display text-[28px] font-medium tracking-tight">Category rules</h1>
      <p className="mt-1 mb-5 text-sm text-text-2">
        When you change a transaction&apos;s category, LifeFlow remembers it for that merchant. New transactions follow your rules first, then well-known
        merchants. Anything else stays uncategorized rather than guessed.
      </p>
      <Card>
        {rules.length === 0 ? (
          <EmptyState icon={<Wand2 />} title="No rules yet">
            Change a transaction&apos;s category and a rule appears here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted">
                    → {r.categoryName}
                    {r.hits ? ` · used ${r.hits} time${r.hits === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <ActionButton
                  action={applyRuleAction.bind(null, r.id)}
                  title={`Apply ${r.label} rule to past transactions`}
                  className="rounded-full bg-surface-2 px-3 py-1.5 text-sm"
                >
                  Apply to past
                </ActionButton>
                <ActionButton
                  action={deleteRuleAction.bind(null, r.id)}
                  confirm={`Remove the rule for ${r.label}? Past transactions keep their categories.`}
                  title={`Remove ${r.label} rule`}
                  className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-danger"
                >
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
