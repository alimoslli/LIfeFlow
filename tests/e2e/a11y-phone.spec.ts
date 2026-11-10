import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const PAGES = [
  "/",
  "/plan",
  "/tasks",
  "/goals",
  "/habits",
  "/work",
  "/jarvis/says",
  "/jarvis/profile",
  "/money",
  "/finances/transactions",
  "/finances/accounts",
  "/school",
  "/school?view=upcoming",
  "/notes",
  "/settings",
  "/settings/profile",
  "/settings/integrations",
  "/integrity",
];

test("WCAG 2.1 AA: no serious or critical issues on the main screens", async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, "Ada Access");
  const problems: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
      problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// With real-looking data, in light and dark (2026-11-10: rows, cards and the chat's speech bubble only show up with data).
test("WCAG 2.1 AA with data, light and dark: no serious or critical issues", async ({ page }) => {
  test.setTimeout(300_000);
  const email = await signUp(page, "Dee Data");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], { env: { ...process.env, DATABASE_URL: E2E_DB }, stdio: "pipe" });
  const problems: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ["/", "/goals", "/work", "/tasks", "/jarvis", "/school?view=upcoming", "/money", "/finances/bills", "/finances/transactions"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // a pixel cloud paints its body with border-image, which axe can't see, so it measures the words against the sky
        .exclude(".lf-idea-body")
        .analyze();
      for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
        problems.push(`${scheme} ${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
