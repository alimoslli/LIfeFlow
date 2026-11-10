import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 1470, height: 830 } });

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

// A MacBook (owner, 2026-11-09: "on the MacBook it looks so small", "no boxes"): one wide sky, the wheel on the left,
// and on the right, in words on the sky, what's now and next with the skyling's line and the ask bar under them.
test("on a laptop the wheel sits on the left and the day's words and the ask bar on the right", async ({ page }) => {
  const email = await signUp(page, "Laptop Tester");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await expect(clock).toHaveAttribute("data-wide", "true");

  const wheel = await page.getByRole("button", { name: /^Today\. Now / }).boundingBox();
  const words = await clock.locator("[data-dc=words]").boundingBox();
  // one ask bar, beside the wheel (the one under the sky is for phones)
  const ask = page.getByRole("textbox", { name: "Message Ray" }).locator("xpath=ancestor::form[1]");
  await expect(ask).toHaveCount(1);
  const askBox = await ask.boundingBox();
  expect(wheel && words && askBox).toBeTruthy();
  expect(words!.x).toBeGreaterThanOrEqual(wheel!.x + wheel!.width - 2);
  expect(askBox!.x).toBeGreaterThanOrEqual(wheel!.x + wheel!.width - 2);
  // all of it on the first screen
  expect(askBox!.y + askBox!.height).toBeLessThanOrEqual(830);
  // and the wheel is a laptop's, not a phone's
  expect(Number(await clock.getAttribute("data-wheel-r"))).toBeGreaterThan(200);

  // it still opens into the week and folds back
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.keyboard.press("Escape");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(ask).toBeVisible();
});
