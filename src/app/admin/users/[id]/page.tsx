import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Tabs } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Head } from "../../head";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { getUser, safe } from "@/server/services/admin";
import { deleteAction, planAction, signOutAction, suspendAction } from "../../actions";
import { ADMIN_TABS, Failed, adminTz, fmt } from "../../format";

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="text-sm text-muted">{k}</dt>
    <dd className="min-w-0 truncate text-right text-[15px]">{v}</dd>
  </div>
);

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const r = await safe("user", () => getUser(getDb(), id));
  if (r.ok && !r.data) notFound();
  const tz = await adminTz();
  const u = r.ok ? r.data : null;
  const locked = !!u && (u.isAdmin || u.isDemo);
  return (
    <div className="flex flex-col gap-5">
      <Tabs items={ADMIN_TABS} current="users" />
      <Link href="/admin/users" className="text-sm text-muted hover:text-text">
        ← All users
      </Link>
      {sp.done && <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">{sp.done.slice(0, 200)}</p>}
      {sp.error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{sp.error.slice(0, 300)}</p>}
      {!u ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] leading-tight font-medium">{u.name}</h1>
              {u.plan === "pro" && <Badge tone="info">Pro</Badge>}
              {u.suspendedAt && <Badge tone="danger">Suspended</Badge>}
              {u.isAdmin && <Badge tone="success">Admin</Badge>}
              {u.isDemo && <Badge>Demo</Badge>}
            </div>
            <p className="mt-1 break-all text-sm text-text-2">{u.email}</p>
            <dl className="mt-3 divide-y divide-border">
              <Row k="Plan" v={u.plan === "pro" ? "Pro" : "Free"} />
              <Row k="Joined" v={fmt(u.createdAt, tz)} />
              <Row k="Last seen" v={fmt(u.lastSeenAt, tz)} />
              <Row k="Signed-in devices" v={u.sessions} />
              <Row k="Two-step sign-in" v={u.twoFactor ? "On" : "Off"} />
              <Row k="Passkeys" v={u.passkeys} />
              <Row k="Phone for texts" v={u.hasPhone ? "Yes" : "No"} />
              <Row k="Stripe customer" v={u.hasStripeCustomer ? "Yes" : "No"} />
              <Row k="Time zone" v={u.timezone} />
              {u.suspendedAt && <Row k="Suspended" v={fmt(u.suspendedAt, tz)} />}
            </dl>
            <p className="mt-3 text-xs text-muted">Their money, messages and tasks are private and aren&apos;t shown here.</p>
          </Card>

          {locked ? (
            <Card className="p-5 text-sm text-text-2">{u.isAdmin ? "Admin accounts can't be changed here." : "The demo account can't be changed here."}</Card>
          ) : (
            <>
              <Card className="p-5">
                <Head title="Sign-in" />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <form action={signOutAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <SubmitButton variant="secondary" pendingText="Working…">
                      Sign out everywhere
                    </SubmitButton>
                  </form>
                  <form action={suspendAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="suspend" value={u.suspendedAt ? "0" : "1"} />
                    <SubmitButton variant={u.suspendedAt ? "primary" : "secondary"} pendingText="Working…">
                      {u.suspendedAt ? "Unsuspend" : "Suspend account"}
                    </SubmitButton>
                  </form>
                </div>
                <p className="mt-3 text-xs text-muted">Suspending signs them out at once and blocks sign-in. Nothing is deleted.</p>
              </Card>

              <Card className="p-5">
                <Head title="Plan" />
                <form action={planAction} className="mt-3 flex gap-3">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="plan" defaultValue={u.plan} aria-label="Plan" className="flex-1">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                  </Select>
                  <SubmitButton variant="secondary" pendingText="Saving…">
                    Set plan
                  </SubmitButton>
                </form>
                <p className="mt-3 text-xs text-muted">A manual change. Stripe can change it again the next time their subscription updates.</p>
              </Card>

              <Card className="border border-danger/40 p-5">
                <Head title="Delete user" />
                <p className="mt-2 text-sm text-text-2">Permanently deletes this account and everything in it. This can&apos;t be undone.</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-danger">Show delete</summary>
                  <form action={deleteAction} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="id" value={u.id} />
                    <label className="text-sm text-text-2" htmlFor="confirmEmail">
                      Type <span className="font-medium text-text">{u.email}</span> to confirm
                    </label>
                    <Input id="confirmEmail" name="confirmEmail" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={u.email} required />
                    <SubmitButton variant="danger" pendingText="Deleting…">
                      Delete permanently
                    </SubmitButton>
                  </form>
                </details>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
