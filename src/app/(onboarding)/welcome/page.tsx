import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserForWelcome } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { accountHasPassword } from "@/server/services/accounts";
import { AgeBlocked } from "./age-blocked";

export const metadata: Metadata = { title: "Welcome" };

const RESULTS = ["connected", "denied", "failed", "missing_scopes", "admin_consent", "not_configured", "use_main_site"] as const;

/**
 * Setup happens on Today itself (owner, 2026-11-12; `_today/setup-today.tsx`). This address stays for two things:
 *   - the one calm screen for an account locked under 13 (whatever year is typed later, also after setup);
 *   - the fixed place Google and Microsoft come back to after connecting during setup (never a URL from the request),
 *     which sends on to Today with what happened.
 * The separate welcome screens that used to live here were kept for the owner's comparison and are gone (owner, 2026-11-15).
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ connected?: string; result?: string }> }) {
  const user = await requireUserForWelcome();
  // the lock screen comes before anything else, or a locked finished account would bounce between / and here
  if (user.preferences?.ageBlockedAt) return <AgeBlocked withPassword={await accountHasPassword(getDb(), user.id)} />;
  const q = await searchParams;
  const keep = new URLSearchParams();
  if ((q.connected === "google" || q.connected === "outlook") && RESULTS.includes(q.result as (typeof RESULTS)[number])) {
    keep.set("connected", q.connected);
    keep.set("result", q.result!);
  }
  redirect(keep.size ? `/?${keep}` : "/");
}
