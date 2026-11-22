import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

// The ADHD helps (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md): Start it, Sit with me and the check-in.
test("Start it: a first step, five minutes with the skyling, keep going, and finishing ticks it off", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date() });
  const email = await signUp(page, "Robin Park");
  await queryAsUser(
    email,
    "insert into tasks (user_id, title, due_at) values (current_setting('app.user_id')::uuid, 'Reflection essay', now() + interval '3 hours')",
  );
  await page.goto("/");
  // Today's note names it, with its own Start it button beside it (never inside the note's link)
  const startIt = page.getByTestId("start-it").filter({ visible: true });
  await expect(startIt).toBeVisible();
  await page.screenshot({ path: "test-results/adhd-today-start-it-phone.png" });
  await startIt.click();
  await page.waitForURL((u) => u.pathname === "/focus");
  await expect(page.getByTestId("focus-title")).toHaveText("Reflection essay");
  await expect(page.getByTestId("focus-step")).toHaveText("Open a doc and type the title.");
  await page.screenshot({ path: "test-results/adhd-focus-ready-phone.png" });

  await page.getByTestId("focus-start").click();
  await expect(page.getByTestId("focus-clock")).toHaveText(/^[45]:\d\d$/);
  await page.screenshot({ path: "test-results/adhd-focus-running-phone.png" });
  // a reload keeps the session (the person's own device)
  await page.reload();
  await expect(page.getByTestId("focus-clock")).toBeVisible();

  await page.clock.fastForward("05:01");
  await expect(page.getByTestId("focus-timeup")).toHaveText("5 minutes done. You started.");
  await page.screenshot({ path: "test-results/adhd-focus-timeup-phone.png" });
  await page.getByTestId("focus-keep").click();
  // no set end: it counts up from 0:00
  await expect(page.getByTestId("focus-clock")).toHaveText(/^0:0\d$/);

  // well past the plan, one calm line
  await page.clock.fastForward("45:00");
  await expect(page.getByTestId("focus-check")).toContainText("A short break?");

  await page.getByTestId("focus-done").click();
  await expect(page.getByTestId("focus-finished")).toHaveText("Done. That counts.");
  await expect.poll(async () => (await queryAsUser<{ status: string }>(email, "select status from tasks"))[0]?.status).toBe("done");
});

test("a class or shift alone has no Start it; the focus screen only opens work you do", async ({ page }) => {
  const email = await signUp(page, "Sam Lee");
  await queryAsUser(
    email,
    "insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (current_setting('app.user_id')::uuid, 'Bio 101', 'class', now() + interval '2 hours', now() + interval '3 hours')",
  );
  await page.goto("/");
  await expect(page.getByTestId("assistant-line").filter({ visible: true })).toContainText("Bio 101");
  await expect(page.getByTestId("start-it")).toHaveCount(0);
  await page.goto("/focus?item=shift%3A3f8c1b8e-6a39-4d43-9c7e-5b1f2a7d9e01");
  await page.waitForURL((u) => u.pathname === "/");
});
