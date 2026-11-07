import { expect, test } from "@playwright/test";
import { queryAsUser, signUp, whatUsersSee } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

/** "Same bill?" on the Filed page: two big taps, calm words, Yes updates the bill and Undo asks again. */
test("Same bill? card: 44 px taps, Yes updates the bill, Undo asks again", async ({ page }) => {
  const email = await signUp(page);
  const [bill] = await queryAsUser<{ id: string }>(
    email,
    `insert into recurring_items (user_id, name, amount_cents, frequency, next_due_date, kind, status, source)
     select id, 'Verizon', -4500, 'monthly', '2026-11-12', 'bill', 'active', 'manual' from users where email = $1 returning id`,
    [email],
  );
  const ask = {
    bill: { payee: "Verizon", amount_usd: 50, due_date: "2026-11-12", repeats: "monthly", account_ref: null },
    type: "bill",
    summary: "Verizon bill",
    ask: {
      kind: "bill",
      verified: true,
      candidates: [bill.id],
      sameAs: bill.id,
      text: "Same bill? Verizon $50.00 on Thu, Nov 12 from your email, and Verizon $45.00 on Thu, Nov 12 in your bills.",
    },
  };
  await queryAsUser(
    email,
    `insert into inbox_items (user_id, channel, from_address, subject, status, type, summary, reason, extracted)
     select id, 'email', 'billing@verizon.com', 'Your Verizon bill', 'needs_review', 'bill', 'Verizon bill', $2, $3::jsonb from users where email = $1`,
    [email, ask.ask.text, JSON.stringify(ask)],
  );
  await page.goto("/inbox");
  const card = page.getByTestId("same-question");
  await expect(card).toBeVisible();
  for (const b of await card.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  expect(await whatUsersSee(page)).not.toMatch(/jarvis/i);

  await card.getByRole("button", { name: /Yes/ }).click();
  await expect(page.getByText("Bill updated: Verizon")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("same-question")).toBeVisible();
});

/** Two bills it could be: one tap per bill (told apart by their dates), plus "It's a new bill". */
test("Same bill? with two candidates: a button for each, 44 px, and a new-bill button", async ({ page }) => {
  const email = await signUp(page);
  const ids: string[] = [];
  for (const day of ["2026-11-12", "2026-11-14"]) {
    const [b] = await queryAsUser<{ id: string }>(
      email,
      `insert into recurring_items (user_id, name, amount_cents, frequency, next_due_date, kind, status, source)
       select id, 'Verizon', -4500, 'monthly', $2, 'bill', 'active', 'manual' from users where email = $1 returning id`,
      [email, day],
    );
    ids.push(b.id);
  }
  const ask = {
    bill: { payee: "Verizon", amount_usd: 45, due_date: "2026-12-12", repeats: "monthly", account_ref: null },
    type: "bill",
    summary: "Verizon bill",
    ask: {
      kind: "bill",
      verified: true,
      candidates: ids,
      options: [
        { id: ids[0], label: "Verizon $45.00 on Thu, Nov 12" },
        { id: ids[1], label: "Verizon $45.00 on Sat, Nov 14" },
      ],
      text: "Same bill? Verizon $45.00 on Sat, Dec 12 from your email, and two of your Verizon bills.",
    },
  };
  await queryAsUser(
    email,
    `insert into inbox_items (user_id, channel, from_address, subject, status, type, summary, reason, extracted)
     select id, 'email', 'billing@verizon.com', 'Your Verizon bill', 'needs_review', 'bill', 'Verizon bill', $2, $3::jsonb from users where email = $1`,
    [email, ask.ask.text, JSON.stringify(ask)],
  );
  await page.goto("/inbox");
  const card = page.getByTestId("same-question");
  await expect(card.getByRole("button")).toHaveCount(3);
  for (const b of await card.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await expect(card.getByRole("button", { name: /Nov 14/ })).toBeVisible();
  await card.getByRole("button", { name: /Nov 14/ }).click();
  await expect(page.getByText("Bill updated: Verizon")).toBeVisible();
});
