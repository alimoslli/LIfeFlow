import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

/** The owner: signed up, setup skipped, two-step sign-in marked on (like tests/e2e/hq.spec.ts). */
async function ownerPage(browser: Browser): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext();
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
  return op;
}

test("Marketing is owner-only: everyone else gets a 404", async ({ page }) => {
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Regular Rhea");
  await page.getByLabel("Email").fill(`rhea-mk-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/welcome");
  expect((await page.goto("/admin/hq/marketing"))?.status()).toBe(404);
  expect((await page.goto("/admin/hq/marketing/00000000-0000-0000-0000-000000000000"))?.status()).toBe(404);
});

test("Marketing: empty states, an agent's concept, the owner's yes, and the controls", async ({ browser, request }) => {
  test.setTimeout(150_000);
  await pool.query("truncate hq_content, hq_metrics, hq_approvals, hq_activity, hq_keys, hq_settings cascade");
  const op = await ownerPage(browser);

  // Empty: plain lines, and every network says there are no numbers yet.
  expect((await op.goto("/admin/hq/marketing"))?.status()).toBe(200);
  await expect(op.getByRole("heading", { name: "Marketing", level: 1 })).toBeVisible();
  await expect(op.getByText("HQ never posts. Approved posts go to Metricool for your final tap.")).toBeVisible();
  await expect(op.getByText("No drafts yet. The marketing round adds them on Wednesdays.")).toBeVisible();
  await expect(op.getByText("No numbers yet", { exact: true })).toHaveCount(5);
  await expect(op.getByText("Comes with the weekly marketing round, once it is connected in Metricool", { exact: true }).first()).toBeVisible();
  await expect(op.getByText(/Comments and messages: not connected yet/)).toBeVisible();

  // A key, then the agent posts a concept that asks, plus real numbers.
  await op.goto("/admin/hq/settings");
  await op.getByLabel("Key name").fill("e2e marketing");
  await op.getByRole("button", { name: "Create key" }).click();
  const token = (await op.getByTestId("hq-new-key").textContent())?.trim() ?? "";
  expect(token).toMatch(/^lfq_/);
  const headers = { Authorization: `Bearer ${token}` };
  const when = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const posted = await request.post("/api/hq/report", {
    headers,
    data: {
      type: "content",
      kind: "concept",
      title: "The Sunday reset reel",
      hook: "Your week, planned in one minute",
      body: "Scene 1: a messy desk.\nScene 2: the assistant sorts the week.",
      platforms: ["instagram", "tiktok"],
      scheduledFor: when,
      status: "draft",
      ask: true,
    },
  });
  expect(posted.status(), await posted.text()).toBe(200);
  const today = new Date().toISOString().slice(0, 10);
  const m = await request.post("/api/hq/report", {
    headers,
    data: { type: "metrics", rows: [{ takenOn: today, network: "instagram", metric: "followers", value: 1234 }] },
  });
  expect(m.status(), await m.text()).toBe(200);

  await op.goto("/admin/hq/marketing");
  const waiting = op.locator("section", { has: op.getByRole("heading", { name: "Waiting for you", level: 2 }) });
  const card = waiting.locator("article", { hasText: "The Sunday reset reel" });
  await expect(card.getByText("Your week, planned in one minute")).toBeVisible();
  await expect(card.getByText("Instagram, TikTok")).toBeVisible();
  await card.getByText("Read the script").click();
  await expect(card.getByText("Scene 2: the assistant sorts the week.")).toBeVisible();
  await expect(card.getByText(/acts on it at their next round/)).toBeVisible();
  await expect(op.getByText("1 draft waiting for you")).toBeVisible();
  const perf = op.locator("section", { has: op.getByRole("heading", { name: "Performance", level: 2 }) });
  await expect(perf.getByText("1,234")).toBeVisible();
  await expect(perf.getByText("Followers")).toBeVisible();
  await expect(op.getByText("No numbers yet", { exact: true })).toHaveCount(4);

  // The Office counts it, then the owner says yes.
  await op.goto("/admin/hq");
  const tile = op.getByRole("link", { name: /Needs your yes/ }).first();
  await expect(tile).toContainText("1");
  await op.goto("/admin/hq/marketing");
  await op.locator("article", { hasText: "The Sunday reset reel" }).getByRole("button", { name: "Yes" }).click();
  await expect(op.getByText("You said yes.")).toBeVisible();
  await expect(op.getByText("No drafts yet. The marketing round adds them on Wednesdays.")).toBeVisible();
  const week = op.locator("section", { has: op.getByRole("heading", { name: "This week", level: 2 }) });
  await expect(week.getByText("Approved", { exact: true })).toBeVisible();
  await op.goto("/admin/hq");
  await expect(op.getByRole("link", { name: /Needs your yes/ }).first()).toContainText("0");

  // The detail page: change the title, then drop it.
  await op.goto("/admin/hq/marketing");
  await week.getByRole("link", { name: /The Sunday reset reel/ }).click();
  await expect(op.getByRole("heading", { name: "The Sunday reset reel", level: 1 })).toBeVisible();
  await op.getByLabel("Title").fill("The Sunday reset reel, take two");
  await op.getByRole("button", { name: "Save", exact: true }).click();
  await expect(op.getByText("Saved.")).toBeVisible();
  await expect(op.getByRole("heading", { name: "The Sunday reset reel, take two", level: 1 })).toBeVisible();
  await op.getByRole("button", { name: "Drop it" }).click();
  await expect(op.getByText("Dropped.")).toBeVisible();
  await expect(op.getByText("Dropped", { exact: true }).first()).toBeVisible();

  // Reports carry a marketing section.
  await op.goto("/admin/hq/reports");
  await expect(op.getByRole("heading", { name: "Marketing this week", level: 2 })).toBeVisible();

  // The controls: Autonomous mode off shows on the Office and in the inbox the rounds read.
  await op.goto("/admin/hq/settings");
  await expect(op.getByRole("heading", { name: "How the team runs" })).toBeVisible();
  await op.getByRole("switch", { name: "Autonomous mode" }).uncheck();
  await op.getByLabel(/Higgsfield credits/).fill("25");
  await op.getByRole("button", { name: "Save", exact: true }).click();
  await expect(op.getByText("Saved", { exact: true })).toBeVisible();
  await expect(op.getByText(/Last changed .* by admin-owner@example.com/)).toBeVisible();
  await expect(op.getByRole("switch", { name: "Autonomous mode" })).not.toBeChecked();
  await op.goto("/admin/hq");
  await expect(op.locator("header p", { hasText: "Autonomous mode off" })).toBeVisible();
  const inbox = await request.get("/api/hq/inbox", { headers });
  expect(inbox.status()).toBe(200);
  const body = await inbox.json();
  expect(body.controls.autonomous).toBe(false);
  expect(body.controls.creditBudget).toBe(25);

  // What the Chief of Staff can decide: turning posting times off saves, and the rounds see it.
  await op.goto("/admin/hq/settings");
  await expect(op.getByRole("heading", { name: "What your Chief of Staff can decide" })).toBeVisible();
  await expect(op.getByRole("heading", { name: "Never decided without you" })).toBeVisible();
  await expect(op.getByRole("switch", { name: "Posting times" })).toBeChecked();
  await op.getByRole("switch", { name: "Posting times" }).uncheck();
  await op.getByRole("button", { name: "Save choices" }).click();
  await expect(op.getByText("Saved", { exact: true })).toBeVisible();
  await expect(op.getByRole("switch", { name: "Posting times" })).not.toBeChecked();
  await expect(op.getByRole("switch", { name: "The order of fixes" })).toBeChecked();
  const again = await (await request.get("/api/hq/inbox", { headers })).json();
  expect(again.controls.delegations.postingTimes).toBe(false);
  expect(again.controls.delegations.fixOrder).toBe(true);
});
