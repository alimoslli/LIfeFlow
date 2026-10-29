import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

/**
 * Proactive Jarvis end to end on a phone, with realistic data: recurring
 * charges with a price increase, a free trial, rent due, a goal, late to-dos,
 * a shift before an essay. Web search and document reading go to the local
 * fake OpenAI server (real providers aren't reachable from CI).
 */

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
const seed = (email: string) =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
    stdio: "pipe",
  }).toString();

/** Set SHOTS=<dir> to save phone screenshots of each screen. */
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};
const card = (page: Page, text: string | RegExp) => page.getByTestId("jarvis-message").filter({ hasText: text });

test("Jarvis coaches from real data on a phone, learns from the buttons, and files the inbox", async ({ page }) => {
  test.setTimeout(240_000);
  const email = await signUp(page, "Riley Chen");
  expect(seed(email)).toContain("Jarvis has");

  await test.step("Today leads with the most important message", async () => {
    await page.goto("/");
    await expect(page.getByTestId("jarvis-message").first()).toContainText("may not be covered");
    await shot(page, "1-today");
  });

  await test.step("Jarvis says: Do it moves budget room, Undo puts it back", async () => {
    await page.goto("/jarvis/says");
    const pace = card(page, "Groceries is running high");
    await expect(pace).toContainText("You spent $110 on groceries this week, $70 more than usual");
    await pace.getByRole("button", { name: /Move \$70/ }).click();
    await expect(pace).toContainText("Moved $70 from Entertainment");
    await pace.scrollIntoViewIfNeeded();
    await shot(page, "2-jarvis-says-done");
    await pace.getByRole("button", { name: "Undo" }).click();
    await expect(pace).toContainText("Undone");
  });

  await test.step("Not now, thumbs up, and don't suggest again", async () => {
    const trial = card(page, "Paramount+ trial ends in 3 days");
    await trial.getByRole("button", { name: "Not now" }).click();
    await expect(trial.getByRole("button", { name: "Not now" })).toHaveCount(0);

    const goal = card(page, "50% of the way to Paris trip");
    await goal.getByRole("button", { name: "Helpful", exact: true }).click();
    await expect(goal.getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute("aria-pressed", "true");

    const late = card(page, "to-dos slipped");
    await late.getByRole("button", { name: "More options" }).click();
    await late.getByRole("button", { name: "Don't suggest this again" }).click();
    await expect(late.getByRole("button", { name: "More options" })).toHaveCount(0);
    const rows = await queryAsUser<{ status: string; rating: number | null; kind: string }>(email, "select kind, status, rating from jarvis_messages");
    expect(rows.find((r) => r.kind === "trial_ending")?.status).toBe("dismissed");
    expect(rows.find((r) => r.kind === "goal_milestone")?.rating).toBe(1);
    expect(rows.find((r) => r.kind === "overdue_tasks")?.status).toBe("muted");
  });

  await test.step("Learning consent, What Jarvis knows, Bring back", async () => {
    await card(page, "Can I learn from your answers?").getByRole("button", { name: "Yes, learn" }).click();
    await expect(card(page, "Can I learn from your answers?")).toContainText("I'll learn from how you respond");
    await page.goto("/settings/memory");
    await expect(page.getByText("Learn from my responses")).toBeVisible();
    await expect(page.getByText("Subscription price increases")).toBeVisible();
    await page.getByText("Learn from my responses").scrollIntoViewIfNeeded();
    await shot(page, "3-what-jarvis-learned");
    await page.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByText("You said don't suggest again")).toHaveCount(0);
  });

  await test.step("Personality: live preview follows the tone", async () => {
    const preview = page.getByTestId("personality-preview");
    await page.getByText("Straight to the point", { exact: true }).click();
    await expect(preview).toContainText("You spent $86 on food this week, $30 more than usual. Want me to move $30 from Fun to Food?");
    await preview.scrollIntoViewIfNeeded();
    await shot(page, "4-personality-preview");
    await page.getByRole("button", { name: "Save personality" }).click();
    await expect(page.getByText("Saved. That's how I'll sound from now on.")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await queryAsUser<{ p: { assistantStyle?: string } }>(email, "select preferences as p from users where email = $1", [email]))[0].p.assistantStyle,
      )
      .toBe("direct");
  });

  await test.step("Subscriptions: totals and flags", async () => {
    await page.goto("/finances/subscriptions");
    await expect(page.getByText(/Netflix\s*went up from \$15\.49 to \$17\.99/)).toBeVisible();
    await expect(page.getByText(/Paramount\+\s*'s free trial ends in 3 days/)).toBeVisible();
    await expect(page.getByText(/3 video streaming subscriptions \(Netflix, Paramount\+, Hulu\)/)).toBeVisible();
    await shot(page, "5-subscriptions");
  });

  await test.step("Save money: sourced cheaper plans and a script", async () => {
    await page.goto("/finances/savings");
    const verizon = page.getByRole("heading", { name: "Verizon" }).locator("xpath=ancestor::*[.//button][1]");
    await verizon.getByRole("button", { name: "Find cheaper" }).click();
    await expect(page.getByRole("link", { name: "Source: Plans | Example Mobile" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Unsourced Co")).toHaveCount(0);
    await page.getByRole("link", { name: "Source: Plans | Example Mobile" }).scrollIntoViewIfNeeded();
    await shot(page, "6-save-money");
    await page.getByRole("button", { name: "Negotiation script" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("I'm a Verizon customer and I'm paying $85.00 a month");
  });

  await test.step("Inbox: an upload and a forwarded bill are filed; Undo works", async () => {
    await page.goto("/inbox");
    await page.getByLabel("Photo or PDF to file").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"),
    });
    await expect(page.getByText("Receipt from Target for $23.45.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByText("Undone").first()).toBeVisible();

    const [{ id, inbox_token }] = (await pool.query("select id, inbox_token from users where email = $1", [email])).rows;
    await queryAsUser(email, "insert into inbox_senders (user_id, email, verified_at) values ($1, 'riley@gmail.com', now())", [id]);
    const res = await page.request.post("/api/inbox/email?key=e2e-inbox-secret", {
      data: {
        OriginalRecipient: `u-${inbox_token}@in.example.com`,
        FromFull: { Email: "riley@gmail.com" },
        Subject: "Fwd: Your Comcast bill",
        TextBody: "Your bill of $64.99 is due.",
        Headers: [{ Name: "Received-SPF", Value: "Pass (sender SPF authorized) identity=mailfrom; domain=gmail.com" }],
      },
    });
    expect(res.ok()).toBe(true);
    await page.reload();
    await expect(page.getByText("Comcast internet bill, $64.99 due soon.", { exact: true })).toBeVisible();
    await shot(page, "7-inbox");
  });

  await test.step("Habits and trips", async () => {
    await page.goto("/habits");
    await expect(page.getByText("No-spend weekend").first()).toBeVisible();
    await page.goto("/trips");
    await page.getByLabel("Name", { exact: true }).fill("Paris");
    await page.getByLabel("Where", { exact: true }).fill("Paris, France");
    await page.getByLabel("From", { exact: true }).fill("2027-05-20");
    await page.getByLabel("To", { exact: true }).fill("2027-05-27");
    await page.getByRole("button", { name: "Add trip" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Paris" })).toBeVisible();
    await expect(page.getByText("Thu, May 20 to Thu, May 27, 2027 · Paris, France")).toBeVisible();
  });

  await test.step("Nothing overflows sideways on a phone", async () => {
    for (const path of ["/", "/jarvis/says", "/finances/subscriptions", "/finances/savings", "/inbox", "/settings/memory"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
