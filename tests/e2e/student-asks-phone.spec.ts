import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * What four made-up students ran into in a week (2026-11-16), on a phone (390 wide): School's pills over the page's words,
 * Bills saying $0 beside the charges it lists, Money telling two stories, Work's example job and its hidden next week.
 */

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
const seed = (email: string) =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "tests/e2e/seed-student-asks.ts", email], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
    stdio: "pipe",
  }).toString();

/** Runs in the page: the words of the page that sit under the section pills (they must not). */
async function underPills(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("nav[aria-label$='sections']");
    if (!nav) return { missing: true as const };
    const n = nav.getBoundingClientRect();
    const hits: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      if (nav.contains(el) || el.contains(nav)) continue;
      // the top bar is fixed: the page scrolling away under it is how any page works, not a clash
      if (el.closest(".lf-appbar") || getComputedStyle(el).position === "fixed") continue;
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? "").trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const x = Math.min(r.right, n.right) - Math.max(r.left, n.left);
      const y = Math.min(r.bottom, n.bottom) - Math.max(r.top, n.top);
      if (x > 1 && y > 1) hits.push((el.textContent ?? "").trim().slice(0, 40));
    }
    return { missing: false as const, sticky: getComputedStyle(nav).position, hits };
  });
}

test("School's pills never sit over the Due heading or a class's title while scrolling", async ({ page }) => {
  const email = await signUp(page, "Sam Park");
  seed(email);
  await page.setViewportSize({ width: 390, height: 664 });

  await page.goto("/school");
  await expect(page.getByRole("link", { name: "Notes" }).first()).toBeVisible();
  for (const y of [0, 120, 260, 420]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const r = await underPills(page);
    expect(r.missing).toBe(false);
    if (!r.missing) {
      expect(r.sticky).not.toBe("sticky");
      expect(r.hits, `words under the pills at scroll ${y}`).toEqual([]);
    }
  }

  await page
    .getByRole("link", { name: /BIO 105/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Human Anatomy" })).toBeVisible();
  for (const y of [0, 60, 160, 320]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const r = await underPills(page);
    if (!r.missing) expect(r.hits, `words under the pills at scroll ${y}`).toEqual([]);
  }
});

test("Bills leads with the charges found in the bank, and its total agrees with Money", async ({ page }) => {
  const email = await signUp(page, "Sam Park");
  seed(email);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/finances/bills");
  // 45 + 154 + 7.99 + 600 a month, all found in the bank and none tracked yet
  await expect(page.getByTestId("bills-monthly")).toHaveText("$806.99");
  await expect(page.getByText("Nothing yet")).toHaveCount(0);
  await expect(page.getByText("4 things you pay regularly")).toBeVisible();
  const found = page.getByRole("region", { name: "Found in your bank" });
  const coming = page.getByRole("region", { name: "Coming up" });
  await expect(found.getByText("Verizon")).toBeVisible();
  const [f, c] = [await found.boundingBox(), await coming.boundingBox()];
  expect(f!.y).toBeLessThan(c!.y); // the found charges lead
  await found.getByRole("button", { name: "Confirm" }).first().click();
  await expect(coming.getByRole("listitem")).toHaveCount(1);
  // confirming one moves it up without changing the total
  await expect(page.getByTestId("bills-monthly")).toHaveText("$806.99");

  await page.goto("/money");
  // the page streams in (a part waits hidden until it's swapped in), so read it again until the 30-day card is there
  const read = () =>
    page.evaluate(() => {
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      return document.body.innerText;
    });
  // Money's 30 days count the same four bills ($807 rounded), and say the same run-out date once as a heads-up and once in the card
  await expect.poll(read).toMatch(/Bills and usual spending come to \$807/);
  const money = await read();
  const heads = money.match(/run out of money around \w{3}, (\w{3} \d+)/);
  const card = money.match(/you run out around (\w{3} \d+)/);
  expect(heads?.[1]).toBeTruthy();
  expect(card?.[1]).toBe(heads?.[1]);
});

test("Work: no example job in the form, and the coming 7 days on the front", async ({ page }) => {
  const email = await signUp(page, "Sam Park");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/work");
  for (const label of ["Employer", "Position", "Hourly rate ($)"]) await expect(page.getByLabel(label)).not.toHaveAttribute("placeholder", /./);

  seed(email);
  await page.goto("/work");
  const coming = page.getByTestId("work-coming");
  await expect(coming.getByRole("heading", { name: "Next 7 days" })).toBeVisible();
  // shifts on days 1, 3 and 5, not the one 12 days out; night shifts show AM and PM
  await expect(coming.getByText("10:00 PM to 6:30 AM")).toHaveCount(3);
  await expect(coming.getByText("Tomorrow")).toBeVisible();
});
