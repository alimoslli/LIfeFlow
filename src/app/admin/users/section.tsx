import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui/surface";
import { Download } from "lucide-react";
import { PageSection } from "../ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { getDb } from "@/server/db/client";
import { listUsers, safe } from "@/server/services/admin";
import { Failed, ago } from "../format";

export type PeopleParams = { q?: string; plan?: string; status?: string; page?: string; fstatus?: string; fkind?: string };

/** The users list with its search. A part of the People page; the feedback filter params (fstatus, fkind) ride along so both parts keep their state. */
export async function UsersSection({ sp }: { sp: PeopleParams }) {
  const plan = sp.plan === "free" || sp.plan === "pro" ? sp.plan : undefined;
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const r = await safe("users", () => listUsers(getDb(), { q: sp.q, plan, status, page: Number(sp.page) || 1 }));
  const link = (page: number) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (plan) p.set("plan", plan);
    if (status) p.set("status", status);
    if (page > 1) p.set("page", String(page));
    if (sp.fstatus) p.set("fstatus", sp.fstatus);
    if (sp.fkind) p.set("fkind", sp.fkind);
    return `/admin/people${p.size ? `?${p}` : ""}#people`;
  };
  return (
    <PageSection
      id="people"
      title="Accounts"
      action={
        // A file download, so a plain link (client navigation can't download).
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/admin/users/export" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium shadow-soft">
          <Download className="h-4 w-4" /> Export CSV
        </a>
      }
    >
      <form method="get" action="/admin/people#people" className="flex flex-col gap-2 sm:flex-row">
        {sp.fstatus && <input type="hidden" name="fstatus" value={sp.fstatus} />}
        {sp.fkind && <input type="hidden" name="fkind" value={sp.fkind} />}
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or email" aria-label="Search users" className="min-w-0 sm:flex-1" />
        <Select name="plan" defaultValue={plan ?? ""} aria-label="Plan" className="sm:w-40 sm:flex-none">
          <option value="">Any plan</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="sm:w-40 sm:flex-none">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit">Search</Button>
      </form>
      {!r.ok ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : r.data.rows.length === 0 ? (
        <EmptyState title="No users found">Try a different search.</EmptyState>
      ) : (
        <Card className="px-5 py-1">
          <p className="pt-3 text-xs text-muted">
            {r.data.total} user{r.data.total === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-border">
            {r.data.rows.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="flex items-center justify-between gap-3 py-3.5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[0.9375rem] font-medium">{u.name}</span>
                      {u.plan === "pro" && <Badge tone="info">Pro</Badge>}
                      {u.suspendedAt && <Badge tone="danger">Suspended</Badge>}
                    </span>
                    <span className="block truncate text-sm text-muted">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    Joined {ago(u.createdAt)}
                    <br />
                    Seen {ago(u.lastSeenAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {r.ok && r.data.pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {r.data.page > 1 ? (
            <Link href={link(r.data.page - 1)} className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-4">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {r.data.page} of {r.data.pages}
          </span>
          {r.data.page < r.data.pages ? (
            <Link href={link(r.data.page + 1)} className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-4">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageSection>
  );
}
