import { merchantKey, merchantKeys, detectRecurring, nthOccurrence, type DetectTxn } from "@/server/services/finance/recurring-detect";
import * as BASE from "./base-recurring-detect";
import { cleanVendorName } from "@/lib/vendor";
const lines: [string, string | null][] = [
  ["Zelle Payment To Jordan Miller 17283910291", null], // Chase
  ["Zelle payment to JORDAN MILLER Conf# h5t6y7u8i", null], // BofA
  ["ZELLE TO MILLER JORDAN ON 10/01 REF #PP0ABC123", null], // Wells Fargo
  ["Zelle money sent to Jordan Miller", null], // Capital One
  ["Zelle money sent to Priya Shah", null], // Capital One, other payee
  ["ZELLE SENT TO JORDAN MILLER", null], // Citi
  ["ZELLE PMT TO JORDAN MILLER", null],
  ["ZELLE DEBIT JORDAN MILLER 8812", null], // PNC-ish
  ["Zelle Transfer Conf# a1b2c3; Jordan Miller", null], // BofA alt
  ["Online Transfer to Jordan Miller via Zelle ref #9X2", null],
  ["VENMO PAYMENT 1023456789", "Venmo"],
  ["VENMO *JORDAN MILLER", null],
  ["CASH APP*JORDAN MILLER*", null],
  ["PAYPAL *JORDANMILLER", null],
  ["APPLE CASH SENT MONEY", null],
  ["SOUTHWEST GAS CORP PAYMENT", "Southwest Gas"],
  ["SOUTHWEST AIRLINES 5262", "Southwest Airlines"],
  ["VERIZON WIRELESS PAYMENTS", "Verizon Wireless"],
  ["VERIZON FIOS", "Verizon Fios"],
  ["COMCAST CABLE COMM", "Comcast"],
  ["XFINITY MOBILE", "Xfinity Mobile"],
  ["GOOGLE *Google One", "Google One"],
  ["GOOGLE *YouTube Premium", "YouTube Premium"],
  ["DISNEY PLUS", "Disney Plus"],
  ["HBO MAX", "HBO Max"],
  ["DOORDASH DASHPASS", "DoorDash DashPass"],
  ["AMZN Digital*KINDLE UNLTD", "Amazon"],
  ["WISE GUYS PIZZA", "Wise Guys Pizza"],
];
for (const [d, m] of lines) {
  const tidy = cleanVendorName(m || d);
  const tm = tidy && tidy !== d.trim() ? tidy : m;
  const t = { description: d, merchantName: m };
  const tt = { description: d, merchantName: tm };
  console.log(JSON.stringify(d).padEnd(52), "| base raw:", BASE.merchantKey(t).padEnd(24), "| base tidied:", BASE.merchantKey(tt).padEnd(22), "| new:", merchantKey(tt).padEnd(24), "| keys:", merchantKeys(tt).join(" / "));
}
