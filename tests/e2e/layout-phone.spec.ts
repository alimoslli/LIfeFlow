import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const SHOTS = process.env.SHOTS;

// Each tab's landing page and every page that must be one more tap from it.
const TABS: [string, string, string[]][] = [
  // Today is the day clock and the timeline, which hold calendar, to-dos, goals and milestones; Health and Work are doors in
  // the "More" sheet with everything else (owner 2026-11-10: Today is one screen, nothing under it to scroll to).
  ["Today", "/", []],
  // Money: three plain rows (Activity, Bills and subscriptions, Accounts and savings); investments live under Accounts.
  ["Money", "/money", ["/finances/accounts", "/finances/transactions", "/finances/bills"]],
  // Due is a side of School now ("Classes | Due" on the page, owner's page map 2026-11-10)
  ["School", "/school", ["/notes"]],
];

test("393px: 2 taps, no duplicates, nothing clipped or covered", async ({ page }) => {
  test.setTimeout(240_000);
  const email = await signUp(page, "Vera Verify");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], {
    env: { ...process.env, DATABASE_URL: "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
  });
  const problems: string[] = [];

  // The dock: Today, the skyling's own tab (owner, 2026-11-10: "a small icon of him on all other pages"), Money, School and
  // More, short labels, nothing truncated; no Settings tab, and no second message bar on the dock anywhere.
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" }).last().getByRole("link");
  expect(await tabs.allInnerTexts()).toEqual(["Today", "Ray", "Money", "School"]);
  await expect(page.getByRole("navigation", { name: "Main" }).last().getByRole("button", { name: "More" })).toBeVisible();
  await expect(page.getByTestId("skyling-bar")).toHaveCount(0);
  for (const t of await tabs.all()) {
    const cut = await t.evaluate((el) => [...el.querySelectorAll("span.truncate")].some((s) => s.scrollWidth > s.clientWidth + 1));
    if (cut) problems.push(`tab label clipped: ${await t.innerText()}`);
  }

  const pages: string[] = [];
  for (const [label, landing, more] of TABS) {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: label }).click(); // tap 1
    await expect(page).toHaveURL(new RegExp(`${landing === "/" ? "/$" : landing.replace(/\//g, "\\/")}`));
    await page.waitForLoadState("networkidle");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tab-${label}.png` });
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    for (const m of more) if (!hrefs.includes(m)) problems.push(`${m} not reachable from ${label} in one tap`);
    // Gear on every tab.
    if (!(await page.getByRole("link", { name: "Settings" }).first().isVisible())) problems.push(`no gear on ${label}`);
    pages.push(landing, ...more);
  }

  // On the other pages the skyling is its tab: one tap to the one chat.
  await page.goto("/money");
  // no sun in the top corner: Today is in the dock, and a logo up there only looked like a button (owner, 2026-11-11)
  await expect(page.locator("header.lf-appbar a[href='/']")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: "Ray" })).toHaveAttribute("href", "/jarvis");
  await expect(page.getByTestId("skyling-bar")).toHaveCount(0);
  // More: everything else as doors, each one tap away, with a line about how it stands.
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("button", { name: "More" }).click();
  const everything = page.getByRole("dialog", { name: "Everything else" });
  await expect(everything).toBeVisible();
  // its doors can stream in just after the sheet opens: read them once the first is there (a full run once read none)
  await expect(everything.locator('a[href="/plan"]')).toBeVisible();
  const doors = await everything.locator("a[href]").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  for (const m of ["/plan", "/tasks", "/goals", "/habits", "/work", "/jarvis/says", "/jarvis/profile", "/settings"])
    if (!doors.includes(m)) problems.push(`${m} not a door in More`);
  await everything.getByRole("link", { name: /To-dos/ }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(everything).toBeHidden();
  pages.push("/jarvis", "/jarvis/says", "/jarvis/profile", "/plan", "/tasks", "/goals");

  // Settings: the gear (tap 1), then its tabs (tap 2): Assistant (what Jarvis remembers), Integrations (Apple Health), etc.
  // The gear brings Settings up from below, over the page you were on (owner, 2026-11-10); its doors are one tap away.
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Settings" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(sheet.getByRole("link", { name: /Notifications/ })).toBeVisible();
  const settingsLinks = await sheet.locator("a[href]").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  for (const m of [
    "/settings/profile",
    "/settings/jarvis",
    "/jarvis/memory",
    "/settings/integrations",
    "/settings/notifications",
    "/settings/security",
    "/settings/data",
  ])
    if (!settingsLinks.includes(m)) problems.push(`${m} not reachable from the gear in one tap`);
  pages.push("/settings", "/settings/jarvis", "/jarvis/memory", "/settings/integrations");

  // Each pill href belongs to one group only (no duplicated features in the sub-tabs).
  const pillOwners = new Map<string, string>();
  for (const [label, landing] of [["Today", "/plan"] as const, ...TABS.slice(1)]) {
    await page.goto(landing);
    for (const href of await page.locator('nav[aria-label$="sections"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))
      if (pillOwners.has(href) && pillOwners.get(href) !== label) problems.push(`pill ${href} in ${pillOwners.get(href)} and ${label}`);
      else pillOwners.set(href, label);
  }

  // Every page: no sideways overflow, pills not clipped, tab bar and Jarvis button don't cover the last content.
  for (const path of [...new Set(pages)]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await page.evaluate(async () => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("horizontal overflow");
      for (const pill of document.querySelectorAll<HTMLElement>('nav[aria-label$="sections"] a, nav[aria-label$="sections"] button'))
        if (pill.scrollWidth > pill.clientWidth + 1 || pill.scrollHeight > pill.clientHeight + 1) out.push(`pill clipped: ${pill.textContent}`);
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((res) => setTimeout(res, 300));
      const bar = document.querySelector<HTMLElement>(".lf-tabbar")!.getBoundingClientRect();
      const fab = document.querySelector<HTMLElement>(".lf-fab")?.getBoundingClientRect();
      const main = document.querySelector("main")!;
      // The part of each element actually on screen (clipped by scrolling/overflow containers).
      const visible = (e: HTMLElement) => {
        let r = e.getBoundingClientRect();
        let top = r.top,
          bottom = r.bottom,
          left = r.left,
          right = r.right;
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
            r = a.getBoundingClientRect();
            top = Math.max(top, r.top);
            bottom = Math.min(bottom, r.bottom);
            left = Math.max(left, r.left);
            right = Math.min(right, r.right);
          }
        }
        return { top, bottom, left, right };
      };
      const leaves = [...main.querySelectorAll<HTMLElement>("a, button, p, h1, h2, h3, li, input, img, svg, code")]
        .filter(
          (e) =>
            getComputedStyle(e).visibility !== "hidden" &&
            !e.closest("[class*='fixed']") &&
            !e.closest("dialog, [aria-hidden=true], .lf-sectionnav, header") &&
            !(e.closest("details:not([open])") && !e.closest("summary")),
        )
        .map((e) => ({ e, b: visible(e) }))
        .filter(({ b }) => b.bottom - b.top > 0 && b.right - b.left > 0);
      const lastBottom = Math.max(...leaves.map(({ b }) => b.bottom));
      if (lastBottom > bar.top + 1) out.push(`content under tab bar (${Math.round(lastBottom)} > ${Math.round(bar.top)})`);
      if (fab && lastBottom > fab.top + 1) {
        const under = leaves.filter(({ b }) => b.bottom > fab.top && b.top < fab.bottom && b.right > fab.left && b.left < fab.right);
        if (under.length) out.push(`Assistant button covers: ${under[0].e.tagName} ${under[0].e.textContent?.slice(0, 40)}`);
      }
      return out;
    });
    for (const x of r) problems.push(`${path}: ${x}`);
  }
  // Jarvis page: floating button hidden there (the page is Jarvis), capture works.
  await page.goto("/jarvis");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("dialog", { name: "Quick add" })).toBeVisible();

  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "ALL CHECKS PASSED");
  expect(problems).toEqual([]);
});
