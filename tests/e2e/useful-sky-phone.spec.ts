import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";

// Owner, 2026-11-12 (docs/backlog/2026-11-12-useful-sky.md): the sky does more with what it knows. Today's note is the first
// thing it noticed, with its one step done right there; real trouble wears the storm; purchases sit on the line.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const seed = (email: string, scene: "gap" | "tonight" | "storm") =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-useful-sky.ts", email, scene], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
    stdio: "pipe",
  });

const studyBlocks = async (email: string) =>
  (
    await pool.query<{ title: string }>("select e.title from calendar_events e join users u on u.id = e.user_id where u.email = $1 and e.kind = 'study'", [
      email,
    ])
  ).rows.map((r) => r.title);

test("a free gap between a class and a shift: Block it books it, Undo takes it back", async ({ page }) => {
  const email = await signUp(page, "Gap Finder");
  seed(email, "gap");
  await page.goto("/");
  const note = page.locator(".dc-middle").getByRole("region", { name: "From your skyling" });
  await expect(note).toContainText("2 hours free at 11 AM, after BIO 101");
  await expect(note).toContainText("Enough to start Lab report, due tomorrow 11:59 PM.");
  await note.getByRole("button", { name: "Block it" }).click();
  await expect(note.getByRole("status")).toContainText("Blocked 11 AM to 12:30 PM today.");
  expect(await studyBlocks(email)).toEqual(["Work on Lab report"]);
  await note.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => studyBlocks(email)).toEqual([]);
});

test("real trouble is a storm: no free time before something is due", async ({ page }) => {
  const email = await signUp(page, "Storm Day");
  seed(email, "storm");
  await page.goto("/");
  const note = page.locator(".dc-middle").getByRole("region", { name: "Heads up" });
  await expect(note).toHaveAttribute("data-weather", "storm");
  await expect(note).toContainText("No free time before Essay draft is due");
  await expect(note.getByRole("button", { name: "Find time" })).toBeVisible();
});

test("from 4 PM, Tonight: the free hours and what's due by tomorrow noon", async ({ page }) => {
  const email = await signUp(page, "Tonight Plan");
  seed(email, "tonight");
  await page.goto("/");
  const note = page.locator(".dc-middle").getByRole("region", { name: "From your skyling" });
  await expect(note).toContainText(/Tonight: [\d.]+ hours? free/);
  await expect(note).toContainText("Essay draft is due tomorrow 9 AM.");
  await expect(note.getByRole("button", { name: "Plan tonight" })).toBeVisible();
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
