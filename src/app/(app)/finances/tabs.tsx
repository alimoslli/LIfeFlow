"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/surface";

const ITEMS = [
  { key: "/finances", label: "Overview" },
  { key: "/finances/transactions", label: "Transactions" },
  { key: "/finances/budgets", label: "Budgets" },
  { key: "/finances/bills", label: "Bills & subscriptions" },
  { key: "/finances/goals", label: "Goals" },
  { key: "/finances/accounts", label: "Accounts" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  const current = [...ITEMS].reverse().find((i) => pathname.startsWith(i.key))?.key ?? "/finances";
  return (
    <div className="mb-2">
      <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Finances</p>
      <Tabs current={current} items={ITEMS.map((i) => ({ ...i, href: i.key }))} />
    </div>
  );
}
