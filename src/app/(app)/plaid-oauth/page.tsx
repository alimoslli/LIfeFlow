import type { Metadata } from "next";
import { PlaidOAuthResume } from "@/components/finance/plaid-link";

export const metadata: Metadata = { title: "Connecting your bank" };

/** Banks that use OAuth send the user back here (PLAID_REDIRECT_URI) to finish Plaid Link. */
export default function PlaidOAuthPage() {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h1 className="font-display text-[28px] font-medium">Connecting your bank</h1>
      <div className="mt-4">
        <PlaidOAuthResume />
      </div>
    </div>
  );
}
