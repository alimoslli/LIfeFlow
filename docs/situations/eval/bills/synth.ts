import { detectRecurring, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { scanTransactions } from "@/server/services/finance/findings";
import { addDaysStr } from "@/lib/dates";
import { mapPfc } from "@/server/integrations/plaid";

const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const monthly = (start: string, n: number, f: (i: number, d: string) => Partial<DetectTxn> & { amountCents: number }) => {
  const out: DetectTxn[] = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1 + i, 1));
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(d, last));
    const date = dt.toISOString().slice(0, 10);
    out.push({ date, merchantName: null, description: "X", kind: "expense", ...chk, ...f(i, date) } as DetectTxn);
  }
  return out;
};
const tr = (desc: string, pfc: string, cents: number) => {
  const m = mapPfc({ primary: pfc.split("_").slice(0, pfc.startsWith("LOAN_PAYMENTS") ? 2 : pfc.startsWith("TRANSFER_") ? 2 : 1).join("_"), detailed: pfc }, -cents, desc);
  return { description: desc, kind: m.kind, categoryName: m.category, amountCents: -cents };
};
function show(label: string, txns: DetectTxn[]) {
  const r = detectRecurring(txns).filter((c) => c.latestAmountCents < 0);
  console.log(`-- ${label}: ` + (r.length ? r.map((c) => `${c.seriesKey} ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence}${c.priceChange ? " price " + JSON.stringify(c.priceChange) : ""}${c.duplicates.length ? " DUPS " + JSON.stringify(c.duplicates) : ""}`).join(" | ") : "nothing"));
  return r;
}
const cases: [string, string, number][] = [
  ["ALLY BANK TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER", 50000],
  ["ONLINE TRANSFER TO ALLY BANK", "TRANSFER_OUT_ACCOUNT_TRANSFER", 50000],
  ["MARCUS GOLDMAN SACHS DES:TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER", 30000],
  ["CAPITAL ONE 360 DES:TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER", 20000],
  ["SOFI BANK DES:TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER", 20000],
  ["VANGUARD BUY INVESTMENT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", 25000],
  ["FIDELITY MONEYLINE", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", 25000],
  ["ROBINHOOD DES:FUNDS", "TRANSFER_OUT_ACCOUNT_TRANSFER", 10000],
  ["VENMO ADD FUNDS", "TRANSFER_OUT_ACCOUNT_TRANSFER", 10000],
  ["ZELLE TO SMITH JANE (self)", "TRANSFER_OUT_ACCOUNT_TRANSFER", 40000],
  ["CITI AUTOPAY PAYMENT 230510", "LOAN_PAYMENTS_OTHER_PAYMENT", 20000],
  ["CAPITAL ONE MOBILE PYMT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 20000],
  ["APPLECARD GSBANK PAYMENT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000],
  ["BARCLAYCARD US EPAY", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000],
  ["SYNCHRONY BANK PAYMENT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000],
  ["PAYPAL INST XFER", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000],
  ["CASH APP*CASH OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000],
  ["TOYOTA FINANCIAL PMT", "LOAN_PAYMENTS_CAR_PAYMENT", 38900],
  ["DEPT EDUCATION STUDENT LN", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", 21000],
  ["ZELLE TO ROOMMATE", "TRANSFER_OUT_ACCOUNT_TRANSFER", 70000],
];
for (const [desc, pfc, cents] of cases) show(`${desc} [${pfc}]`, monthly("2026-05-03", 6, () => tr(desc, pfc, cents)));
// Payroll split: biweekly transfer to savings at another bank on payday
const bw: DetectTxn[] = [];
for (let i = 0; i < 12; i++) bw.push({ date: addDaysStr("2026-05-08", 14 * i), merchantName: null, ...chk, ...tr("WEALTHFRONT EDI PYMNTS", "TRANSFER_OUT_ACCOUNT_TRANSFER", 15000) } as DetectTxn);
show("biweekly Wealthfront on payday", bw);
// Venmo utility share, variable, mixed with small Venmo payments
const v = monthly("2026-05-14", 6, (i) => ({ ...tr(`VENMO PAYMENT 10${i}23`, "TRANSFER_OUT_ACCOUNT_TRANSFER", [5290, 4322, 5729, 6100, 4800, 5500][i]) }));
show("Venmo variable utilities share alone", v);
