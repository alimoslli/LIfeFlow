"use server";
import { formCents, formNum, formObject, mutate, type ActionState } from "@/server/actions";
import { addManualHolding, deleteHolding } from "@/server/services/finance/wealth";

export async function addHoldingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("holding.create", async (s) => {
    await addManualHolding(s, {
      accountId: f.accountId ?? "",
      name: f.name ?? "",
      symbol: f.symbol,
      securityType: (f.securityType as "etf") ?? "other",
      quantity: formNum(f.quantity) ?? 0,
      valueCents: formCents(f.value) ?? 0,
      costBasisCents: formCents(f.costBasis),
    });
  });
}

export async function deleteHoldingAction(id: string): Promise<ActionState> {
  return mutate("holding.delete", async (s) => {
    await deleteHolding(s, id);
  });
}
