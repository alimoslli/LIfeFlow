import OpenAI from "openai";
import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { createRecurring } from "@/server/services/finance/planning";
import { billsToReview, findSavings, listSavings, negotiationScript, setSavingsStatus } from "@/server/services/finance/savings-finder";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const today = todayIn(TZ);

/** A stand-in OpenAI that answers a web search with JSON and the pages it cited. */
const fakeSearch = (options: unknown[], sources: { url: string; title: string }[]) => ({
  model: "test",
  client: new OpenAI({
    apiKey: "sk-test",
    baseURL: "http://fake.local/v1",
    fetch: (async () =>
      new Response(
        JSON.stringify({
          id: "r",
          object: "response",
          status: "completed",
          output: [
            {
              type: "web_search_call",
              id: "ws",
              status: "completed",
              action: { type: "search", query: "q", sources: sources.map((s) => ({ type: "url", url: s.url })) },
            },
            {
              type: "message",
              id: "m",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ options }),
                  annotations: sources.map((s) => ({ type: "url_citation", url: s.url, title: s.title, start_index: 0, end_index: 1 })),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch,
  }),
});

describe("savings finder", () => {
  it("keeps only cheaper options whose price page was cited, shows yearly savings, and tracks what you acted on", async () => {
    const { run } = await makeUser();
    const phone = await run((s) =>
      createRecurring(s, { name: "Verizon Wireless", amountCents: -6500, frequency: "monthly", nextDueDate: addDaysStr(today, 9), kind: "bill" }),
    );
    await run((s) => createRecurring(s, { name: "Rent", amountCents: -90_000, frequency: "monthly", nextDueDate: addDaysStr(today, 3), kind: "bill" }));
    const { bills } = await run((s) => billsToReview(s));
    expect(bills.map((b) => [b.name, b.category])).toEqual([["Verizon Wireless", "phone"]]); // rent isn't comparable

    const search = fakeSearch(
      [
        {
          provider: "Example Mobile",
          plan: "Unlimited Basic",
          monthly_price_usd: 30,
          source_url: "https://mobile.example.com/plans",
          details: "With autopay.",
        },
        { provider: "Pricier Co", plan: "Max", monthly_price_usd: 80, source_url: "https://mobile.example.com/plans", details: "" },
        { provider: "Unsourced Co", plan: "Cheap", monthly_price_usd: 5, source_url: "https://not-cited.example.org", details: "" },
      ],
      [{ url: "https://mobile.example.com/plans", title: "Plans | Example Mobile" }],
    );
    const r = await run((s) => findSavings(s, { recurringId: phone.id }, { search }));
    expect(r.saved.map((o) => o.provider)).toEqual(["Example Mobile"]);
    expect(r.dropped).toBe(2);
    expect(r.saved[0]).toMatchObject({
      currentMonthlyCents: 6500,
      offerMonthlyCents: 3000,
      yearlySavingsCents: 42_000,
      sourceUrl: "https://mobile.example.com/plans",
    });
    expect(negotiationScript(r.saved[0])).toContain("Example Mobile offers Unlimited Basic for $30.00 a month (https://mobile.example.com/plans)");

    expect((await run(listSavings)).foundYearlyCents).toBe(42_000);
    await run((s) => setSavingsStatus(s, r.saved[0].id, "acted"));
    expect(await run(listSavings)).toMatchObject({ foundYearlyCents: 0, actedYearlyCents: 42_000 });
  });
});
