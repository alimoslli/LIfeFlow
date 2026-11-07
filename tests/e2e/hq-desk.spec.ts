import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { pool } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts
const SHOTS = process.env.HQ_SHOTS_DIR;

/** The owner, signed in with two-step marked on (like tests/e2e/hq.spec.ts). */
async function ownerPage(browser: Browser, opts: BrowserContextOptions = {}): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext(opts);
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Your name").fill("Owner Olu");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  // Claude Code is outside this test: answer its links with a plain page.
  await ctx.route("https://claude.ai/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Claude Code</title><p>Claude Code</p>" }));
  return op;
}

async function seed() {
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_settings cascade");
  const ids = await pool.query(
    `insert into hq_missions (role, title, priority, status, source, desk_prompt, session_id) values
       ('designer', 'Finish the V3 redesign revision', 'high', 'todo', 'agent', 'Finish it as pictures for my yes.', null),
       ('developer', 'Finish Twilio', 'high', 'doing', 'agent', 'Check the SMS path and fix it.', 'session_01DeskTwilioAbcdefgh'),
       ('developer', 'Not a desk file', 'normal', 'todo', 'agent', null, null)
     returning id, title`,
  );
  return Object.fromEntries(ids.rows.map((r: { id: string; title: string }) => [r.title, r.id])) as Record<string, string>;
}

test("The desk: the pile opens the files, a file plays the MacBook and lands in Claude Code with the first prompt", async ({ browser }) => {
  test.setTimeout(120_000);
  const ids = await seed();
  const op = await ownerPage(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  await op.goto("/admin");
  await expect(op.getByTestId("hq-desk-open")).toContainText("2");
  // One building like the concept: the COO shares the penthouse with you, then three rooms a floor, the lobby the full width.
  const rooms = op.locator(".hq-room");
  const [you, coo, eng, design, research] = await Promise.all([0, 1, 2, 3, 4].map(async (i) => (await rooms.nth(i).boundingBox())!));
  expect(Math.abs(you.y - coo.y)).toBeLessThan(2);
  expect(you.width).toBeGreaterThan(coo.width * 1.8);
  expect(eng.y).toBeGreaterThan(you.y + you.height - 1);
  expect(Math.abs(eng.y - design.y)).toBeLessThan(2);
  expect(Math.abs(design.y - research.y)).toBeLessThan(2);
  const lobby = (await op.locator(".hq-room-lounge").boundingBox())!;
  expect(lobby.width).toBeGreaterThan(you.width);
  if (SHOTS) await op.locator(".hq-tower").screenshot({ path: `${SHOTS}/office-web.png` });

  // The drawn pile is a button.
  await op.getByRole("button", { name: "Your desk: 2 task files" }).click();
  const sheet = op.getByRole("dialog", { name: "Your desk" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Finish the V3 redesign revision/ })).toContainText("Product & Design · Not started");
  await expect(sheet.getByRole("button", { name: /Finish Twilio/ })).toContainText("Engineering · In its chat");
  await expect(sheet.getByText("Not a desk file")).toHaveCount(0);
  const axe = await new AxeBuilder({ page: op }).include(".hq-desk-sheet").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  if (SHOTS) await op.screenshot({ path: `${SHOTS}/desk-web.png` });

  // A new task: the MacBook opens, then this tab goes to a new Claude Code chat with the prompt typed in.
  await sheet.getByRole("button", { name: /Finish the V3 redesign revision/ }).click();
  const mac = op.getByTestId("hq-macbook");
  await expect(mac).toBeVisible();
  await expect(mac).toContainText("Claude Code");
  await expect(mac).toContainText("Finish the V3 redesign revision");
  await expect(mac).toContainText("Opening your chat…");
  if (SHOTS) {
    await op.waitForTimeout(900);
    await op.screenshot({ path: `${SHOTS}/macbook-web.png` });
  }
  await op.waitForURL(/^https:\/\/claude\.ai\/code\/new\?q=/, { timeout: 5000 });
  const u = new URL(op.url());
  expect(u.searchParams.get("repo")).toBe("alimoslli/LIfeFlow");
  expect(u.searchParams.get("q")).toContain(`npx tsx scripts/hq.ts mission update ${ids["Finish the V3 redesign revision"]} --status doing`);
  expect(u.searchParams.get("q")).toContain("Finish it as pictures for my yes.");

  // A task with a chat: the next prompt is copied, then its own chat opens.
  await op.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3100" });
  await op.goto("/admin");
  await op.getByTestId("hq-desk-open").click();
  await op
    .getByRole("dialog", { name: "Your desk" })
    .getByRole("button", { name: /Finish Twilio/ })
    .click();
  await expect(op.getByTestId("hq-macbook")).toContainText("Prompt copied. Paste it and send.");
  const copied = await op.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`Back on "Finish Twilio"`);
  await op.waitForURL("https://claude.ai/code/session_01DeskTwilioAbcdefgh", { timeout: 5000 });
});

test("The desk with reduced motion goes straight to the chat; Add to my desk puts a file on it", async ({ browser }) => {
  test.setTimeout(90_000);
  await seed();
  const op = await ownerPage(browser, { reducedMotion: "reduce" });
  await op.goto("/admin");
  await op.getByTestId("hq-desk-open").click();
  const sheet = op.getByRole("dialog", { name: "Your desk" });
  await sheet.getByText("Add a file to your desk").click();
  await sheet.getByLabel("Task").fill("Make sure Plaid works end to end");
  await sheet.getByLabel("Who it's for").selectOption("developer");
  await sheet.getByLabel("First prompt for its chat").fill("Run the Plaid tests and fix what fails.");
  await sheet.getByRole("button", { name: "Put it on my desk" }).click();
  await expect(op.getByText("On your desk: Make sure Plaid works end to end")).toBeVisible();
  await expect(op.getByTestId("hq-desk-open")).toContainText("3");

  await op.getByTestId("hq-desk-open").click();
  await op
    .getByRole("dialog", { name: "Your desk" })
    .getByRole("button", { name: /Make sure Plaid works end to end/ })
    .click();
  await op.waitForURL(/^https:\/\/claude\.ai\/code\/new\?q=/, { timeout: 3000 });
  expect(new URL(op.url()).searchParams.get("q")).toContain("Run the Plaid tests and fix what fails.");
});

test("Goodnight dims the office and starts nothing; Lights on ends it; the CMO seat says Coming soon", async ({ browser }) => {
  test.setTimeout(90_000);
  await seed();
  const op = await ownerPage(browser, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 3 : 1 });
  await op.goto("/admin");
  await expect(op.getByTestId("hq-cmo")).toHaveText("CMO · Your partner · Coming soon");
  // Every room is asleep with when it wakes; nothing says Blocked or Needs you.
  await expect(op.locator(".hq-room .hq-chip", { hasText: "Blocked" })).toHaveCount(0);
  await expect(op.getByRole("link", { name: /^Quality & Security\s*,\s*Asleep\s*:\s*Wakes \w{3} \d{1,2}:07 [AP]M, night round/ })).toBeVisible();
  if (SHOTS) await op.locator(".hq-tower").screenshot({ path: `${SHOTS}/office-phone.png` });
  const missionsBefore = (await pool.query("select count(*)::int as n from hq_missions")).rows[0].n;

  await op.getByRole("button", { name: "Goodnight" }).click();
  await expect(op.getByText(/^Goodnight\. The office is dimmed until 5 AM/)).toBeVisible();
  await expect(op.locator(".hq-tower")).toHaveAttribute("data-night", "on");
  expect((await pool.query("select count(*)::int as n from hq_missions")).rows[0].n).toBe(missionsBefore);
  expect((await pool.query("select goodnight_at from hq_settings")).rows[0].goodnight_at).not.toBeNull();
  if (SHOTS) await op.locator(".hq-tower").screenshot({ path: `${SHOTS}/goodnight-phone.png` });

  await op.getByRole("button", { name: "Lights on" }).click();
  await expect(op.getByRole("status").getByText("Lights on.")).toBeVisible();
  await expect(op.locator(".hq-tower")).not.toHaveAttribute("data-night", "on");
  expect(await op.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
