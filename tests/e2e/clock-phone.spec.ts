import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

// The v3 home (docs/design/clock/spec.md): the clock opens into the timeline of the person's real week,
// a node opens one quiet card that leads to the page that owns it, and the timeline wraps back into the clock.
// Times are relative to the real "now", so nothing here depends on the hour the suite runs.
test("the day clock opens into the real week and wraps back", async ({ page }) => {
  const email = await signUp(page, "Clock Tester");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await expect(clock).toHaveAttribute("data-state", "clock");
  // Closed, the timeline's controls aren't reachable (hidden, not just transparent).
  await expect(page.getByRole("navigation", { name: "Days" })).toBeHidden();

  // Open: tap the clock.
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  const days = page.getByRole("navigation", { name: "Days" });
  await expect(days).toBeVisible();
  await expect(days.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "date");
  // The line holds the week: today's shift and class, tomorrow's run, Monday's exam.
  for (const name of [/^Work, /, /^Class, /, /^Run with Sam, /, /^Exam 2, /]) await expect(page.getByRole("button", { name }).first()).toBeAttached();
  // Today's tiles: the shift and the class, and a deadline (today's or the next one ahead).
  await expect(page.locator(".dc-tile")).toHaveCount(3);

  // A node opens one quiet card that says where it came from, and "Open" goes to the page that owns it.
  await page
    .getByRole("button", { name: /^Work, / })
    .first()
    .click();
  const card = page.locator("[data-dc=detail]");
  await expect(card).toContainText("From your work schedule");
  await expect(card).toContainText("Campus Coffee");
  await card.getByRole("button", { name: "Open work" }).click();
  await page.waitForURL("**/work");

  // Back home, open, and wrap back with the now pill.
  await page.goto("/");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.getByRole("button", { name: /^Now, .* Back to the clock$/ }).click();
  await expect(clock).toHaveAttribute("data-state", "clock");

  // Open again and pull the line down: it follows the finger and wraps into the clock.
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  const line = await page.getByRole("region", { name: "Timeline" }).boundingBox();
  if (!line) throw new Error("no timeline");
  const x = line.x + line.width * 0.3;
  const y = line.y + 120;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 240, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(clock).toHaveAttribute("data-state", "clock");
});
