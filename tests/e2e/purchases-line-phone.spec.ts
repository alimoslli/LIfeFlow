import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// Owner, 2026-11-12 (docs/backlog/2026-11-12-useful-sky.md): purchases sit on the line, each at the bank's own time, with the
// day's total. The sky note's own tests come with that piece.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const seed = (email: string, scene: "gap" | "tonight" | "storm") =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-useful-sky.ts", email, scene], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
    stdio: "pipe",
  });

test("purchases on the line: a mark at the bank's own time, and the day's total with every purchase", async ({ page }) => {
  const email = await signUp(page, "Spend Line");
  seed(email, "tonight");
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Open today as a timeline" }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  // three of yesterday's four purchases came with the bank's own time; the fourth is only in the total
  const names = clock.locator(".dc-node .dc-n-n");
  await expect(names.filter({ hasText: "Blue Bottle Coffee · $6.50" })).toHaveCount(1);
  await expect(names.filter({ hasText: "Trader Joe's · $42.10" })).toHaveCount(1);
  await expect(names.filter({ hasText: "Campus bookstore" })).toHaveCount(0);
  await expect(names.filter({ hasText: "Spent $96.44 · 4 purchases" })).toHaveCount(1);
});
