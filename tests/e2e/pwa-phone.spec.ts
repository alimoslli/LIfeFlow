import { expect, test, type Page } from "@playwright/test";
import { queryAsUser, signUp, openQuickAdd } from "./helpers";

/** Waits until the service worker controls the page (it claims open pages when it activates). */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration("/"))?.active, null, { timeout: 20_000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
}

test("manifest: id, colors, shortcuts with icons, and screenshots that exist", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ id: "/", start_url: "/", display: "standalone", theme_color: "#285b45", background_color: "#f9f7f0" });
  expect(m.shortcuts.map((s: { name: string; url: string }) => [s.name, s.url])).toEqual([
    ["Ask Jarvis", "/jarvis"],
    ["Add to-do", "/tasks?add=todo"],
    ["Log spending", "/money?add=spending"],
  ]);
  expect(m.screenshots.map((s: { form_factor: string }) => s.form_factor).sort()).toEqual(["narrow", "narrow", "wide"]);
  const files = [...m.icons, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons), ...m.screenshots].map((i: { src: string }) => i.src);
  for (const src of files) expect((await request.get(src)).status(), src).toBe(200);

  // The home-screen shortcut opens the right sheet.
  await signUp(page, "Sam Shortcut");
  await page.goto("/tasks?add=todo");
  await expect(page.getByRole("dialog", { name: "Quick add" }).getByLabel("What do you need to do?")).toBeVisible();
});

test("offline: cached pages still open, changes save on the phone and sync when back online", async ({ page, context }) => {
  const email = await signUp(page, "Olive Offline");
  await page.goto("/tasks");
  await waitForServiceWorker(page);

  // Add a to-do online, then open the pages that are kept for offline reading.
  await openQuickAdd(page);
  await page.getByRole("dialog", { name: "Quick add" }).getByLabel("What do you need to do?").fill("Read chapter 4");
  await page.getByRole("dialog", { name: "Quick add" }).getByRole("button", { name: "Add to-do" }).click();
  await expect(page.getByRole("link", { name: /Read chapter 4/ })).toBeVisible();
  for (const path of ["/money", "/", "/tasks"]) await page.goto(path);

  await context.setOffline(true);
  await page.goto("/tasks");
  await expect(page.getByRole("link", { name: /Read chapter 4/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();

  // Tick it and add another, both offline.
  await page.getByRole("checkbox", { name: /Read chapter 4/ }).click();
  await expect(page.getByRole("checkbox", { name: /Read chapter 4/ })).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "Saved on this phone" }).first()).toBeVisible();
  await openQuickAdd(page);
  await page.getByRole("dialog", { name: "Quick add" }).getByLabel("What do you need to do?").fill("Buy milk");
  await page.getByRole("dialog", { name: "Quick add" }).getByRole("button", { name: "Add to-do" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 waiting" })).toBeVisible();

  // A page that was never opened shows the offline page instead of an error.
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

  // Nothing reached the server yet.
  expect(await queryAsUser(email, "select title from tasks where title = 'Buy milk'")).toHaveLength(0);

  await context.setOffline(false);
  await page.goto("/tasks");
  await expect(page.getByRole("status").filter({ hasText: "Synced 2 changes" })).toBeVisible();
  await expect
    .poll(async () =>
      (await queryAsUser<{ title: string; status: string }>(email, "select title, status from tasks order by title")).map((t) => `${t.title}:${t.status}`),
    )
    .toEqual(["Buy milk:todo", "Read chapter 4:done"]);
  await expect(page.getByRole("link", { name: /Buy milk/ })).toBeVisible();
});

test("install prompt with iPhone steps, and notification settings", async ({ page }) => {
  await signUp(page, "Ines Install");
  await page.evaluate(() => {
    localStorage.setItem("lf-install-test", "1");
    localStorage.setItem("lf-visits", "1");
  });
  await page.goto("/");
  await expect(page.getByText("Add LifeFlow to your home screen")).toBeVisible();
  await page.getByRole("button", { name: "Show me how" }).click();
  const steps = page.getByRole("dialog", { name: "Add to Home Screen" });
  await expect(steps).toContainText("Add to Home Screen");
  await expect(steps).toContainText("iOS 16.4");
  await steps.getByRole("button", { name: /close/i }).click();
  // Jarvis cards on Today have their own "Not now"; this is the install banner's.
  await page.getByRole("button", { name: "Not now" }).and(page.locator(":not([data-testid=jarvis-message] *)")).click();
  await page.reload();
  await expect(page.getByText("Add LifeFlow to your home screen")).toHaveCount(0);

  // Settings: in Safari on iPhone (not installed) it explains how to get notifications; preferences save.
  await page.goto("/settings/notifications");
  await expect(page.getByTestId("push-state")).toBeVisible();
  await page.getByRole("checkbox", { name: /To-do reminders/ }).uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notification settings saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /To-do reminders/ })).not.toBeChecked();
});
