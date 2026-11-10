import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pool } from "./helpers";
import { insertCard } from "./hq-cards-helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const ADMIN_EMAIL = "admin-owner@example.com";

async function owner(page: Page) {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  await page.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/welcome");
  // Sign-up takes only email and password; give the owner a name so greetings read "Good morning, Owner."
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test("HQ on a phone: no sideways scroll, big room targets, no serious accessibility problems", async ({ page }) => {
  test.setTimeout(120_000);
  await owner(page);
  // Long, real-shaped content (the owner's own items once overflowed the missions strip on a phone).
  await pool.query("truncate hq_activity, hq_approvals, hq_missions, hq_chats cascade");
  const long = "Ship the calendar duplicate fixes and search-as-you-type to main after the full check, build and e2e";
  await pool.query(
    `insert into hq_missions (role, title, priority, status, source) values
       ('developer', $1, 'high', 'todo', 'owner'),
       ('developer', 'Finish the "Same bill?" and "Did the exam move?" cards', 'high', 'doing', 'owner'),
       ('marketing', 'Retake the reel narration with the Sienna voice', 'normal', 'blocked', 'owner')`,
    [long],
  );
  await pool.query("update hq_missions set blocked_reason = 'Out of Higgsfield credits (0.37 left on 2026-11-06). Needs 3 or more.' where status = 'blocked'");
  await insertCard({ title: long });
  await pool.query(
    `insert into hq_chats (id, role, title, is_primary, status, needs_action, last_checkin_at) values
       ('session_01Mhcz6Ao4XdmNh3eAPYd3QN', 'designer', 'LF V3', true, 'blocked', 'Reply yes to commit the unfinished work and push fix-gmail-items and fix-search', now())`,
  );
  const paths = ["/admin", "/admin?view=workspace", "/admin/work", "/admin/hq/settings", "/admin/hq/developer", "/admin/hq/assistant", "/admin/hq/qa"];
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

  await page.goto("/admin");
  // The penthouse (not a link: desk, yes and Goodnight buttons) and the seven employee rooms.
  const rooms = page.locator(".hq-room:not(.hq-room-lounge)");
  await expect(rooms).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    const box = await rooms.nth(i).boundingBox();
    expect(box?.height ?? 0, `room ${i}`).toBeGreaterThanOrEqual(44);
  }
  // The building on a phone is a slim tower: the penthouse, then one room a floor, each the full width, top to bottom.
  const boxes = await Promise.all([0, 1, 2, 3, 4].map(async (i) => (await rooms.nth(i).boundingBox())!));
  const founder = boxes[0];
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i].width - founder.width), `room ${i} width`).toBeLessThan(2);
    expect(boxes[i].y, `room ${i} below room ${i - 1}`).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
  }
  for (const label of ["Penthouse", "Floor 7", "Floor 6", "Floor 5", "Floor 4", "Floor 3", "Floor 2", "Floor 1", "Lobby"])
    await expect(page.locator(".hq-slab:visible", { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  // The roof carries the sign.
  await expect(page.locator(".hq-roof-sign")).toHaveText("LifeFlow HQ");
  // The business card stays inside the penthouse on a phone.
  const card = await page.getByRole("img", { name: /^Business card/ }).boundingBox();
  expect(card!.x + card!.width).toBeLessThanOrEqual(founder!.x + founder!.width + 4);

  // Bigger text still fits.
  await page.evaluate(() => (document.documentElement.style.fontSize = "125%"));
  expect(await noSideScroll(page)).toBe(true);
});
