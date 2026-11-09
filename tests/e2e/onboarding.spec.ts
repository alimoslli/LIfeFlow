import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test("a new user meets the skylings, builds their real sky, learns it by doing, then a skippable tour", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  // 1. The skylings come first (research 2026-11-09): picking one brings its name and its tone; a name of their own wins
  // and keeps the look and tone. Each step says what it changes.
  await expect(page.getByRole("heading", { name: "Meet the skylings" })).toBeVisible();
  await expect(page.getByText("Changes who sits on top of your sky")).toBeVisible();
  expect((await page.getByLabel("Skyling's name").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("radio", { name: /^Ray/ }).click();
  await expect(page.getByLabel("Skyling's name")).toHaveValue("Ray");
  await expect(page.getByText("Talks like a coach.", { exact: false })).toBeVisible();
  await page.getByLabel("Skyling's name").fill("Nova");
  await expect(page.getByText("Nova:", { exact: false })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Ray/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Nova says hi and asks two things (sign-up took only email and password).
  await expect(page.getByRole("heading", { name: /^Hi/ })).toBeVisible();
  await expect(page.getByText("I'm Nova.", { exact: false })).toBeVisible();
  expect((await page.getByLabel("What should I call you?").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel("What should I call you?").fill("Maya");
  await expect(page.getByRole("heading", { name: "Hi Maya." })).toBeVisible();
  await expect(page.getByText("LifeFlow is free while we're testing.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Build my sky" })).toBeDisabled();
  await page.getByRole("radio", { name: /^Both/ }).click();
  await page.getByRole("button", { name: "Build my sky" }).click();

  // 3. Build your sky: their real sky opens into the week, and each thing they add is saved and lands on it.
  await expect(page.getByRole("heading", { name: "Build your sky" })).toBeVisible();
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByRole("button", { name: "I'll add things later" })).toBeVisible();
  const today = await page.evaluate(() => new Date().getDay());
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][today];
  await page.getByLabel("Class name").fill("PSY 101");
  await page.getByRole("group", { name: "A class: days" }).getByRole("button", { name: weekday }).click();
  await page.getByLabel("A class: starts").fill("23:00");
  await page.getByLabel("A class: ends").fill("23:50");
  await page.getByRole("region", { name: "A class" }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "On your sky" })).toContainText("PSY 101");
  await page.getByLabel("Where you work").fill("Target");
  await page.getByRole("group", { name: "Your usual work hours: days" }).getByRole("button", { name: "Sat" }).click();
  await page.getByLabel("Your usual work hours: starts").fill("10:00");
  await page.getByLabel("Your usual work hours: ends").fill("16:00");
  await page.getByRole("region", { name: "Your usual work hours" }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "On your sky" })).toContainText("Target");
  await page.getByLabel("What's due").fill("Lab report");
  await page.getByRole("region", { name: "Something due soon" }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "On your sky" })).toContainText("Lab report");
  // the class is on the line already
  await expect(clock.getByText("PSY 101").first()).toBeAttached();
  await page.getByRole("button", { name: "That's my week" }).click();

  // 4. Read your sky: folded back to the wheel, and opening it is ticked off when they do it.
  await expect(page.getByRole("heading", { name: "Read your sky" })).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByText("Open it (done)")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(page.getByText("Fold it back (done)")).toBeAttached();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Connect, or straight to the sky.
  await expect(page.getByRole("heading", { name: "Let your sky fill itself" })).toBeVisible();
  await page.getByRole("button", { name: "Go to my sky" }).click();

  // Today, with the tour running.
  await page.waitForURL((u) => u.pathname === "/");
  const tour = page.getByRole("dialog", { name: "Welcome to LifeFlow" });
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your day as a wheel" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nova" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Nova" })).toHaveCount(0);

  // Saved for real: their skyling, what fills their week, the class (with its weekly meeting), the job (with shifts
  // filled ahead) and the due date.
  const [prefs] = await queryAsUser<{ p: { lifeStage?: string; assistantName?: string; assistantStyle?: string; companion?: string } }>(
    email,
    "select preferences as p from users where email = $1",
    [email],
  );
  expect(prefs.p).toMatchObject({ lifeStage: "both", assistantName: "Nova", assistantStyle: "coach", companion: "ray" });
  expect(await queryAsUser(email, "select name from courses")).toEqual([{ name: "PSY 101" }]);
  expect(await queryAsUser(email, "select title, kind from calendar_events")).toEqual([{ title: "PSY 101", kind: "class" }]);
  expect(await queryAsUser(email, "select name from employers")).toEqual([{ name: "Target" }]);
  expect((await queryAsUser<{ n: number }>(email, "select count(*)::int as n from work_shifts"))[0].n).toBeGreaterThan(0);
  expect(await queryAsUser(email, "select title from tasks")).toEqual([{ title: "Lab report" }]);
  // The name typed in the welcome was saved (the test's sign-up had set "Maya Chen").
  expect(await queryAsUser(email, "select name from users where email = $1", [email])).toEqual([{ name: "Maya" }]);

  // The tour doesn't come back, and setup isn't shown again.
  await expect
    .poll(async () => (await queryAsUser<{ p: { tour?: string } }>(email, "select preferences as p from users where email = $1", [email]))[0]?.p.tour)
    .toBe("done");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/welcome");
  await page.waitForURL((u) => u.pathname === "/");
});

test("the opening splash shows once per session and never blocks the page", async ({ page }) => {
  await signUp(page, "Leo Park");
  await page.goto("/plan?splash=1");
  const splash = page.locator(".lf-splash-layer");
  await expect(splash).toBeVisible();
  await expect(splash).toBeHidden({ timeout: 9000 });
  // It leaves only once the page has really loaded: no loading placeholder behind it.
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Automation and reduced motion don't get it without the explicit flag.
  await page.goto("/plan");
  await expect(splash).toBeHidden();
});

test("reduced motion: never a splash, even when requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login?splash=1");
  await expect(page.locator(".lf-splash-layer")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the app follows what fills your week: tabs and pills adapt", async ({ page }) => {
  await signUp(page, "Sam Ortiz", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click(); // picking a skyling is optional
  await page.getByLabel("What should I call you?").fill("Sam");
  await page.getByRole("radio", { name: /^Work/ }).click();
  await page.getByRole("button", { name: "Build my sky" }).click();
  await page.getByRole("button", { name: "I'll add things later" }).click(); // adding is optional
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Skip tour" }).click();

  const tab = (name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).filter({ visible: true });
  const pill = (name: string) => page.getByRole("navigation", { name: "Today sections" }).getByRole("link", { name });
  const setWeek = async (choice: string) => {
    await page.goto("/settings/profile");
    await page.getByLabel("What fills your week").selectOption({ label: choice });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.goto("/plan");
  };

  await page.goto("/plan");
  await expect(tab("School")).toHaveCount(0);
  await expect(pill("Work")).toBeVisible();

  await setWeek("Classes");
  await expect(tab("School")).not.toHaveCount(0);
  await expect(pill("Work")).toHaveCount(0);

  await setWeek("Neither");
  await expect(tab("School")).toHaveCount(0);
  await expect(pill("Work")).toHaveCount(0);
  await expect(tab("Money")).not.toHaveCount(0);
});
