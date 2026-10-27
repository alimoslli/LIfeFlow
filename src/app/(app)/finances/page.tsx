import { redirect } from "next/navigation";

/** Money is the finance overview; this keeps old links working. */
export default function FinancesIndex() {
  redirect("/money");
}
