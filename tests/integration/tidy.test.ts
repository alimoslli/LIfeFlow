import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { tidyTransactions, type TidyLlm } from "@/server/services/finance/tidy";
import { createTransaction, queryTransactions } from "@/server/services/finance/transactions";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("tidy transactions", () => {
  it("simplifies vendor names and fills categories, asking the AI only about the unknown, and never inventing a category", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100000 }));
    const add = (description: string, cents: number, date = "2026-11-03") =>
      run((s) => createTransaction(s, { accountId: acct.id, date, description, amountCents: cents }, "import", `t:${description}`));

    // New transactions get a plain name as they arrive.
    const star = await add("SQ *BLUE BOTTLE COFFEE 4411 SAN FRANCISCO CA", -650);
    expect(star!.merchantName).toBe("Blue Bottle Coffee");
    expect(star!.description).toBe("SQ *BLUE BOTTLE COFFEE 4411 SAN FRANCISCO CA"); // the bank's line is kept

    // Older rows (no name, no category) get tidied.
    await add("AMZN Mktp US*2K1AB3", -3200);
    const odd = await add("ZXQ HOLDINGS 88213 LLC", -1800);
    await run((s) => s.tx.update(transactions).set({ merchantName: null, categoryId: null }).where(eq(transactions.userId, s.userId)));

    const asked: string[] = [];
    const llm: TidyLlm = async (items) => {
      asked.push(...items.map((i) => i.text));
      return items.map((i) => ({ key: i.key, name: "Zed Hardware", category: "Household" })).concat([{ key: "not-asked", name: "X", category: "Pets" }]);
    };
    const r = await run((s) => tidyTransactions(s, { llm }));
    expect(r.categorized).toBeGreaterThanOrEqual(2); // Blue Bottle (Coffee) and Amazon (Online Shopping) by keyword
    expect(asked.every((t) => !/BLUE BOTTLE|AMZN/.test(t))).toBe(true); // known vendors never go to the AI
    expect(asked.some((t) => t.includes("ZXQ"))).toBe(true);

    const all = await run((s) => queryTransactions(s, { limit: 50 }));
    const by = (d: string) => all.find((t) => t.description.startsWith(d))!;
    expect(by("SQ *BLUE").merchantName).toBe("Blue Bottle Coffee");
    expect(by("SQ *BLUE").categoryName).toBe("Coffee");
    expect(by("AMZN").merchantName).toBe("Amazon");
    expect(by("AMZN").categoryName).toBe("Online Shopping");
    expect(by("ZXQ").merchantName).toBe("Zed Hardware");
    expect(by("ZXQ").categoryName).toBe("Household");
    expect(odd).toBeTruthy();

    // Without AI the unknown one is simply left readable and uncategorized, and a second run changes nothing.
    const again = await run((s) => tidyTransactions(s, {}));
    expect(again).toEqual({ renamed: 0, categorized: 0, byAi: 0 });
  });
});
