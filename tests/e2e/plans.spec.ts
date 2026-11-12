import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";
import path from "node:path";

const ON = process.env.E2E_PLANS === "on";
const SHOTS = process.env.E2E_PLANS_SHOTS; // a folder: pictures for the owner, made only in a test environment

async function as(page: import("@playwright/test").Page, stage: "student" | "working") {
  const email = await signUp(page);
  await pool.query(`update users set preferences = preferences || $2::jsonb where email = $1`, [email, JSON.stringify({ lifeStage: stage })]);
}

test.describe("plans: switch off (the default)", () => {
  test.skip(ON, "the switch is on in this run");

  test("no plan page, no price and no Plan door anywhere", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/plan");
    await expect(page.getByTestId("plan-options")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Your plan|Choose LifeFlow/);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /^Plan$/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/\$\d+\.\d\d a month/);
  });
});

test.describe("plans: switch on", () => {
  test.skip(!ON, "run with E2E_PLANS=on");

  test("a student sees the one plan they can buy, in the app's own words", async ({ page }) => {
    await as(page, "student");
    const res = await page.goto("/settings/plan");
    expect(res?.status()).toBe(200);
    const options = page.getByTestId("plan-options");
    await expect(options).toContainText("$9.99 a month");
    await expect(options).not.toContainText("$14.99");
    // the student price asks for a student email first: no Choose button until a code is confirmed
    await expect(page.getByTestId("student-verify")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Choose/ })).toHaveCount(0);
    await expect(page.locator("body")).toContainText("15 messages with your skyling a day");
    await expect(page.locator("body")).not.toContainText(/assistant|companion|jarvis/i);
    for (const b of await page.getByRole("button", { name: /^Choose/ }).all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `student-${test.info().project.name}.png`), fullPage: true });
  });

  test("everyone else sees the standard price", async ({ page }) => {
    await as(page, "working");
    await page.goto("/settings/plan");
    await expect(page.getByTestId("plan-options")).toContainText("$14.99 a month");
    await expect(page.getByTestId("student-verify")).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `standard-${test.info().project.name}.png`), fullPage: true });
  });
});
