"use server";
import { mutate, type ActionState } from "@/server/actions";
import { WebSearchError } from "@/server/integrations/web-search";
import { findSavings, setSavingsStatus } from "@/server/services/finance/savings-finder";
import { ServiceError } from "@/server/services/errors";

const R = { revalidate: ["/finances/savings", "/money"] };

/** Live search for cheaper options for one bill or card. */
export async function findSavingsAction(target: { recurringId?: string; accountId?: string }): Promise<ActionState> {
  return mutate(
    "savings.search",
    async (s) => {
      try {
        const r = await findSavings(s, target);
        return r.saved.length
          ? `Found ${r.saved.length} cheaper option${r.saved.length === 1 ? "" : "s"} with sources.${r.dropped ? ` Left out ${r.dropped} without a source for the price.` : ""}`
          : "No cheaper option with a sourced price right now. Your price may already be good.";
      } catch (e) {
        if (e instanceof WebSearchError) throw new ServiceError(e.message);
        throw e;
      }
    },
    R,
  );
}

export async function savingsStatusAction(id: string, status: "acted" | "dismissed"): Promise<ActionState> {
  return mutate(
    `savings.${status}`,
    async (s) => {
      const r = await setSavingsStatus(s, id, status);
      return status === "acted" ? `Nice: about $${Math.round(r.yearlySavingsCents / 100)} a year saved. It's counted on Money.` : "Okay, hidden.";
    },
    R,
  );
}
