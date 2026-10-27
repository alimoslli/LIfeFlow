"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/surface";

const ITEMS = [
  { key: "/finances/transactions", label: "Transactions" },
  { key: "/finances/budgets", label: "Budgets" },
  { key: "/finances/bills", label: "Bills" },
  { key: "/finances/goals", label: "Goals" },
  { key: "/finances/accounts", label: "Accounts" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  const current = [...ITEMS].reverse().find((i) => pathname.startsWith(i.key))?.key ?? "/finances/transactions";
  return (
    <div className="mb-2">
      <Tabs current={current} items={ITEMS.map((i) => ({ ...i, href: i.key }))} />
    </div>
  );
}
