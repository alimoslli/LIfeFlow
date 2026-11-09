import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

test("sign up, reach the day clock, and manage a task end to end", async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: /^Today\. Now / })).toBeVisible();

  await page.goto("/tasks");
  await page.getByLabel("To-do title").fill("Renew parking permit");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Added "Renew parking permit"' })).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew parking permit/ })).toBeVisible();

  // It's ticked off on To-dos (one tap from Today).
  await page.getByRole("checkbox", { name: 'Mark "Renew parking permit" done' }).click();
  await expect
    .poll(async () => (await queryAsUser<{ status: string }>(email, "select status from tasks where title = 'Renew parking permit'"))[0]?.status)
    .toBe("done");
  await page.goto("/tasks?view=done");
  await expect(page.getByRole("link", { name: /Renew parking permit/ })).toBeVisible();
});

test("a failed save keeps what was typed and explains the problem in plain words", async ({ page }) => {
  await signUp(page);
  await page.goto("/work");
  await page.getByLabel("Employer").fill("Campus Library");
  await page.getByLabel("Hourly rate ($)").fill("16.5");
  await page.getByRole("button", { name: "Save job" }).click();
  await page.getByText("Record a paycheck").click();

  // A net pay that can't be saved (negative) fails on the server.
  await page.getByLabel("Hours", { exact: true }).fill("12.5");
  await page.getByLabel("Net pay ($)").fill("-5");
  await page.getByLabel("Gross pay ($)").fill("200");
  await page.getByRole("button", { name: "Save paycheck" }).click();

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save paycheck" }) });
  await expect(form.getByRole("alert")).toContainText("Enter an amount of $0 or more");
  await expect(form.getByRole("alert")).not.toContainText(/netCents|expected/);
  await expect(page.getByLabel("Hours", { exact: true })).toHaveValue("12.5");
  await expect(page.getByLabel("Net pay ($)")).toHaveValue("-5");
  await expect(page.getByLabel("Gross pay ($)")).toHaveValue("200");

  // Fixing it and saving works as before, and the form clears.
  await page.getByLabel("Net pay ($)").fill("150");
  await page.getByRole("button", { name: "Save paycheck" }).click();
  // (the job's own "Saved." can still be showing, so look at the newest one)
  await expect(page.getByRole("status").filter({ hasText: "Saved." }).last()).toBeVisible();
  await expect(page.getByLabel("Net pay ($)")).toHaveValue("");
});

test("Jarvis saves assignments and tasks that then appear in School and Tasks", async ({ page }) => {
  await signUp(page, "Riley Park");
  // A course to attach work to.
  await page.goto("/school");
  await page.getByRole("button", { name: "Add course" }).first().click();
  await page.getByLabel("Course name").fill("Introduction to Psychology");
  await page.getByLabel("Code").fill("PSY 101");
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("link", { name: /Introduction to Psychology/ })).toBeVisible();

  await page.goto("/jarvis");
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  await askJarvis(
    page,
    `/tool import_assignments {"items":[{"title":"Chapter 4 quiz","courseName":"psy101","kind":"quiz","dueDate":"${due}","dueTime":"23:59"},{"title":"Essay","courseName":"Underwater Basket Weaving","dueDate":"${due}"}]}`,
  );
  // One final reply per turn; no tool chatter in the chat.
  await expect(page.getByText(/^Done:/)).toHaveCount(1);
  await expect(page.getByText("Saved 1 assignment · 1 need a course")).toHaveCount(0);
  await expect(page).toHaveURL(/\/jarvis\/[0-9a-f-]{36}$/);
  const conversationUrl = page.url();

  await askJarvis(page, `/tool create_tasks {"tasks":[{"title":"Study for PSY quiz","priority":"high","dueDate":"${due}","subtasks":["Re-read chapter 4"]}]}`);
  await expect(page.getByText(/Study for PSY quiz/).first()).toBeVisible();

  // The saved records are real and visible in their modules.
  await page.goto("/school/due");
  await expect(page.getByTestId("assignment-row").filter({ hasText: "Chapter 4 quiz" })).toBeVisible();
  await expect(page.getByText("Essay")).toHaveCount(0);
  await page.goto("/tasks");
  await expect(page.getByText("Study for PSY quiz")).toBeVisible();

  // The conversation persists across reloads.
  await page.goto(conversationUrl);
  await expect(page.getByText(/^Done:/).first()).toBeVisible();
  await expect(page.getByText("Chapter 4 quiz", { exact: false }).first()).toBeVisible();
});

test("destructive Jarvis actions wait for explicit confirmation", async ({ page }) => {
  const email = await signUp(page, "Casey Diaz");
  await page.goto("/tasks");
  await page.getByLabel("To-do title").fill("Old reminder");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: /Old reminder/ })).toBeVisible();
  const rows = await queryAsUser<{ id: string }>(email, "select id from tasks where title = 'Old reminder'");

  await page.goto("/jarvis");
  await askJarvis(page, `/tool delete_task {"id":"${rows[0].id}"}`);
  await expect(page.getByText('Delete task "Old reminder"?', { exact: true })).toBeVisible();
  // Not deleted yet.
  expect(await queryAsUser(email, "select id from tasks where id = $1", [rows[0].id])).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("✓ Done")).toBeVisible();
  expect(await queryAsUser(email, "select id from tasks where id = $1", [rows[0].id])).toHaveLength(0);
});

test("users cannot see each other's data", async ({ browser }) => {
  const a = await browser.newPage();
  await signUp(a, "Avery One");
  await a.goto("/tasks");
  await a.getByLabel("To-do title").fill("Avery's private task");
  await a.getByRole("button", { name: "Add", exact: true }).click();
  await expect(a.getByRole("link", { name: /Avery's private task/ })).toBeVisible();
  await a.goto("/jarvis");
  await askJarvis(a, "hello there");
  await expect(a).toHaveURL(/\/jarvis\/[0-9a-f-]{36}$/);
  const convUrl = a.url();

  const b = await browser.newPage();
  await signUp(b, "Blake Two");
  await b.goto("/tasks");
  await expect(b.getByText("Avery's private task")).toHaveCount(0);
  // The page streams, so the status is 200, but no data from the other account is rendered.
  await b.goto(convUrl);
  await expect(b.getByText("We couldn't find that page")).toBeVisible();
  await expect(b.getByText("hello there")).toHaveCount(0);
});

test("APIs reject unauthenticated and cross-site requests", async ({ request, page }) => {
  const anon = await request.post("/api/jarvis/chat", { data: { message: "hi" } });
  expect(anon.status()).toBe(401);
  await signUp(page, "Morgan Cross");
  const cross = await page.request.post("/api/jarvis/chat", { data: { message: "hi" }, headers: { origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);
  const exp = await page.request.get("/api/export");
  expect(exp.status()).toBe(200);
  expect(exp.headers()["content-disposition"]).toContain("lifeflow-export-");
  const body = await exp.json();
  expect(body.profile.name).toBe("Morgan Cross");
  expect(JSON.stringify(body)).not.toContain("encrypted_credentials");
});

test("Jarvis asks before anything goes to the AI, and works once allowed", async ({ page }) => {
  await signUp(page, "Kim Park", { ai: false });
  await page.goto("/jarvis");
  await expect(page.getByRole("region", { name: "Allow AI" })).toContainText("Before we start");
  await expect(page.getByLabel(COMPOSER)).toBeDisabled();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByLabel(COMPOSER)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Plan my day" })).toBeVisible();
});

test("testers can send feedback from Settings", async ({ page }) => {
  const email = await signUp(page, "Beta Tester");
  await page.goto("/settings");
  await page.getByRole("link", { name: "Send feedback" }).click();
  await page.getByText("An idea").click();
  await page.getByLabel("Your message").fill("Let me pick the color of each class.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks! We read every message.")).toBeVisible();
  expect(await queryAsUser(email, "select kind, message from feedback")).toEqual([{ kind: "idea", message: "Let me pick the color of each class." }]);
});

test("every calendar block opens its editor: change an event right from Plan", async ({ page }) => {
  await signUp(page, "Cal Editor");
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Event", exact: true }).click();
  const add = page.getByRole("dialog", { name: "New event" });
  await add.getByLabel("Title", { exact: true }).fill("Dentist");
  await add.getByLabel("Start", { exact: true }).fill("15:00");
  await add.getByLabel("End", { exact: true }).fill("16:00");
  await add.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/plan");
  await page.getByRole("button", { name: /Dentist/ }).click();
  const sheet = page.getByRole("dialog", { name: "Event" });
  await sheet.getByLabel("Title", { exact: true }).fill("Dentist checkup");
  await sheet.getByLabel("Place", { exact: true }).fill("Main St clinic");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Dentist checkup/ })).toBeVisible();
  await expect(page.getByText("Main St clinic")).toBeVisible();

  await page.getByRole("button", { name: /Dentist checkup/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("dialog", { name: "Event" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: /Dentist checkup/ })).toHaveCount(0);
});
