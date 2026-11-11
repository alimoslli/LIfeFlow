import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui/surface";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getDb } from "@/server/db/client";
import { safe, waitlistBatchSizes, waitlistHistory, waitlistNext, waitlistView, type WaitlistEvent } from "@/server/services/admin";
import { acceptWaitlistAction, waitlistSwitchAction } from "../actions";
import { Head } from "../head";
import { Failed, adminTz, ago, fmt } from "../format";
import { PageSection, Tile } from "../ui";

export type WaitlistParams = { wq?: string; wpage?: string; wn?: string };

/** A confirm box with a full-size target. */
function Confirm({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
      <span>{children}</span>
    </label>
  );
}

const EVENT: Record<string, string> = {
  "waitlist.accept": "Let in",
  "waitlist.on": "Turned the waitlist on",
  "waitlist.off": "Turned the waitlist off",
  "waitlist.note": "Changed the launch line",
};

function eventText(e: WaitlistEvent) {
  const what = EVENT[e.action] ?? e.action;
  return e.action === "waitlist.accept" ? `${what} ${e.targetEmail ?? "an account"}` : what;
}

/**
 * The waitlist (owner, 2026-11-11): who's waiting in order, letting people in one at a time or the next batch, the switch
 * that closes the app to everyone not let in, and what changed. Letting someone in never changes their plan or messages them.
 */
export async function WaitlistSection({ sp }: { sp: WaitlistParams }) {
  const size = waitlistBatchSizes.includes(Number(sp.wn) as (typeof waitlistBatchSizes)[number]) ? Number(sp.wn) : 10;
  const v = await safe("waitlist", () => waitlistView(getDb(), { q: sp.wq, page: Number(sp.wpage) || 1 }));
  const next = await safe("next batch", () => waitlistNext(getDb(), size));
  const history = await safe("waitlist history", () => waitlistHistory(getDb()));
  const tz = await adminTz();
  const link = (page: number) => {
    const p = new URLSearchParams();
    if (sp.wq) p.set("wq", sp.wq);
    if (page > 1) p.set("wpage", String(page));
    if (size !== 10) p.set("wn", String(size));
    return `/admin/people${p.size ? `?${p}` : ""}#waitlist`;
  };

  if (!v.ok) {
    return (
      <PageSection id="waitlist" title="Waitlist">
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      </PageSection>
    );
  }
  const w = v.data;
  return (
    <PageSection
      id="waitlist"
      title="Waitlist"
      sub="Everyone waits in sign-up order until you let them in. Letting someone in gives app access only: no plan change, no message."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Waiting" value={w.waiting} />
        <Tile label="In the app" value={w.inApp} sub="Admins always in" />
        <Tile
          label="Waitlist"
          value={w.on ? "On" : "Off"}
          sub={w.on ? "Only people let in can use the app" : "Everyone can use the app"}
          tone={w.on ? "attention" : undefined}
        />
      </div>

      <Card className="p-5" data-testid="waitlist-switch">
        <Head
          title={w.on ? "The waitlist is on" : "The waitlist is off"}
          subtitle={
            w.on
              ? "People you haven't let in see their place in line instead of the app."
              : `Turning it on sends the ${w.waiting} ${w.waiting === 1 ? "person" : "people"} waiting to their place in line. Let in anyone who should keep using the app first.`
          }
        />
        <form action={waitlistSwitchAction} className="mt-4 flex flex-col gap-2">
          <input type="hidden" name="on" value={w.on ? "0" : "1"} />
          {!w.on && <Confirm>I&apos;ve let in everyone who should keep using the app.</Confirm>}
          <SubmitButton variant={w.on ? "secondary" : "primary"} className="self-start" pendingText="Saving…">
            {w.on ? "Turn the waitlist off" : "Turn the waitlist on"}
          </SubmitButton>
        </form>
        <form action={waitlistSwitchAction} className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <input type="hidden" name="on" value={w.on ? "1" : "0"} />
          <input type="hidden" name="confirm" value="yes" />
          <Field label="Launch line on the waitlist page" htmlFor="w-note" hint="Tentative, in your words. Leave empty for none.">
            <Input
              id="w-note"
              name="launchNote"
              maxLength={200}
              defaultValue={w.launchNote ?? ""}
              placeholder="We're aiming for the App Store in January 2027."
            />
          </Field>
          <SubmitButton variant="secondary" size="sm" className="self-start" pendingText="Saving…">
            Save the line
          </SubmitButton>
        </form>
      </Card>

      <Card className="p-5" data-testid="waitlist-batch">
        <Head title="Let the next people in" subtitle="Pick how many, check the names, then confirm." />
        <form method="get" action="/admin/people#waitlist" className="mt-3 flex items-end gap-2">
          {sp.wq && <input type="hidden" name="wq" value={sp.wq} />}
          <Field label="How many" htmlFor="w-size">
            <Select id="w-size" name="wn" defaultValue={String(size)} className="w-28">
              {waitlistBatchSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            Show them
          </Button>
        </form>
        {!next.ok ? (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        ) : next.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nobody is waiting.</p>
        ) : (
          <form action={acceptWaitlistAction} className="mt-3 flex flex-col gap-3">
            <ol role="list" className="divide-y divide-border rounded-2xl bg-surface-2/60 px-4" aria-label="Next in line">
              {next.data.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <input type="hidden" name="id" value={p.id} />
                  <span className="tabular w-6 shrink-0 text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{p.name}</span> <span className="text-text-2">{p.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">joined {ago(p.createdAt)}</span>
                </li>
              ))}
            </ol>
            <Confirm>
              Yes, let these {next.data.length} {next.data.length === 1 ? "person" : "people"} in.
            </Confirm>
            <SubmitButton className="self-start" pendingText="Letting them in…">
              Let {next.data.length} {next.data.length === 1 ? "person" : "people"} in
            </SubmitButton>
          </form>
        )}
      </Card>

      <Card className="px-5 py-4" data-testid="waitlist-line">
        <Head title="The line" subtitle="Friends = people who signed up with their invite link." />
        <form method="get" action="/admin/people#waitlist" className="mt-3 flex gap-2">
          {size !== 10 && <input type="hidden" name="wn" value={size} />}
          <Input name="wq" defaultValue={sp.wq ?? ""} placeholder="Search name or email" aria-label="Search the waitlist" className="min-w-0 flex-1" />
          <Button type="submit">Find</Button>
        </form>
        {w.rows.length === 0 ? (
          <EmptyState title={sp.wq ? "Nobody waiting matches that" : "Nobody is waiting"}>{sp.wq ? "Try a different search." : null}</EmptyState>
        ) : (
          <>
            <p className="pt-3 text-xs text-muted">
              {w.total} {w.total === 1 ? "person" : "people"}
              {sp.wq ? " match" : " waiting"}
            </p>
            <ul role="list" className="divide-y divide-border">
              {w.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="tabular w-10 shrink-0 font-medium">#{r.place}</span>
                  <Link href={`/admin/users/${r.id}`} className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.name}</span> <span className="text-text-2">{r.email}</span>
                  </Link>
                  {r.friends > 0 && <Badge>{r.friends === 1 ? "1 friend" : `${r.friends} friends`}</Badge>}
                  <span className="text-xs text-muted">joined {ago(r.createdAt)}</span>
                  <details className="w-full sm:w-auto">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent">Let in</summary>
                    <form action={acceptWaitlistAction} className="flex flex-col gap-1 pb-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Confirm>Yes, let {r.name.split(" ")[0]} in now.</Confirm>
                      <SubmitButton size="sm" className="self-start" pendingText="Letting in…">
                        Let {r.name.split(" ")[0]} in
                      </SubmitButton>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
            {w.pages > 1 && (
              <nav className="flex items-center justify-between pt-2 text-sm" aria-label="Waitlist pages">
                {w.page > 1 ? (
                  <Link href={link(w.page - 1)} className="inline-flex min-h-11 items-center font-medium text-accent">
                    Earlier
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-muted">
                  Page {w.page} of {w.pages}
                </span>
                {w.page < w.pages ? (
                  <Link href={link(w.page + 1)} className="inline-flex min-h-11 items-center font-medium text-accent">
                    Later
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </Card>

      <Card className="px-5 py-4" data-testid="waitlist-history">
        <Head title="What changed" />
        {!history.ok ? (
          <p className="mt-2 text-sm text-danger">{Failed()}</p>
        ) : history.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {history.data.map((e) => (
              <li key={e.id} className="flex flex-col py-2 text-sm">
                <span className="break-words">{eventText(e)}</span>
                <span className="text-xs text-muted">
                  {fmt(e.createdAt, tz)} · by {e.actorEmail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageSection>
  );
}
