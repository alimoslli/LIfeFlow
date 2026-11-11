import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool } from "./helpers";
import { insertCard } from "./hq-cards-helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

async function ownerPage(browser: Browser, phone = false): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } : {});
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  // Sign-up takes only email and password; give the owner a name so greetings read "Good morning, Owner."
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}${u.hash}`;
};

test("One admin area: five places and a gear, old URLs land on their new page, a decision works on Work", async ({ browser }) => {
  test.setTimeout(150_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_briefs cascade");
  const id = await insertCard({ role: "developer", kind: "deploy", title: "Ship the one-place admin" });
  const op = await ownerPage(browser);

  // The menu: exactly five links, the settings gear beside it, no group labels.
  await op.goto("/admin");
  const nav = op.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link")).toHaveText([/^Office/, /^Work/, /^Marketing/, /^People/, /^App/]);
  await expect(op.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "/admin/hq/settings");

  // The Office: the brief area and "The app today".
  await expect(op.getByTestId("hq-brief")).toBeVisible();
  await expect(op.getByRole("heading", { name: "The app today" })).toBeVisible();
  await expect(op.getByRole("link", { name: /^Users/ })).toHaveAttribute("href", "/admin/people");
  for (const label of ["Active today", "New today", "Errors (24 h)", "Open feedback"]) await expect(op.getByText(label, { exact: true })).toBeVisible();

  // Old URLs land on their new page, query string kept.
  const moves: [string, string][] = [
    ["/admin/hq", "/admin"],
    ["/admin/hq?view=workspace", "/admin?view=workspace"],
    ["/admin/hq/approvals", "/admin/work"],
    ["/admin/hq/missions", "/admin/work"],
    ["/admin/hq/reports", "/admin/work"],
    ["/admin/hq/founder", "/admin/work"],
    ["/admin/users?q=olu", "/admin/people?q=olu"],
    ["/admin/feedback?status=handled&kind=bug", "/admin/people?fstatus=handled&fkind=bug"],
    ["/admin/announcements", "/admin/people"],
    ["/admin/growth", "/admin/app"],
    ["/admin/errors", "/admin/app"],
    ["/admin/health", "/admin/app"],
    ["/admin/activity", "/admin/app"],
  ];
  for (const [from, to] of moves) {
    await op.goto(from);
    const got = here(op).replace(/#.*$/, "");
    expect(got, from).toBe(to);
  }
  await op.goto("/admin/hq/approvals");
  expect(new URL(op.url()).hash).toBe("#approvals");

  // Work: three sections in order; a card is reachable by its id and a decision works.
  await op.goto(`/admin/work#${id}`);
  await expect(op.getByRole("heading", { name: "Your desk", level: 1 })).toBeVisible();
  await expect(op.getByRole("heading", { level: 2 })).toHaveText(["Needs your yes", "Missions", "This week"]);
  const card = op.locator(`article[id="${id}"]`);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Yes, go" }).click();
  await expect(op.getByText("You said yes.")).toBeVisible();

  // People and App hold their sections; the gear opens settings and is the active place.
  await op.goto("/admin/people");
  await expect(op.getByRole("heading", { level: 2 })).toHaveText(["Waitlist", "Accounts", "Feedback", "Announcements"]);

  // "Active today" opens People with only the accounts seen in the last 24 hours (the owner is signed in, so listed); "Show everyone" clears it.
  const away = `away-${Date.now()}@example.com`;
  await pool.query(
    `with u as (insert into users (email, password_hash, name, timezone) values ($1, 'x', 'Away Person', 'America/Chicago') returning id)
     insert into sessions (id, user_id, expires_at, last_seen_at) select 'e2e-away-' || id, id, now() + interval '20 days', now() - interval '3 days' from u`,
    [away],
  );
  await op.goto("/admin");
  await op.getByRole("link", { name: /^Active today/ }).click();
  await expect(op).toHaveURL(/\/admin\/people\?seen=today#people$/);
  await expect(op.getByLabel("Last seen")).toHaveValue("today");
  await expect(op.getByText(/seen in the last 24 hours$/)).toBeVisible();
  // The accounts list (the waitlist above it lists everyone waiting, whatever the filter).
  const accounts = op.getByRole("region", { name: "Accounts" });
  await expect(accounts.getByText(ADMIN_EMAIL, { exact: true })).toBeVisible();
  await expect(accounts.getByText(away, { exact: true })).toHaveCount(0);
  await accounts.getByRole("link", { name: "Show everyone" }).click();
  await expect(op.getByLabel("Last seen")).toHaveValue("");
  await expect(accounts.getByText(away, { exact: true })).toBeVisible();
  await pool.query("delete from users where email = $1", [away]);
  await op.goto("/admin/users?seen=today");
  expect(here(op).replace(/#.*$/, "")).toBe("/admin/people?seen=today");
  await op.goto("/admin/app");
  await expect(op.getByRole("heading", { name: "Growth", level: 2 })).toBeVisible();
  for (const name of ["Errors", "Health", "Activity log"]) await expect(op.getByRole("heading", { name, level: 2 })).toBeVisible();
  await op.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(op).toHaveURL(/\/admin\/hq\/settings$/);
  await expect(op.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
});

test("One admin area on a phone: no sideways scroll, 44 px targets, no serious accessibility problems", async ({ browser }) => {
  test.setTimeout(150_000);
  const op = await ownerPage(browser, true);
  const problems: string[] = [];
  for (const path of ["/admin", "/admin/work", "/admin/hq/marketing", "/admin/people", "/admin/app"]) {
    await op.goto(path);
    await op.waitForLoadState("networkidle");
    expect(await noSideScroll(op), `${path} scrolls sideways`).toBe(true);
    const links = op.getByRole("navigation", { name: "Admin" }).getByRole("link");
    await expect(links).toHaveCount(5); // the five places; the gear sits beside the masthead
    const gear = op.getByRole("link", { name: "Settings", exact: true });
    const targets = [...(await links.all()), gear];
    for (let i = 0; i < 6; i++) {
      const box = await targets[i].boundingBox();
      expect(box?.height ?? 0, `${path} menu item ${i}`).toBeGreaterThanOrEqual(43.5);
      expect(box?.width ?? 0, `${path} menu item ${i}`).toBeGreaterThanOrEqual(43.5);
    }
    const r = await new AxeBuilder({ page: op }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
      problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
