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

test("HQ on a phone: no sideways scroll, big room targets, no serious accessibility problems", async ({ page }) => {
  test.setTimeout(120_000);
  await owner(page);
  // Long, real-shaped content (the owner's own items once overflowed the missions strip on a phone).
  await pool.query("truncate hq_activity, hq_approvals, hq_missions, hq_chats");
  const long = "Ship the calendar duplicate fixes and search-as-you-type to main after the full check, build and e2e";
  await pool.query(
    `insert into hq_missions (role, title, priority, status, source) values
       ('developer', $1, 'high', 'todo', 'owner'),
       ('developer', 'Finish the "Same bill?" and "Did the exam move?" cards', 'high', 'doing', 'owner'),
       ('marketing', 'Retake the reel narration with the Sienna voice', 'normal', 'blocked', 'owner')`,
    [long],
  );
  await pool.query("update hq_missions set blocked_reason = 'Out of Higgsfield credits (0.37 left on 2026-11-06). Needs 3 or more.' where status = 'blocked'");
  await pool.query(`insert into hq_approvals (role, kind, title, summary, source) values ('designer', 'design', $1, $1, 'owner')`, [long]);
  await pool.query(
    `insert into hq_chats (id, role, title, is_primary, status, needs_action, last_checkin_at) values
       ('session_01Mhcz6Ao4XdmNh3eAPYd3QN', 'designer', 'LF V3', true, 'blocked', 'Reply yes to commit the unfinished work and push fix-gmail-items and fix-search', now())`,
  );
  const paths = [
    "/admin/hq",
    "/admin/hq?view=workspace",
    "/admin/hq/missions",
    "/admin/hq/approvals",
    "/admin/hq/reports",
    "/admin/hq/settings",
    "/admin/hq/developer",
    "/admin/hq/founder",
  ];
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await noSideScroll(page), `${path} scrolls sideways`).toBe(true);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
      problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);

  await page.goto("/admin/hq");
  const rooms = page.locator("a.hq-room");
  await expect(rooms).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const box = await rooms.nth(i).boundingBox();
    expect(box?.height ?? 0, `room ${i}`).toBeGreaterThanOrEqual(44);
  }
  // Two columns under the founder's full-width office.
  const founder = await rooms.first().boundingBox();
  const second = await rooms.nth(1).boundingBox();
  const third = await rooms.nth(2).boundingBox();
  expect(founder!.width).toBeGreaterThan(second!.width * 1.8);
  expect(Math.abs(second!.y - third!.y)).toBeLessThan(2);

  // Bigger text still fits.
  await page.evaluate(() => (document.documentElement.style.fontSize = "125%"));
  expect(await noSideScroll(page)).toBe(true);
});
