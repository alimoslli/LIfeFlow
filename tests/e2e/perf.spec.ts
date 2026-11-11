import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Speed budgets for moving around the app (the UX review: "tabs have to be instant").
 * - First visit to a tab may show its skeleton, but must be usable within FIRST_MS.
 * - Every later visit to a tab must show the page straight away: no skeleton, within SWITCH_MS.
 * Run against the production build (playwright.config starts `next start`).
 */
const FIRST_MS = 3000;
const SWITCH_MS = 600;
const TABS = [
  { label: "Today", path: /\/$/ },
  { label: "Money", path: /\/money$/ },
  { label: "School", path: /\/school$/ },
];

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

async function switchTo(page: Page, label: string, path: RegExp) {
  // Watch for the skeleton from the moment of the tap.
  const sawSkeleton = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        let seen = !!document.querySelector("[data-app-loading]");
        const mo = new MutationObserver(() => {
          if (document.querySelector("[data-app-loading]")) seen = true;
        });
        mo.observe(document.body, { childList: true, subtree: true });
        (window as unknown as { __stopWatch: () => void }).__stopWatch = () => {
          mo.disconnect();
          resolve(seen);
        };
      }),
  );
  const t0 = Date.now();
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(path);
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.locator("main h1").first()).toBeVisible();
  const ms = Date.now() - t0;
  await page.evaluate(() => (window as unknown as { __stopWatch: () => void }).__stopWatch());
  return { ms, skeleton: await sawSkeleton };
}

test("tabs: skeleton only on the first visit, instant after that", async ({ page }) => {
  test.setTimeout(180_000);
  const email = await signUp(page, "Speedy Sam");
  // Realistic data, so pages do real work.
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const first: Record<string, number> = {};
  for (const t of TABS.slice(1)) first[t.label] = (await switchTo(page, t.label, t.path)).ms;
  const again: Record<string, { ms: number; skeleton: boolean }> = {};
  for (const t of [...TABS, ...TABS.slice(1)]) again[t.label] = await switchTo(page, t.label, t.path);
  console.log("[perf] first visit ms", first, "repeat visits", again);

  for (const [label, ms] of Object.entries(first)) expect(ms, `first visit to ${label}`).toBeLessThan(FIRST_MS);
  for (const [label, r] of Object.entries(again)) {
    expect(r.skeleton, `${label} showed a skeleton on a repeat visit`).toBe(false);
    expect(r.ms, `repeat visit to ${label}`).toBeLessThan(SWITCH_MS);
  }
});
