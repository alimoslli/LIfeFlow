import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/require-admin";
import { AppToday } from "./app-today";
import { OfficeSection } from "./hq/office";
import { SinceLookedCard } from "@/components/hq/since-looked";
import { Notice } from "./ui";

export const metadata: Metadata = { title: "Office" };

/**
 * The Office (ADR 0027): the HQ office and workspace, then a compact card about the app. The `hq` class scopes the HQ
 * colours and animations (the HQ layout gives it to the pages under /admin/hq).
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ view?: string; done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <div className="hq flex flex-col gap-5">
      <Notice done={sp.done} error={sp.error} />
      <OfficeSection view={sp.view === "workspace" ? "workspace" : "office"}>
        {/* Directly under the COO's brief. */}
        <SinceLookedCard />
      </OfficeSection>
      <AppToday />
    </div>
  );
}
