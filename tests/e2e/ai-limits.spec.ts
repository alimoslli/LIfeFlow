import { expect, test } from "@playwright/test";
import { COMPOSER, pool, queryAsUser, signUp } from "./helpers";

// The skyling's allowances in the real app, against the fake model server (never a real provider). The counters are seeded in the
// database the way real use fills them; the app must then say so in plain words, and the model must not be asked.

async function ids(email: string) {
  const { rows } = await pool.query("select id, to_char(now() at time zone timezone, 'YYYY-MM-DD') as day from users where email = $1", [email]);
  return rows[0] as { id: string; day: string };
}

async function ask(page: import("@playwright/test").Page, text: string) {
  const box = page.getByLabel(COMPOSER);
  await box.fill(text);
  await box.press("Enter");
}

test("a person who has used today's 30 messages is told so in plain words", async ({ page }) => {
  const email = await signUp(page, "Limit Person");
  const { id, day } = await ids(email);
  await pool.query("insert into ai_budgets (key, used) values ($1, 30) on conflict (key) do update set used = 30", [`u:${id}:${day}:msgs`]);
  await page.goto("/jarvis");
  await ask(page, "What is due this week?");
  await expect(
    page.getByText(/You've used today's 30 messages\. While LifeFlow is in testing, everyone gets 30 a day\. More open up in about \d+ hours?\./),
  ).toBeVisible();
  await expect(page.getByText(/Hello from the test model/)).toHaveCount(0);
  // no model names, tokens or settings in what people read
  await expect(page.locator("body")).not.toContainText(/gpt|token|OPENAI|JARVIS_/i);
});

test("the monthly allowance says the date it opens up", async ({ page }) => {
  const email = await signUp(page, "Month Person");
  const { id, day } = await ids(email);
  await pool.query("insert into ai_budgets (key, used) values ($1, 300) on conflict (key) do update set used = 300", [`u:${id}:${day.slice(0, 7)}:msgs`]);
  await page.goto("/jarvis");
  await ask(page, "What is due this week?");
  await expect(page.getByText(/You've used this month's 300 messages\..* More open up on [A-Z][a-z]+ 1\./)).toBeVisible();
});

test("at the company's ceiling the skyling is paused for people, and the rest of the app keeps working", async ({ page }) => {
  await signUp(page, "Ceiling Person");
  const month = new Date().toISOString().slice(0, 7);
  const key = `g:${month}:micros`;
  await pool.query("insert into ai_budgets (key, used) values ($1, 50000000) on conflict (key) do update set used = 50000000", [key]);
  try {
    await page.goto("/jarvis");
    await ask(page, "What is due this week?");
    await expect(page.getByText(/isn't available right now\. Try again later\./)).toBeVisible();
    await expect(page.getByText(/Hello from the test model/)).toHaveCount(0);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await pool.query("delete from ai_budgets where key = $1", [key]);
  }
});

test("under the limits, a message is answered and counted", async ({ page }) => {
  const email = await signUp(page, "Counted Person");
  const { id, day } = await ids(email);
  await page.goto("/jarvis");
  await ask(page, "What is due this week?");
  await expect(page.getByText(/Hello from the test model\. You said: What is due this week\?/)).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => Number((await pool.query("select used from ai_budgets where key = $1", [`u:${id}:${day}:msgs`])).rows[0]?.used ?? 0)).toBe(1);
  const rows = await queryAsUser(email, "select feature, door, state from ai_usage");
  expect(rows).toEqual([{ feature: "chat", door: "chat_route", state: "settled" }]);
});
