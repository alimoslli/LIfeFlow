import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const PAGES = [
  "/",
  "/plan",
  "/tasks",
  "/goals",
  "/habits",
  "/work",
  "/jarvis/says",
  "/jarvis/ideas",
  "/jarvis/profile",
  "/money",
  "/finances/transactions",
  "/finances/accounts",
  "/school",
  "/school/due",
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
