import { ApprovalCard, DecisionLine, Empty, Section } from "@/components/hq/cards";
import { KIND_LABEL } from "@/components/hq/labels";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { employee } from "@/server/hq/team";
import { listApprovals } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { Failed } from "../../format";
import { AdminTitle, Notice } from "../../ui";

/** The inbox: pending approvals with Yes, No or Changes, and the last decisions below. */
export default async function Approvals({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const [p, d] = await Promise.all([
    safe("hq-pending", () => listApprovals(db, { status: ["pending"] })),
    safe("hq-decided", () => listApprovals(db, { status: ["approved", "declined", "changes"] })),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Approvals" sub="Things your team won't do without your yes." />
      <Notice done={sp.done} error={sp.error} />
      {!p.ok ? (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>
      ) : p.data.length ? (
        <div className="flex flex-col gap-3">
          {p.data.map((a) => (
            <ApprovalCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <Section title="Waiting for you">
          <Empty>Nothing waiting for you.</Empty>
        </Section>
      )}
      <Section title="Last decisions">
        {!d.ok ? (
          <Empty>{Failed()}</Empty>
        ) : d.data.length ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {d.data.slice(0, 15).map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-sm text-text">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted">
                    {" "}
                    · {KIND_LABEL[a.kind]} · {employee(a.role).title}
                  </span>
                </p>
                <DecisionLine a={a} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No decisions yet.</Empty>
        )}
      </Section>
    </div>
  );
}
