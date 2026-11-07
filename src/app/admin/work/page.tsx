import type { Metadata } from "next";
import { LiveRefresh } from "@/components/hq/live-refresh";
import { requireAdmin } from "@/server/auth/require-admin";
import { ApprovalsSection } from "../hq/approvals/section";
import { MissionsSection } from "../hq/missions/section";
import { ReportSection } from "../hq/reports/section";
import { AdminTitle, Notice } from "../ui";

export const metadata: Metadata = { title: "Work" };

/** Work (ADR 0027): what needs your yes, the missions board and this week's report. Each part loads on its own. */
export default async function Work({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <div className="hq flex flex-col gap-8">
      <AdminTitle title="Your desk" sub="What needs your yes, and what your team is doing." />
      <Notice done={sp.done} error={sp.error} />
      <LiveRefresh />
      <ApprovalsSection />
      <MissionsSection />
      <ReportSection />
    </div>
  );
}
