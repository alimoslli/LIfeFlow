import Link from "next/link";
import { getDb } from "@/server/db/client";
import { safe, usage } from "@/server/services/admin";
import { Card } from "@/components/ui/surface";
import { Failed } from "../format";
import { Head } from "../head";
import { PageSection } from "../ui";

/** Who is using the assistant this month, against the testing limits. Moved here from the old overview. */
export async function AiUseSection() {
  const use = await safe("usage", () => usage(getDb()));
  return (
    <PageSection id="ai-use" title="AI use" sub={use.ok && use.data.testing ? "Testing limits are on (paid plans are off)." : undefined}>
      <Card className="p-5">
        <Head title="This month" />
        {use.ok ? (
          <>
            {use.data.testing && (
              <p className="mt-2 text-sm text-text-2">
                Each person: {use.data.limits.messagesPerDay} messages a day ({use.data.limits.messagesPerMonth} a month, at most $
                {use.data.limits.assistantDollarsPerMonth} of AI) and {use.data.limits.voiceCallsPerDay} voice calls a day ({use.data.limits.voiceCallsPerMonth}{" "}
                a month, {use.data.limits.voiceCallMinutes} min each). Your account isn&apos;t limited.
              </p>
            )}
            <p className="mt-2 text-sm text-text-2" data-testid="ai-pricing">
              {use.data.pricing.dollarsCounting
                ? "Dollar limits and the company ceilings count only work that has a price set. No price is set for: "
                : "No prices are set, so the dollar limits and the company ceilings aren't counting yet. Work is held to the counted limits only. No price is set for: "}
              {use.data.pricing.unpriced.join(", ")}.
            </p>
            <p className="mt-2 text-sm text-text-2">
              {use.data.messagesToday} messages and {use.data.voiceToday} voice calls today.
            </p>
            {use.data.people.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No AI use yet this month.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {use.data.people.slice(0, 8).map((p) => (
                  <li key={p.userId}>
                    <Link href={`/admin/users/${p.userId}`} className="flex min-h-11 items-center justify-between gap-3 py-3">
                      <span className="min-w-0 truncate text-[0.9375rem]">{p.email ?? "Deleted account"}</span>
                      <span className="tabular shrink-0 text-sm text-text-2">
                        {Math.min(p.messagesMonth, use.data.limits.messagesPerMonth)} msgs · {Math.min(p.voiceMonth, use.data.limits.voiceCallsPerMonth)} calls
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>
    </PageSection>
  );
}
