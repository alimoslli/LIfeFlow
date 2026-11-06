import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { categories, transactions } from "@/server/db/schema";
import { categoryIdByName, learnCategoryRule } from "@/server/services/finance/categorize";
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

  it("reaches every row of a big account over repeated runs, never changing more than 600 per run", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      userId: acct.userId,
      accountId: acct.id,
      date: new Date(Date.UTC(2020, 0, 1 + Math.floor(i / 5))).toISOString().slice(0, 10),
      description: `SQ *BLUE BOTTLE COFFEE ${1000 + i} SAN FRANCISCO CA`,
      amountCents: -500,
      kind: "expense" as const,
    }));
    await run(async (s) => {
      for (let i = 0; i < rows.length; i += 1000) await s.tx.insert(transactions).values(rows.slice(i, i + 1000));
    });
    let runs = 0;
    for (; runs < 20; runs++) {
      const r = await run((s) => tidyTransactions(s, {}));
      expect(Math.max(r.renamed, r.categorized)).toBeLessThanOrEqual(600);
      if (!r.renamed && !r.categorized) break;
    }
    expect(runs).toBe(9); // 5,000 rows / 600 per run
    const left = await run(
      async (s) =>
        (
          await s.tx
            .select({ n: sql<number>`count(*)::int` })
            .from(transactions)
            .where(and(eq(transactions.userId, s.userId), isNull(transactions.categoryId)))
        )[0].n,
    );
    expect(left).toBe(0);
  });

  it("moves phone, internet and utility bills filed as Rent, but never a landlord or a row with a rule", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const names = ["VERIZON WIRELESS", "COMCAST", "XFINITY", "PG&E", "PARKVIEW APARTMENTS RENT"];
    const rent = await run((s) => categoryIdByName(s, "Rent"));
    await run((s) =>
      s.tx.insert(transactions).values(
        names.map((d) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-10-01",
          description: d,
          amountCents: -9000,
          kind: "expense" as const,
          categoryId: rent!.id,
        })),
      ),
    );
    await run((s) => tidyTransactions(s, {}));
    const got = await run(async (s) =>
      s.tx
        .select({ d: transactions.description, m: transactions.merchantName, c: categories.name })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(eq(transactions.userId, s.userId)),
    );
    const cat = (d: string) => got.find((g) => g.d === d)!.c;
    expect(cat("VERIZON WIRELESS")).toBe("Phone");
    expect(cat("COMCAST")).toBe("Internet");
    expect(cat("XFINITY")).toBe("Internet");
    expect(cat("PG&E")).toBe("Utilities");
    expect(cat("PARKVIEW APARTMENTS RENT")).toBe("Rent");
  });

  it("leaves a Verizon row alone when the user has a rule saying Rent", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const rent = await run((s) => categoryIdByName(s, "Rent"));
    await run((s) =>
      s.tx.insert(transactions).values({
        userId: s.userId,
        accountId: acct.id,
        date: "2026-10-02",
        description: "VERIZON WIRELESS",
        amountCents: -9000,
        kind: "expense",
        categoryId: rent!.id,
      }),
    );
    await run((s) => learnCategoryRule(s, { merchantName: null, description: "VERIZON WIRELESS" }, rent!.id));
    await run((s) => tidyTransactions(s, {}));
    const [row] = await run((s) =>
      s.tx
        .select({ c: categories.name })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(eq(transactions.userId, s.userId)),
    );
    expect(row.c).toBe("Rent");
  });
});
