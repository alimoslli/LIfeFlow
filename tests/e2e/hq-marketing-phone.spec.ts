import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pool } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const ADMIN_EMAIL = "admin-owner@example.com";

async function owner(page: Page) {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  await page.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await page.getByLabel("Your name").fill("Owner Olu");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/welcome");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test("Marketing on a phone: long titles wrap, no sideways scroll, switches are big, axe is clean", async ({ page }) => {
  test.setTimeout(120_000);
  await owner(page);
  await pool.query("truncate hq_content, hq_metrics, hq_approvals, hq_activity, hq_settings cascade");
  const long = "Ship the Sunday reset reel with the long caption about planning your whole week, money and classes in one minute flat";
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const { rows } = await pool.query(
    `insert into hq_approvals (role, kind, title, summary, source) values ('marketing', 'publish', $1, $1, 'agent') returning id`,
    [long],
  );
  await pool.query(
    `insert into hq_content (kind, title, hook, body, platforms, status, scheduled_for, approval_id, links, source) values
       ('concept', $1, $1, $1, '["instagram","tiktok","youtube","facebook","linkedin"]', 'waiting', $2, $3, '[{"label":"Where it came from, a very long source name","url":"https://example.com/a/very/long/path/that/keeps/going/and/going/and/going"}]', 'agent'),
       ('post', $1, null, null, '["instagram"]', 'scheduled', $2, null, '[]', 'agent'),
       ('research', $1, $1, $1, '[]', 'draft', null, null, '[{"label":"Source","url":"https://example.com/x"}]', 'agent'),
       ('post', $1, null, null, '["tiktok"]', 'published', null, null, '[]', 'agent')`,
    [long, tomorrow, rows[0].id],
  );
  await pool.query("update hq_content set published_url = 'https://example.com/post/1' where status = 'published'");
  await pool.query(
    `insert into hq_metrics (taken_on, network, metric, value) values (current_date, 'instagram', 'followers', 1234), (current_date - 7, 'instagram', 'followers', 1200)`,
  );

  const problems: string[] = [];
  for (const path of ["/admin/hq/marketing", "/admin/hq/settings", "/admin/work"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await noSideScroll(page), `${path} scrolls sideways`).toBe(true);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
      problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);

  // Items open a detail page that also fits.
  await page.goto("/admin/hq/marketing");
  await page
    .locator("section", { has: page.getByRole("heading", { name: "This week", level: 2 }) })
    .getByRole("link")
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  expect(await noSideScroll(page), "detail scrolls sideways").toBe(true);

  // Switches and decision buttons are real, big targets.
  await page.goto("/admin/hq/settings");
  const switches = page.getByRole("switch");
  await expect(switches).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    const box = await switches.nth(i).boundingBox();
    expect(box?.height ?? 0, `switch ${i}`).toBeGreaterThanOrEqual(44);
  }
  await page.goto("/admin/hq/marketing");
  for (const name of ["Yes", "No", "Changes"]) {
    const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
});
