import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

test("a new user meets the skylings, tells theirs about themselves, sees how to connect their sky, learns it by doing, then the tour", async ({ page }) => {
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

  // 2. About you: Nova says hi and gets to know them (sign-up took only email and password).
  await expect(page.getByRole("heading", { name: /^Hi/ })).toBeVisible();
  await expect(page.getByText("I'm Nova.", { exact: false })).toBeVisible();
  expect((await page.getByLabel("What should I call you?").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel("What should I call you?").fill("Maya");
  await expect(page.getByRole("heading", { name: "Hi Maya." })).toBeVisible();
  await expect(page.getByText("LifeFlow is free while we're testing.")).toBeVisible();
  const go = page.getByRole("button", { name: "Connect my sky" });
  await page.getByRole("radio", { name: /^Both/ }).click();
  await expect(go).toBeDisabled(); // the birthday is asked for, neutrally (the age rule is the server's)
  await expect(page.getByText("Private to your account.", { exact: true })).toBeVisible();
  await page.getByLabel("Your birthday").fill("2005-04-12");
  await page.getByLabel("Your school").fill("State University");
  await page.getByLabel("Where you work").fill("Target");
  await go.click();

  // 3. Connect your sky: their real sky, opened into the week, and one tap each for Canvas, Google and Outlook.
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-state", "timeline");
  // a student starts with Canvas, whose Calendar Feed link is pasted right here
  await page.getByRole("button", { name: "Connect Canvas" }).click();
  await expect(page.getByText("Tap Calendar Feed (bottom right) and copy the link.")).toBeVisible();
  await expect(page.getByLabel("Calendar Feed link")).toBeVisible();
  // Google and Outlook go out and come back to this step, or say plainly that they aren't available yet
  for (const name of ["Google Calendar", "Outlook and Teams"]) {
    const card = page.getByText(name, { exact: true });
    await expect(card).toBeVisible();
  }
  const google = page.getByRole("link", { name: "Connect Google Calendar" });
  if (await google.count()) await expect(google).toHaveAttribute("href", "/api/integrations/google/start?from=welcome");
  // Coming back from Google (its callback lands here): the same step, a plain line about what happened, and
  // everything chosen before is still there (the skyling, and where they work, which is saved when setup finishes).
  await page.goto("/welcome?connected=google&result=missing_scopes");
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  await expect(page.getByText("Google Calendar needs calendar access to fill your sky.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Where you work")).toHaveValue("Target");
  await expect(page.getByLabel("Your birthday")).toHaveValue("2005-04-12");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await page.getByRole("button", { name: "I'll connect later" }).click();

  // 4. Read your sky: folded back to the wheel, and opening it is ticked off when they do it.
  await expect(page.getByRole("heading", { name: "Read your sky" })).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByText("Open it (done)")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(page.getByText("Fold it back (done)")).toBeAttached();
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

  // Saved: their skyling, about them (birthday, school) and where they work.
  const [prefs] = await queryAsUser<{
    p: { lifeStage?: string; assistantName?: string; assistantStyle?: string; companion?: string; birthDate?: string; school?: string };
  }>(email, "select preferences as p from users where email = $1", [email]);
  expect(prefs.p).toMatchObject({
    lifeStage: "both",
    assistantName: "Nova",
    assistantStyle: "coach",
    companion: "ray",
    birthDate: "2005-04-12",
    school: "State University",
  });
  expect(await queryAsUser(email, "select name from employers")).toEqual([{ name: "Target" }]);
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
  await page.getByLabel("Your birthday").fill("2001-09-30");
  await page.getByRole("radio", { name: /^Work/ }).click();
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await page.getByRole("button", { name: "I'll connect later" }).click(); // connecting is optional
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

test("setup needs a birthday: Skip goes to About you first", async ({ page }) => {
  await signUp(page, "Lee Park", { onboarding: "stay" });
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page.getByRole("heading", { name: /^Hi/ })).toBeVisible();
  await expect(page.getByText("Add your birthday to finish setting up.")).toBeVisible();
  await page.getByLabel("What should I call you?").fill("Lee");
  await page.getByLabel("Your birthday").fill("2002-02-02");
  await page.getByRole("radio", { name: /^Neither/ }).click();
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("a finished account answering under 13 on Today is locked the same way (owner, 2026-11-10)", async ({ page }) => {
  const email = await signUp(page, "Rio Late");
  // an account from before the birthday was asked: Today asks once
  await pool.query(`update users set preferences = preferences - 'birthDate' where email = $1`, [email]);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Your birthday" });
  await card.getByLabel("Your birthday").fill(`${new Date().getFullYear() - 10}-04-04`);
  await card.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  // every page leads back to the lock, and nothing of theirs is kept
  await page.goto("/money");
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  const [row] = await queryAsUser<{ p: Record<string, unknown>; name: string }>(email, "select preferences as p, name from users where email = $1", [email]);
  expect(Object.keys(row.p).sort()).toEqual(["ageBlockedAt", "onboarding"]);
  expect(row.name).not.toBe("Rio Late");
});

test("under 13: one calm line, the welcome stays locked, and an older year later doesn't get through", async ({ page }) => {
  const email = await signUp(page, "Kai Young", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Kai");
  await page.getByLabel("Your birthday").fill(`${new Date().getFullYear() - 9}-03-03`);
  await page.getByRole("radio", { name: /^Classes/ }).click();
  await page.getByLabel("Your school").fill("Maple Elementary");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByLabel("Your birthday")).toHaveCount(0);
  // locked for the account: back to the app or the welcome, still the same line
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  // nothing else kept: no birthday, no school, the flag only
  const [row] = await queryAsUser<{ p: { ageBlockedAt?: string; birthDate?: string; school?: string } }>(
    email,
    "select preferences as p from users where email = $1",
    [email],
  );
  expect(row.p.ageBlockedAt).toBeTruthy();
  expect(row.p.birthDate).toBeUndefined();
  expect(row.p.school).toBeUndefined();
  expect(Object.keys(row.p).sort()).toEqual(["ageBlockedAt", "onboarding"]);
  // the lock is the session's, not just the page's: chat, connecting and sharing are refused, and the app sends it back
  const chat = await page.evaluate(
    async () => (await fetch("/api/jarvis/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status,
  );
  expect(chat).toBe(401);
  const start = await page.request.get("/api/integrations/google/start", { maxRedirects: 0 });
  expect(start.status()).toBe(401);
  const share = await page.request.post("/share-target", { multipart: { text: "hello" }, maxRedirects: 0 });
  expect(share.status()).toBe(303);
  expect(share.headers().location).toContain("/login");
  await page.goto("/settings");
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
});

test("an account made before birthdays were asked gets one small card on Today, once", async ({ page }) => {
  const email = await signUp(page, "Ola Old");
  await pool.query(`update users set preferences = preferences - 'birthDate' where email = $1`, [email]);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Your birthday" });
  await expect(card.getByText("When's your birthday?")).toBeVisible();
  await card.getByLabel("Your birthday").fill("1998-08-08");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toHaveCount(0);
  const [row] = await queryAsUser<{ p: { birthDate?: string } }>(email, "select preferences as p from users where email = $1", [email]);
  expect(row.p.birthDate).toBe("1998-08-08");
});
