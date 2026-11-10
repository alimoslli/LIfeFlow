import { formatDateStr } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The next 30 days in one bar: what you have now, split into the bills that will come out,
 * your usual day-to-day spending, and what's left. If it doesn't fit, the bar shows by how
 * much. Expected pay (salaried jobs only) is shown under it and never counted.
 */

const whole = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.\d\d$/, "");

export type OutlookBill = { date: string; name: string; amountCents: number; found: boolean };

export function CashOutlook(p: {
  cashCents: number;
  bills: OutlookBill[];
  dailySpendCents: number;
  days: number;
  expectedPay: { date: string; amountCents: number }[];
}) {
  const billsCents = p.bills.reduce((n, b) => n + -b.amountCents, 0);
  const usualCents = Math.max(0, p.dailySpendCents * p.days);
  const leftCents = p.cashCents - billsCents - usualCents;
  const total = Math.max(1, p.cashCents, billsCents + usualCents);
  const pct = (c: number) => `${Math.max(0, (c / total) * 100)}%`;
  const short = leftCents < 0;
  const pay = p.expectedPay[0];

  return (
    <div>
      <p className="text-[0.9375rem] leading-snug">
        {short ? (
          <>
            Bills and usual spending come to <b className="tabular font-semibold">{whole(billsCents + usualCents)}</b>, which is{" "}
            <b className="tabular font-semibold text-danger">{whole(-leftCents)} more</b> than you have now.
          </>
        ) : (
          <>
            After bills and usual spending, about <b className="tabular font-semibold text-accent">{whole(leftCents)}</b> is left.
          </>
        )}
      </p>

      {/* One bar: the whole width is what you have (or what's needed, if that's more). */}
      <div
        className="relative mt-4"
        role="img"
        aria-label={`Bills ${whole(billsCents)}, usual spending ${whole(usualCents)}, ${short ? `short ${whole(-leftCents)}` : `left ${whole(leftCents)}`}`}
      >
        <div className="flex h-3.5 overflow-hidden rounded-full bg-surface-2">
          <span className="lf-grow h-full bg-danger/85" style={{ width: pct(billsCents) }} />
          <span className="lf-grow h-full bg-warning/80" style={{ width: pct(usualCents) }} />
          {!short && <span className="lf-grow h-full bg-accent" style={{ width: pct(leftCents) }} />}
        </div>
        {short && (
          // Where your money runs out.
          <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-text" style={{ left: pct(p.cashCents) }} aria-hidden />
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[0.8125rem]">
        <Legend dot="bg-danger/85" label="Bills" value={whole(billsCents)} />
        <Legend dot="bg-warning/80" label="Usual spending" value={whole(usualCents)} />
        <Legend dot={short ? "bg-text" : "bg-accent"} label={short ? "You have" : "Left"} value={whole(short ? p.cashCents : leftCents)} />
      </dl>

      {pay && (
        <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-text-2">
          Expected pay: <span className="tabular font-medium text-text">{whole(pay.amountCents)}</span> on {formatDateStr(pay.date, "MMM d")}. Not counted until
          it lands.
        </p>
      )}

      {p.bills.length > 0 && (
        <ul className="lf-rows mt-4 *:px-3">
          {p.bills.slice(0, 6).map((b) => (
            <li key={`${b.name}${b.date}`} className="flex items-center gap-3 py-3">
              <span className="tabular w-12 shrink-0 text-[0.8125rem] text-muted">{formatDateStr(b.date, "MMM d")}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 break-words text-[0.9375rem]">{b.name}</span>
                {b.found && <span className="block text-xs text-muted">Found in your bank history</span>}
              </span>
              <span className="tabular text-[0.9375rem]">{whole(-b.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Usual spending is your average of {whole(p.dailySpendCents)} a day, not counting bills.</p>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden /> {label}
      </dt>
      <dd className="tabular mt-0.5 text-[0.9375rem] font-medium">{value}</dd>
    </div>
  );
}
