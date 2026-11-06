import Link from "next/link";
import { Activity, AlertTriangle, HeartPulse, LayoutDashboard, Megaphone, MessageSquareText, TrendingUp, Users } from "lucide-react";
import { ApprovalCard, Empty, Section } from "@/components/hq/cards";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { errorsLast24h, inboxCounts, safe } from "@/server/services/admin";
import { listApprovals } from "@/server/services/hq";
import { Failed } from "../../format";
import { AdminTitle, Notice } from "../../ui";

/** The Founder Office: what needs your yes, then the admin sections that were here first. */
export default async function FounderOffice({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const [ap, fb, er] = await Promise.all([
    safe("hq-pending", () => listApprovals(db, { status: ["pending"] })),
    safe("inbox", () => inboxCounts(db)),
    safe("errors", () => errorsLast24h(db)),
  ]);
  const sections = [
    { href: "/admin", label: "Overview", sub: "Who's here and what needs you", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", sub: "Accounts and plans", icon: Users },
    { href: "/admin/feedback", label: "Feedback", sub: fb.ok ? `${fb.data.open} to read` : undefined, icon: MessageSquareText },
    { href: "/admin/announcements", label: "Announcements", sub: "The banner everyone sees", icon: Megaphone },
    { href: "/admin/growth", label: "Growth", sub: "Sign-ups and activity", icon: TrendingUp },
    {
      href: "/admin/errors",
      label: "Errors",
      sub: er.ok ? `${er.data.kinds} kind${er.data.kinds === 1 ? "" : "s"} in 24 hours` : undefined,
      icon: AlertTriangle,
    },
    { href: "/admin/health", label: "Health", sub: "Connections and settings", icon: HeartPulse },
    { href: "/admin/activity", label: "Activity log", sub: "Every admin change", icon: Activity },
  ];
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Founder Office" sub="Where the decisions happen." />
      <Notice done={sp.done} error={sp.error} />
      <Section title="Needs your yes">
        {!ap.ok ? (
          <Empty>{Failed()}</Empty>
        ) : ap.data.length ? (
          <div className="flex flex-col gap-3">
            {ap.data.map((a) => (
              <ApprovalCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <Empty>Nothing waiting for you.</Empty>
        )}
      </Section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex min-h-24 flex-col justify-between rounded-3xl bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift"
          >
            <s.icon className="h-5 w-5 text-accent" aria-hidden />
            <span>
              <span className="block text-[1.0625rem] font-semibold text-text">{s.label}</span>
              {s.sub && <span className="block text-xs text-text-2">{s.sub}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
