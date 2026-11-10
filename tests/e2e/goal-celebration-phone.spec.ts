import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

/** A goal's milestone is celebrated once: leaving the page right away must not bring it back on the next visit. */
test("a goal milestone is celebrated once, even when you leave the page right away", async ({ page }) => {
  const email = await signUp(page, "Gia Goals");
  // a money goal just past halfway (Paris trip, $1,050 of $2,000)
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], { env: { ...process.env, DATABASE_URL: E2E_DB }, stdio: "pipe" });
  await page.goto("/goals");
  await expect(page.getByRole("status").filter({ hasText: "Paris trip: 50%" })).toBeVisible();
  // straight away to another page and back: not again
  await page.goto("/money");
  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "Goals" }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("status").filter({ hasText: "Paris trip: 50%" })).toHaveCount(0);
});
