"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

const PARENTS: [RegExp, string, string][] = [
  [/^\/(school|work|tasks|calendar|notes)$/, "/plan", "Plan"],
  [/^\/(finances(\/[a-z]+)?|wealth)$/, "/money", "Money"],
];

/** "‹ Plan" / "‹ Money" above detail pages, so nothing feels like a dead end. */
export function BackLink() {
  const pathname = usePathname();
  const hit = PARENTS.find(([re]) => re.test(pathname));
  if (!hit) return null;
  return (
    <Link href={hit[1]} className="-ml-1 mb-4 inline-flex items-center gap-0.5 text-sm text-muted hover:text-text">
      <ChevronLeft className="h-4 w-4" /> {hit[2]}
    </Link>
  );
}
