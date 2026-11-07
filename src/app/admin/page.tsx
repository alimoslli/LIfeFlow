import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/require-admin";
import { AppToday } from "./app-today";
import { OfficeSection } from "./hq/office";

export const metadata: Metadata = { title: "Office" };

/**
 * The Office (ADR 0027): the HQ office and workspace, then a compact card about the app. The `hq` class scopes the HQ
 * colours and animations (the HQ layout gives it to the pages under /admin/hq).
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <div className="hq flex flex-col gap-5">
      <OfficeSection view={sp.view === "workspace" ? "workspace" : "office"}>
        {/* Under the Chief of Staff's brief: the "Since you last looked" card goes here (claude/hq-cards). */}
      </OfficeSection>
      <AppToday />
    </div>
  );
}
