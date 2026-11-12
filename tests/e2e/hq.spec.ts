import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool, afterSignUp, skipSetup } from "./helpers";
import { PNG_BYTES } from "./hq-cards-helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

/** The owner: signed up, setup skipped, two-step sign-in marked on (like tests/e2e/admin.spec.ts). */
async function ownerPage(browser: Browser): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext();
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL(afterSignUp);
  // Sign-up takes only email and password; give the owner a name so greetings read "Good morning, Owner."
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await skipSetup(op);
  await op.waitForURL((u) => u.pathname === "/");
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

test("HQ is owner-only: signed out or signed in, everyone else gets a 404", async ({ page, request }) => {
  // Signed out: the same "not found" as everyone else (owner approved, card 50072c7a), so HQ doesn't show it exists.
  expect((await request.get("/admin/hq", { maxRedirects: 0 })).status()).toBe(404);

  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`rhea-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(afterSignUp);
  for (const path of [
    "/admin",
    "/admin/work",
    "/admin/people",
    "/admin/app",
    "/admin/hq",
    "/admin/hq/missions",
    "/admin/hq/developer",
    "/admin/hq/approvals",
    "/admin/hq/settings",
  ])
    expect((await page.goto(path))?.status(), path).toBe(404);
});

test("HQ: the office, work (missions, approvals, report) and keys work end to end", async ({ browser, request }) => {
  test.setTimeout(150_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_keys, hq_chats, hq_usage_samples, hq_briefs cascade");
  const op = await ownerPage(browser);

  // The office: seven employee rooms (links), the penthouse (not a link: it has the desk, the yes and Goodnight buttons), plain counts.
  expect((await op.goto("/admin"))?.status()).toBe(200);
  await expect(op.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Owner\.$/ })).toBeVisible();
  const rooms = op.locator("a.hq-room");
  await expect(rooms).toHaveCount(7);
  await expect(op.getByRole("link", { name: /^COO\s*,/ })).toBeVisible();
  await expect(op.getByTestId("hq-cmo")).toHaveText("CMO · Your partner · Coming soon");
  await expect(op.getByRole("button", { name: "Goodnight" })).toBeVisible();
  await expect(op.getByRole("link", { name: "Nothing needs your yes" })).toBeVisible();
  // The penthouse: the floor label and the CEO's business card (exact words, no address or phone).
  await expect(op.getByText("Penthouse", { exact: true })).toBeVisible();
  const ceoCard = op.getByRole("img", { name: /^Business card: I'm CEO, Bitch\. Ali Moslli/ });
  await expect(ceoCard).toBeVisible();
  await expect(ceoCard.getByText("I'm CEO, Bitch.", { exact: true })).toBeVisible();
  await expect(ceoCard.getByText("Ali Moslli", { exact: true })).toBeVisible();
  await expect(ceoCard.getByText("lifeflowweb.com", { exact: true })).toBeVisible();
  await expect(op.getByText("I'M THE CEO, BITCH")).toHaveCount(0);
  await expect(op.getByRole("link", { name: /^Engineering\s*,\s*[\w ]+\s*:\s*\S/ })).toBeVisible();
  await expect(op.getByTestId("hq-waiting")).toContainText("Nothing needs you right now.");

  // Office <-> Workspace.
  await op.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(op).toHaveURL(/view=workspace/);
  await expect(op.locator("a.hq-room")).toHaveCount(0);
  await expect(op.getByRole("heading", { name: "Research & Insights", level: 2 })).toBeVisible();
  await op.getByRole("link", { name: "Office", exact: true }).first().click();
  await expect(op.locator("a.hq-room")).toHaveCount(7);

  // A mission for Engineering: it shows on their page, moves to doing, then done with a result.
  await op.goto("/admin/work");
  await op.getByLabel("Who is it for").selectOption("developer");
  await op.getByLabel("Title").fill("Fix the calendar sync");
  await op.getByLabel("Details (optional)").fill("The Outlook events arrive an hour late.");
  await op.getByRole("button", { name: "New mission" }).click();
  await expect(op.getByText("Mission added.")).toBeVisible();
  await op.goto("/admin/hq/developer");
  await expect(op.getByRole("heading", { name: "Engineering", level: 1 })).toBeVisible();
  await op
    .getByRole("link", { name: /Fix the calendar sync/ })
    .first()
    .click();
  await expect(op.getByRole("heading", { name: "Fix the calendar sync", level: 1 })).toBeVisible();
  await op.getByLabel("Status", { exact: true }).selectOption("doing");
  await op.getByRole("button", { name: "Save status" }).click();
  await expect(op.getByText("Status updated.")).toBeVisible();
  await expect(op.getByText("Doing · Engineering")).toBeVisible();
  await op.getByLabel("Status", { exact: true }).selectOption("done");
  await op.getByLabel("Result (when done)").fill("Events now arrive on time.");
  await op.getByRole("button", { name: "Save status" }).click();
  await expect(op.getByText("Done · Engineering")).toBeVisible();
  await expect(op.getByText("Events now arrive on time.").first()).toBeVisible();

  // Settings: create a key, see the token once, then it is gone.
  await op.goto("/admin/hq/settings");
  await op.getByLabel("Key name").fill("e2e rounds");
  await op.getByRole("button", { name: "Create key" }).click();
  await expect(op.getByText("Key created.")).toBeVisible();
  const token = (await op.getByTestId("hq-new-key").textContent())?.trim() ?? "";
  expect(token).toMatch(/^lfq_/);
  expect(op.url()).not.toContain(token);
  await expect(op.getByTestId("hq-new-key"))
    .toHaveCount(0, { timeout: 15_000 })
    .catch(() => undefined);
  await op.goto("/admin/hq/settings");
  await expect(op.getByTestId("hq-new-key")).toHaveCount(0);
  await expect(op.getByText("e2e rounds").first()).toBeVisible();

  // An agent uploads a picture and files an approval with the key; it appears on the desk and the owner says yes.
  const up = await request.post("/api/hq/files", { headers: { Authorization: `Bearer ${token}`, "content-type": "image/png" }, data: PNG_BYTES });
  expect(up.status()).toBe(200);
  const picture = (await up.json()) as { id: string };
  const posted = await request.post("/api/hq/report", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: "approval",
      role: "developer",
      kind: "deploy",
      title: "Ship the calendar fix",
      why: "Tests pass. Ready to go live.",
      changes: ["Calendar duplicates stop"],
      onYes: "Tonight Engineering goes live; tomorrow you see it in the app.",
      onNo: "Nothing changes.",
      effort: "small",
      risk: "Low: one screen.",
      recommendation: "Yes.",
      previews: [{ fileId: picture.id, label: "Calendar" }],
    },
  });
  expect(posted.status()).toBe(200);
  await op.goto("/admin/work");
  const card = op.locator("article", { hasText: "Ship the calendar fix" });
  await expect(card).toContainText("Go live");
  await expect(card.getByRole("img", { name: /Calendar/ })).toBeVisible();
  await expect(card.getByText(/acts on it at their next round/)).toBeVisible();
  await card.getByRole("textbox").fill("Go ahead");
  await card.getByRole("button", { name: "Yes, go" }).click();
  await expect(op.getByText("You said yes.")).toBeVisible();
  // The Office no longer asks for it; Engineering's page shows the yes in its activity.
  await op.goto("/admin");
  await expect(op.getByTestId("hq-waiting")).not.toContainText("Ship the calendar fix");
  await op.goto("/admin/hq/developer");
  await expect(op.getByText(/You said yes/).first()).toBeVisible();

  // Reports: headline lines from the records.
  await op.goto("/admin/work");
  await expect(op.getByRole("heading", { name: "The headline" })).toBeVisible();
  await expect(op.locator("section", { hasText: "The headline" }).locator("li").first()).toBeVisible();
  await expect(op.getByRole("heading", { name: "Weekly Claude use" })).toBeVisible();
  await expect(op.getByText("Not measured yet").first()).toBeVisible();

  // The COO's brief shows on the Office; the decisions it made, on the COO's page (the Office stays short).
  await op.goto("/admin");
  await expect(op.getByTestId("hq-brief").getByText("Your COO's first brief arrives after the next round.")).toBeVisible();
  await expect(op.getByText("Connect its chat in Settings")).toBeVisible();
  await expect(op.getByTestId("hq-waiting")).toContainText("Nothing needs you right now.");
  await op.goto("/admin/hq/assistant");
  await expect(op.getByText("Nothing decided for you yet.")).toBeVisible();
  const brief = await request.post("/api/hq/report", {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: "brief", body: "Good round: 2 fixes shipped, nothing blocked.\nNeeds you: nothing today.", needsYou: 0 },
  });
  expect(brief.status()).toBe(200);
  const decision = await request.post("/api/hq/report", {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: "activity", role: "assistant", kind: "decision", text: "Put the calendar fix first, because it blocks sync." },
  });
  expect(decision.status()).toBe(200);
  await op.goto("/admin");
  await expect(op.getByTestId("hq-brief-body")).toContainText("Good round: 2 fixes shipped, nothing blocked.");
  // Nothing is pending (the earlier card got its yes): the brief says so, and the link is the quiet one.
  await expect(op.getByTestId("hq-brief").getByRole("link", { name: "Nothing needs you" })).toBeVisible();
  await expect(op.getByTestId("hq-brief").getByRole("link", { name: /^Open the .*decision/ })).toHaveCount(0);
  // A real pending decision: the brief's link changes to "Open the decision" and opens the card on Work.
  const pending = await request.post("/api/hq/report", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: "approval",
      role: "developer",
      kind: "deploy",
      title: "Ship the reminders fix",
      why: "Tests pass. Ready to go live.",
      changes: ["Reminders stop repeating"],
      onYes: "Tonight Engineering goes live.",
      onNo: "Nothing changes.",
      effort: "small",
      risk: "Low: one screen.",
      recommendation: "Yes.",
      previews: [{ fileId: picture.id, label: "Reminders" }],
    },
  });
  expect(pending.status()).toBe(200);
  await op.goto("/admin");
  const decisionLink = op.getByTestId("hq-brief").getByRole("link", { name: /^Open the .*decision/ });
  await expect(decisionLink).toBeVisible();
  await expect(op.getByTestId("hq-brief").getByRole("link", { name: "Nothing needs you" })).toHaveCount(0);
  await decisionLink.click();
  await expect(op).toHaveURL(/\/admin\/work#approvals$/);
  await expect(op.locator("article", { hasText: "Ship the reminders fix" })).toBeVisible();
  await op.goto("/admin/hq/assistant");
  await expect(op.getByRole("heading", { name: "Decided for you" })).toBeVisible();
  await expect(op.getByText("Put the calendar fix first, because it blocks sync.").first()).toBeVisible();
  await expect(op.getByRole("heading", { name: "COO", level: 1 })).toBeVisible();
  await expect(op.getByText("Good round: 2 fixes shipped, nothing blocked.").first()).toBeVisible();
  await op.goto("/admin/hq/qa");
  await expect(op.getByText("Works inside the COO's rounds.", { exact: false }).first()).toBeVisible();

  // A wrong key is refused.
  expect((await request.post("/api/hq/report", { headers: { Authorization: "Bearer lfq_nope" }, data: { type: "activity" } })).status()).toBe(401);

  // The old Founder Office URL lands on Work, with its three parts.
  await op.goto("/admin/hq/founder");
  await expect(op).toHaveURL(/\/admin\/work$/);
  await expect(op.getByRole("heading", { name: "Your desk", level: 1 })).toBeVisible();
  for (const name of ["Needs your yes", "Missions", "This week"]) await expect(op.getByRole("heading", { name, level: 2 })).toBeVisible();
});
