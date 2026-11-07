import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { categories, transactions } from "@/server/db/schema";
import { categoryIdByName, learnCategoryRule } from "@/server/services/finance/categorize";
import { createManualAccount } from "@/server/services/finance/accounts";
import { tidyTransactions, TIDY_VERSION, type TidyLlm } from "@/server/services/finance/tidy";
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

  /** Plaid rows filed as Rent by the old sync (created before the fix), plus manual ones. */
  async function rentRows(
    run: Awaited<ReturnType<typeof makeUser>>["run"],
    lines: { description: string; merchantName?: string; source?: "plaid" | "manual"; createdAt?: Date }[],
  ) {
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const rent = await run((s) => categoryIdByName(s, "Rent"));
    await run((s) =>
      s.tx.insert(transactions).values(
        lines.map((l) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-10-01",
          description: l.description,
          merchantName: l.merchantName ?? null,
          amountCents: -9000,
          kind: "expense" as const,
          categoryId: rent!.id,
          source: l.source ?? "plaid",
          createdAt: l.createdAt ?? new Date("2026-10-01T12:00:00Z"),
        })),
      ),
    );
    await run((s) => tidyTransactions(s, {}));
    const got = await run((s) =>
      s.tx
        .select({ d: transactions.description, c: categories.name })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(eq(transactions.userId, s.userId)),
    );
    return { rent: rent!, cat: (d: string) => got.find((g) => g.d === d)!.c };
  }

  it("moves phone, internet and utility bills filed as Rent by the old sync", async () => {
    const { run } = await makeUser();
    const { cat } = await rentRows(run, [
      { description: "VERIZON WIRELESS" },
      { description: "COMCAST" },
      { description: "XFINITY" },
      { description: "PG&E" },
      { description: "PARKVIEW APARTMENTS RENT" },
    ]);
    expect(cat("VERIZON WIRELESS")).toBe("Phone");
    expect(cat("COMCAST")).toBe("Internet");
    expect(cat("XFINITY")).toBe("Internet");
    expect(cat("PG&E")).toBe("Utilities");
    expect(cat("PARKVIEW APARTMENTS RENT")).toBe("Rent");
  });

  it("never moves person-to-person lines, landlords, truncated or merchant-named apartments, manual or newer rows", async () => {
    const { run } = await makeUser();
    const lines = [
      { description: "VENMO *JORDAN MILLER XFINITY" },
      { description: "ZELLE TO MARIA LOPEZ UTILITIES INCLUDED" },
      { description: "VERIZON CENTER APARTMEN" },
      { description: "ACH DEBIT VERIZON CENTER", merchantName: "Verizon Center Apartments" },
      { description: "EDISON PROPERTIES" },
      { description: "COX PROPERTIES" },
      { description: "ZELLE VERIZON WIRELESS" },
      { description: "COMCAST", source: "manual" as const },
      { description: "XFINITY MOBILE", createdAt: new Date("2026-11-06T12:00:00Z") },
    ];
    const { cat } = await rentRows(run, lines);
    for (const l of lines) expect(cat(l.description)).toBe("Rent");
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
        source: "plaid",
        createdAt: new Date("2026-10-01T00:00:00Z"),
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

  it("a steady-state run on a 20,000-row account makes only a handful of queries, and the first runs take at most 600 rows", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const rows = Array.from({ length: 20000 }, (_, i) => ({
      userId: acct.userId,
      accountId: acct.id,
      date: new Date(Date.UTC(2015, 0, 1 + Math.floor(i / 10))).toISOString().slice(0, 10),
      description: i % 3 ? `ZELLE TO PERSON ${i}` : `SQ *BLUE BOTTLE COFFEE ${i} SAN FRANCISCO CA`,
      amountCents: -500,
      kind: "expense" as const,
    }));
    await run(async (s) => {
      for (let i = 0; i < rows.length; i += 2000) await s.tx.insert(transactions).values(rows.slice(i, i + 2000));
    });
    const first = await run((s) => tidyTransactions(s, {}));
    expect(first.renamed + first.categorized).toBeLessThanOrEqual(1200);
    const done = await run(async (s) => {
      await s.tx.update(transactions).set({ tidyVersion: TIDY_VERSION }).where(eq(transactions.userId, s.userId));
      return true;
    });
    expect(done).toBe(true);
    let queries = 0;
    const counted = (tx: object): typeof tx =>
      new Proxy(tx, {
        get(t, k, r) {
          const v = Reflect.get(t, k, r);
          if (["select", "update", "insert", "delete", "execute"].includes(String(k)) && typeof v === "function")
            return (...a: unknown[]) => (queries++, v.apply(t, a));
          return v;
        },
      });
    const r = await run((s) => tidyTransactions({ ...s, tx: counted(s.tx) as typeof s.tx }, { llm: async () => [] }));
    expect(r).toEqual({ renamed: 0, categorized: 0, byAi: 0 });
    expect(queries).toBeLessThanOrEqual(5);
  });

  async function unknownVendors(n: number) {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    await run((s) =>
      s.tx.insert(transactions).values(
        Array.from({ length: n }, (_, i) => ({
          userId: s.userId,
          accountId: acct.id,
          date: "2026-10-01",
          description: `ZXQ ${String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26))}${String.fromCharCode(113 + (i % 5))}vk HOLDINGS LLC`,
          amountCents: -1800,
          kind: "expense" as const,
        })),
      ),
    );
    return run;
  }
  const askedLlm =
    (seen: Set<string>): TidyLlm =>
    async (items) => {
      items.forEach((i) => seen.add(i.key));
      return items.map((i) => ({ key: i.key, name: "Zed Hardware", category: "Household" }));
    };

  it("asks the AI about every unknown vendor over several runs, 40 at a time", async () => {
    const run = await unknownVendors(100);
    const seen = new Set<string>();
    const sizes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = seen.size;
      await run((s) => tidyTransactions(s, { llm: askedLlm(seen) }));
      sizes.push(seen.size - before);
    }
    expect(sizes).toEqual([40, 40, 20, 0]);
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

  it("gives rows tidied with the AI off their AI turn once it is allowed", async () => {
    const run = await unknownVendors(10);
    await run((s) => tidyTransactions(s, {}));
    const seen = new Set<string>();
    await run((s) => tidyTransactions(s, { llm: askedLlm(seen) }));
    expect(seen.size).toBe(10);
    const again = new Set<string>();
    await run((s) => tidyTransactions(s, { llm: askedLlm(again) }));
    expect(again.size).toBe(0);
  });
});
