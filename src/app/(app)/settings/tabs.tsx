"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/surface";

const ITEMS = [
  { key: "/settings", label: "Profile" },
  { key: "/settings/memory", label: "Assistant" },
  { key: "/settings/integrations", label: "Integrations" },
  { key: "/settings/data", label: "Privacy & data" },
  { key: "/settings/security", label: "Security" },
  { key: "/settings/trash", label: "Trash" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const current = [...ITEMS].reverse().find((i) => pathname.startsWith(i.key))?.key ?? "/settings";
  return <Tabs current={current} items={ITEMS.map((i) => ({ ...i, href: i.key }))} />;
}
