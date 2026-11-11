import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { signUp, fillBirthday } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

/**
 * Every visible control is at least 44x44 px of tappable area (playbook definition of done 2, audit A12).
 * The tap area is the element's box, or a larger ::before/::after hit area (`lf-hit` in globals.css).
 * Links inside running text (a <p>, or a span in a list item) are exempt, as WCAG 2.5.8 allows;
 * a checkbox or radio counts by its label.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SEL =
      "a[href], button, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=slider], input:not([type=hidden]), select, textarea, summary";
    const MIN = 43.5;
    const tapBox = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      let { top, bottom, left, right } = r;
      if (getComputedStyle(el).position !== "static") {
        for (const pseudo of ["::before", "::after"]) {
          const ps = getComputedStyle(el, pseudo);
          if (ps.content === "none" || ps.position !== "absolute") continue;
          const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
          top = Math.min(top, r.top + px(ps.top));
          left = Math.min(left, r.left + px(ps.left));
          bottom = Math.max(bottom, r.bottom - px(ps.bottom));
          right = Math.max(right, r.right - px(ps.right));
        }
      }
      return { w: right - left, h: bottom - top };
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(SEL)) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 1 || r.height <= 1) continue;
      if (el.closest("[aria-hidden=true], [inert]")) continue; // not reachable by anyone
      if (el.closest("p, li > span")) continue; // a link in a sentence
      const target = el.matches("input[type=checkbox], input[type=radio]") ? (el.closest("label") ?? el) : el;
      const { w, h } = tapBox(target as HTMLElement);
      if (w < MIN || h < MIN) {
        const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.tagName).trim().split("\n")[0].slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    return out;
  });
}

const SCREENS = [
  "/",
  "/plan",
  "/calendar",
  "/tasks",
  "/milestones",
  "/goals",
  "/habits",
  "/work",
  "/jarvis",
  "/jarvis/says",
  "/jarvis/profile",
  "/money",
  "/finances/accounts",
  "/finances/transactions",
  "/finances/bills",
  "/school",
  "/school?view=upcoming",
  "/notes",
  "/settings",
  "/settings/data",
];

test("393px: every control on onboarding and the main screens is at least 44x44", async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const check = async (where: string) => {
    for (const p of await smallTargets(page)) problems.push(`${where}: ${p}`);
  };

  // Onboarding, every step.
  const email = await signUp(page, "Tara Target", { onboarding: "stay" });
  await check("welcome/skyling");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Tara");
  await fillBirthday(page, "2004-03-15");
  await page.getByRole("radio", { name: /Both/ }).click();
  await check("welcome/about");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await check("welcome/connect");
  await page.getByRole("button", { name: "I'll connect later" }).click();
  await check("welcome/learn");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // The main screens, with real content (goals with "What if I added", a job, subscriptions).
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], {
    env: { ...process.env, DATABASE_URL: "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
  });
  for (const path of SCREENS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await check(path);
  }
  // The filters on Activity, opened.
  await page.goto("/finances/transactions");
  await page.getByText("Filters").click();
  await check("/finances/transactions (filters open)");

  console.log(problems.length ? `SMALL TARGETS:\n${problems.join("\n")}` : "ALL TARGETS 44x44");
  expect(problems).toEqual([]);
});

for (const size of [
  { width: 375, height: 667 },
  { width: 393, height: 852 },
]) {
  test(`${size.width}x${size.height}: the first chat's Allow button is fully visible above the composer`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUp(page, "Nia New", { ai: false });
    await page.goto("/jarvis");
    const allow = page.getByRole("region", { name: "Allow AI" }).getByRole("button", { name: "Allow" });
    await expect(allow).toBeVisible();
    await page.waitForTimeout(800); // entrance animation
    const hits = await allow.evaluate((b) => {
      // Its top, bottom, left and right edges (inside the pill's rounded ends) and its centre.
      const r = b.getBoundingClientRect();
      const [x, y, end] = [(r.left + r.right) / 2, (r.top + r.bottom) / 2, r.height / 2];
      const points = [
        [x, r.top + 2],
        [x, r.bottom - 2],
        [r.left + end, y],
        [r.right - end, y],
        [x, y],
      ];
      return points.map(([x, y]) => {
        const at = document.elementFromPoint(x, y);
        return !!at && (at === b || b.contains(at));
      });
    });
    expect(hits, "all of Allow is on top (not under the composer or tab bar)").toEqual([true, true, true, true, true]);
    await allow.click();
    await expect(page.getByRole("region", { name: "Allow AI" })).toHaveCount(0);
  });
}
