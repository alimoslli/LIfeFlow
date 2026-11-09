import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

// The v3 home (docs/design/clock/spec.md, Day Sky): the sky pours into the timeline of the person's real week,
// a stop opens one quiet card that leads to the page that owns it, and the timeline folds back into the sky.
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
  // Something still open after its day belongs to now: one late tile on the sky, at the companion.
  await expect(clock.locator("[data-dc=dome] [data-late]")).toHaveCount(1);
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

  // Back home, open, and fold back by tapping the companion (now).
  await page.goto("/");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.getByRole("button", { name: /^Now, .* Back to Today$/ }).click();
  await expect(clock).toHaveAttribute("data-state", "clock");
  // The line knows what's late: the same to-do sits on it marked late.
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.locator(".dc-node.dc-late")).toHaveCount(1);
  await page.getByRole("button", { name: /^Now, .* Back to Today$/ }).click();
  await expect(clock).toHaveAttribute("data-state", "clock");

  // Open again and pull the line down: it follows the finger and folds back into the sky.
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

  // Pin something: open, "Pin something", pick an emoji, name it, pin it; it's on the line at once, with its emoji.
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.getByRole("button", { name: "Pin something" }).click();
  const sheet = page.getByRole("dialog", { name: "Pin to your timeline" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "✈️" }).click();
  await sheet.getByLabel("Name").fill("Flight to NYC");
  await sheet.getByRole("radio", { name: /^Plan/ }).click();
  await sheet.getByRole("button", { name: "Pin it" }).click();
  await expect(sheet).toBeHidden();
  const pinned = page.locator(".dc-node", { hasText: "Flight to NYC" });
  await expect(pinned).toBeAttached();
  await expect(pinned.locator(".dc-n-ic")).toHaveText("✈️");
  await expect(clock).toHaveAttribute("data-state", "timeline");
  const rows = await queryAsUser<{ title: string }>(email, "select title from calendar_events where title like '%Flight to NYC'");
  expect(rows).toEqual([{ title: "✈️ Flight to NYC" }]);

  // Done right on the card: tap a to-do, Done; it's saved as done and leaves the line.
  await page.locator(".dc-node", { hasText: "Pay phone bill" }).click();
  await page.locator("[data-dc=detail]").getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".dc-node", { hasText: "Pay phone bill" })).toHaveCount(0);
  await expect
    .poll(async () => (await queryAsUser<{ status: string }>(email, "select status from tasks where title = 'Pay phone bill'"))[0]?.status)
    .toBe("done");

  // Edit right on the card: a calendar event opens Plan's editor in place, and saving updates the line.
  await page.locator(".dc-node", { hasText: "Brunch with Jordan" }).click();
  await page.locator("[data-dc=detail]").getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Event" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Title").fill("Brunch with Jordan and Sam");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator(".dc-node", { hasText: "Brunch with Jordan and Sam" })).toBeAttached();
  // A shift opens its own editor the same way.
  await page.locator(".dc-node", { hasText: "Work" }).first().click();
  await page.locator("[data-dc=detail]").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Shift" })).toBeVisible();
});

// A full life stays calm (owner, 2026-11-08/09): three assignments due at 11:59 PM are one stop on the line with one
// emoji, whose card lists them; a row opens that one thing's own card, with Done.
test("things at the same moment stack into one stop that lists them", async ({ page }) => {
  const email = await signUp(page, "Busy Tester");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  const stack = page.getByRole("button", { name: /^3 assignments due, .*11:59 PM$/ }).first();
  await stack.click();
  const card = page.locator("[data-dc=detail]");
  await expect(card).toContainText("3 assignments");
  await expect(card.locator(".dc-d-row")).toHaveCount(3);
  await card.getByRole("button", { name: /Essay draft/ }).click();
  await expect(card.locator(".dc-d-t")).toHaveText("Essay draft");
  await expect(card.getByRole("button", { name: "Done" })).toBeVisible();
});

// "The mechanism" (owner, 2026-11-09): Today is a wheel of time in the sky. Turning it away from now shows "Back to now",
// which rolls it home; a tap pours it into the timeline at the time on top, and folding the line back keeps that time.
test("the wheel turns through time, rolls back to now, and opens where it was turned", async ({ page }) => {
  const email = await signUp(page, "Wheel Tester");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  const face = page.getByRole("button", { name: /^Today\. Now / });
  const back = page.getByRole("button", { name: "Back to now" });
  await expect(back).toBeHidden();

  // A sideways drag turns the wheel back in time; the way home appears.
  const box = await face.boundingBox();
  if (!box) throw new Error("no face");
  await page.mouse.move(box.x + 60, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 120, { steps: 10 });
  await page.mouse.up();
  await expect(back).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await back.click();
  await expect(back).toBeHidden();

  // The keyboard turns it an hour at a time: a day ahead, then Enter opens the line on tomorrow.
  await face.focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowRight");
  await expect(back).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(clock).toHaveAttribute("data-state", "timeline");
  const days = page.getByRole("navigation", { name: "Days" });
  await expect(days.locator("button.dc-on")).not.toHaveText("Today");
  // Folding the line back keeps the wheel where the line was; Back to now brings it home.
  await page.keyboard.press("Escape");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toBeHidden();

  // Turned away again and opened: the now pill on the line folds it back to now, not to where the line was.
  await face.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(back).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.getByRole("button", { name: /^Now, .* Back to Today$/ }).click();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(back).toBeHidden();
});
