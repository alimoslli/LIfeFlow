import { expect, test } from "@playwright/test";
import { askJarvis, queryAsUser, signUp } from "./helpers";

test("sign up, reach Home, and manage a task end to end", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("A clear day.")).toBeVisible();

  await page.goto("/tasks");
  await page.getByLabel("Task title").fill("Renew parking permit");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Renew parking permit")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("region", { name: "On your list" }).getByText("Renew parking permit")).toBeVisible();
  await page.getByRole("checkbox", { name: /Complete Renew parking permit/ }).click();
  await page.goto("/tasks?view=done");
  await expect(page.getByText("Renew parking permit")).toBeVisible();
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
  await expect(page.getByText("Saved 1 assignment · 1 need a course")).toBeVisible();
  await expect(page).toHaveURL(/\/jarvis\/[0-9a-f-]{36}$/);
  const conversationUrl = page.url();

  await askJarvis(page, `/tool create_tasks {"tasks":[{"title":"Study for PSY quiz","priority":"high","dueDate":"${due}","subtasks":["Re-read chapter 4"]}]}`);
  await expect(page.getByText("Created 1 task")).toBeVisible();

  // The saved records are real and visible in their modules.
  await page.goto("/school");
  await expect(page.getByTestId("assignment-row").filter({ hasText: "Chapter 4 quiz" })).toBeVisible();
  await expect(page.getByText("Essay")).toHaveCount(0);
  await page.goto("/tasks");
  await expect(page.getByText("Study for PSY quiz")).toBeVisible();

  // The conversation persists across reloads.
  await page.goto(conversationUrl);
  await expect(page.getByText("Saved 1 assignment · 1 need a course")).toBeVisible();
  await expect(page.getByText("Created 1 task")).toBeVisible();
});

test("destructive Jarvis actions wait for explicit confirmation", async ({ page }) => {
  const email = await signUp(page, "Casey Diaz");
  await page.goto("/tasks");
  await page.getByLabel("Task title").fill("Old reminder");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Old reminder")).toBeVisible();
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
  await a.getByLabel("Task title").fill("Avery's private task");
  await a.getByRole("button", { name: "Add", exact: true }).click();
  await expect(a.getByText("Avery's private task")).toBeVisible();
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
  const body = await exp.json();
  expect(body.profile.name).toBe("Morgan Cross");
  expect(JSON.stringify(body)).not.toContain("encrypted_credentials");
});
