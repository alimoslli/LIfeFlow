import Link from "next/link";
import { Badge, Card, EmptyState, Tabs } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { listUsers, safe } from "@/server/services/admin";
import { ADMIN_TABS, Failed, ago } from "../format";

type SP = { q?: string; plan?: string; status?: string; page?: string; done?: string };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const plan = sp.plan === "free" || sp.plan === "pro" ? sp.plan : undefined;
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const r = await safe("users", () => listUsers(getDb(), { q: sp.q, plan, status, page: Number(sp.page) || 1 }));
  const link = (page: number) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (plan) p.set("plan", plan);
    if (status) p.set("status", status);
    if (page > 1) p.set("page", String(page));
    return `/admin/users${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="flex flex-col gap-5">
      <Tabs items={ADMIN_TABS} current="users" />
      {sp.done && <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">{sp.done.slice(0, 200)}</p>}
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or email" aria-label="Search users" className="sm:flex-1" />
        <Select name="plan" defaultValue={plan ?? ""} aria-label="Plan">
          <option value="">Any plan</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status">
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
            <Link href={link(r.data.page - 1)} className="rounded-xl bg-surface-2 px-4 py-2">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {r.data.page} of {r.data.pages}
          </span>
          {r.data.page < r.data.pages ? (
            <Link href={link(r.data.page + 1)} className="rounded-xl bg-surface-2 px-4 py-2">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
