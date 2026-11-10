import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { pool } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts
const SHOTS = process.env.HQ_SHOTS_DIR;
const DESK_CHAT = "session_01LiveDeskTwilioAbcdef";

/** The owner, signed in with two-step marked on (like tests/e2e/hq-desk.spec.ts). */
async function ownerPage(browser: Browser, opts: BrowserContextOptions = {}): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext(opts);
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  await ctx.route("https://claude.ai/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Claude Code</title><p>Claude Code</p>" }));
  return op;
}

test("Live HQ: Right now shows who is working on what, the room and the desk say it, and the page updates by itself", async ({ browser }) => {
  test.setTimeout(120_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_settings cascade");
  // A desk task whose own chat (no department of its own) is busy right now, as its hooks would report it.
  await pool.query(
    `insert into hq_missions (role, title, priority, status, source, desk_prompt, session_id, started_at)
     values ('developer', 'Finish Twilio', 'high', 'doing', 'owner', 'Check the SMS path.', $1, now())`,
    [DESK_CHAT],
  );
  await pool.query(
    `insert into hq_chats (id, title, status, last_checkin_at, live_state, live_line, live_at)
     values ($1, 'Untitled chat', 'unknown', now(), 'busy', 'Run the SMS tests', now() - interval '2 minutes')`,
    [DESK_CHAT],
  );
  const op = await ownerPage(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  await op.goto("/admin");

  const now = op.getByTestId("hq-right-now");
  await expect(now).toContainText("1 chat working");
  await expect(now).toContainText("Engineering · Finish Twilio");
  await expect(now).toContainText("Run the SMS tests · 2 min ago");
  await expect(now.getByRole("link", { name: "Watch Engineering in Claude" })).toHaveAttribute("href", `https://claude.ai/code/${DESK_CHAT}`);
  // The room says it too.
  await expect(op.locator('.hq-room[data-role="developer"]')).toContainText("Finish Twilio: Run the SMS tests");
  await expect(op.locator('.hq-room[data-role="developer"]')).toHaveAttribute("data-state", "working");
  if (SHOTS) await op.screenshot({ path: `${SHOTS}/live-web.png` });

  // The chat moves on; the page shows it within one refresh, with no reload.
  await pool.query("update hq_chats set live_line = 'Editing sms.ts', live_at = now() where id = $1", [DESK_CHAT]);
  await expect(now).toContainText("Editing sms.ts · just now", { timeout: 25_000 });

  // The desk shows what its chat is doing.
  await op.getByTestId("hq-desk-open").click();
  await expect(op.getByRole("dialog", { name: "Your desk" }).getByRole("button", { name: /Finish Twilio/ })).toContainText("Editing sms.ts");
  await op.keyboard.press("Escape");

  // The end of its turn: nobody is working, and it says when the next round starts.
  await pool.query("update hq_chats set live_state = 'idle', live_at = now() where id = $1", [DESK_CHAT]);
  await expect(now).toContainText(/Nobody's working right now\. Next: .+ at \d{1,2}:\d{2} [AP]M\./, { timeout: 25_000 });
});

test("Live HQ on a phone: Right now fits, with no sideways scroll and a 44 px Watch button", async ({ browser }) => {
  test.setTimeout(90_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_settings cascade");
  await pool.query(
    `insert into hq_chats (id, role, title, is_primary, status, last_checkin_at, live_state, live_line, live_at)
     values ('session_01LiveMainChatAbcdefg', 'developer', 'LF Main', true, 'working', now(), 'busy', 'Run the full browser test suite on phone and web', now())`,
  );
  // From the hourly sync of Claude's own chat list: a chat waiting on the owner, and one working ("checked … ago").
  await pool.query(
    `insert into hq_chats (id, title, status, last_checkin_at, needs_action) values
       ('session_01LiveWaitingChatAbcdef', 'Marketing LF', 'blocked', now() - interval '5 minutes', 'Top up credits (3 or more) so the take can be generated')`,
  );
  await pool.query(
    `insert into hq_chats (id, title, status, last_checkin_at, live_state, live_line, live_at) values
       ('session_01LiveRelayedChatAbcdef', 'LF V3', 'working', now(), 'relayed', 'Drawing the timeline', now() - interval '12 minutes')`,
  );
  const op = await ownerPage(browser, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 3 : 1 });
  await op.goto("/admin");
  const now = op.getByTestId("hq-right-now");
  const waiting = op.getByTestId("hq-waiting");
  await expect(waiting).toContainText("Needs you");
  await expect(waiting).toContainText("Marketing LF");
  await expect(waiting).toContainText("Top up credits (3 or more) so the take can be generated");
  await expect(waiting.getByRole("link", { name: "Open Marketing LF in Claude" })).toHaveAttribute(
    "href",
    "https://claude.ai/code/session_01LiveWaitingChatAbcdef",
  );
  expect((await waiting.getByRole("link", { name: /Open/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(now).toContainText("Drawing the timeline · checked 12 min ago");
  await expect(now).toContainText("Engineering");
  await expect(now).toContainText("Run the full browser test suite on phone and web");
  const watch = (await now.getByRole("link", { name: /Watch/ }).first().boundingBox())!;
  expect(watch.height).toBeGreaterThanOrEqual(44);
  expect(await op.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (SHOTS) await now.screenshot({ path: `${SHOTS}/live-phone.png` });
});
