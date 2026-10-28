import { MoneyLockScreen } from "@/components/money-lock-screen";
import { requireUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";

/**
 * Every Money page calls this first, before loading any data. Checked per page
 * (not in a layout), because layouts don't re-run on client-side navigation.
 */
export async function moneyGate() {
  const user = await requireUser();
  return (await moneyLocked(user, { touch: true })) ? <MoneyLockScreen /> : null;
}
