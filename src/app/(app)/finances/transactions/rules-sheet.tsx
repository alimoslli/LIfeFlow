"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActionButton } from "@/components/action-form";
import { Sheet } from "@/components/ui/sheet";
import type { ActionState } from "@/server/actions";

type RuleAct = (id: string) => Promise<ActionState>;
export type RuleView = { id: string; label: string; categoryName: string; hits: number };

/**
 * Category rules open over Activity (owner's page map, 2026-11-10: the Rules page was a page only to show this list).
 * New transactions from these merchants get these categories; apply one to the past or remove it. Opened by "?rules=1"
 * (Activity's "More options" menu, and the old /finances/rules address), so it sits outside the menu.
 */
export function RulesSheet({ open, rules, apply, remove }: { open: boolean; rules: RuleView[]; apply: RuleAct; remove: RuleAct }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const q = new URLSearchParams(sp.toString());
    q.delete("rules");
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  return (
    <>
      <Sheet open={open} onClose={close} title="Category rules">
        <p className="mb-3 text-sm text-text-2">New transactions from these merchants get these categories.</p>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No rules yet. Change a transaction&apos;s category and one appears here.</p>
        ) : (
          <ul className="lf-tiles" aria-label="Your rules">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted">
                    → {r.categoryName}
                    {r.hits ? ` · used ${r.hits} time${r.hits === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <ActionButton
                  action={apply.bind(null, r.id)}
                  title={`Apply ${r.label} rule to past transactions`}
                  className="lf-sb lf-sb-app lf-sb-xs lf-touch"
                >
                  Apply to past
                </ActionButton>
                <ActionButton
                  action={remove.bind(null, r.id)}
                  confirm={`Remove the rule for ${r.label}? Past transactions keep their categories.`}
                  title={`Remove ${r.label} rule`}
                  className="flex min-h-11 items-center rounded-full px-3 text-sm text-muted hover:text-danger"
                >
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
