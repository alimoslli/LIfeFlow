import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { errorsLast24h, inboxCounts, safe } from "@/server/services/admin";
import { pendingApprovalCount } from "@/server/services/hq";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Owner-only (ADR 0022). Anyone else gets a 404. Pages and actions check again themselves. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const db = getDb();
  const [fb, er, ap] = await Promise.all([
    safe("inbox", () => inboxCounts(db)),
    safe("errors", () => errorsLast24h(db)),
    safe("hq-approvals", () => pendingApprovalCount(db)),
  ]);
  const counts = { feedback: fb.ok ? fb.data.open : 0, errors: er.ok ? er.data.kinds : 0, approvals: ap.ok ? ap.data : 0 };
  return (
    <div className="hq-look min-h-dvh bg-bg">
      <div className="w-full pt-[env(safe-area-inset-top)] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="px-4 sm:px-6 lg:contents">
          <AdminNav email={admin.email} counts={counts} />
          <main className="mx-auto w-full max-w-[70rem] min-w-0 pb-16 lg:px-10 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
