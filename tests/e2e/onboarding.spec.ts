import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp, fillBirthday, setupAbout, setupFinish, setupSkyling, shown } from "./helpers";

test("a new user sets up on Today on a laptop, comes back from Google with what happened, finishes with no tour, and can replay it", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  const clock = page.getByTestId("day-clock");
  await expect(clock).toBeVisible();
  // 1. the skyling, named
  await setupSkyling(page, { skyling: "Ray", name: "Nova" });
  // 2. about them
  await setupAbout(page, { name: "Maya", birthday: "2005-04-12", week: "Both" });
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  // 3. the first connection: every way is listed, and Google leaves from the fixed start address
  await shown(page, "Pick the first one").click();
  const ways = page.getByRole("dialog", { name: "Your first connection" });
  for (const way of ["photo", "canvas", "google", "outlook", "bank"]) await expect(ways.locator(`[data-way=${way}]`)).toBeVisible();
  const google = ways.getByRole("link", { name: "Connect Google" });
  if (await google.count()) await expect(google).toHaveAttribute("href", "/api/integrations/google/start?from=welcome");
  // Coming back from Google (its callback lands on /welcome, which sends on to Today): the same step, a plain line about
  // what happened, and everything chosen before is still there.
  await page.goto("/welcome?connected=google&result=missing_scopes");
  await page.waitForURL((u) => u.pathname === "/" && u.searchParams.get("result") === "missing_scopes");
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  await expect(page.getByTestId("setup-note-wide").getByText("Google needs calendar access to fill your sky.", { exact: false })).toBeVisible();
  // finishing needs one real thing on the sky (owner, 2026-11-12), so the account gets a class; then the week lands and it ends
  await setupFinish(page, email);

  // Today, and no tour after setup (owner's program, item 7: setup taught what the tour did).
  const tour = page.getByRole("dialog", { name: "Welcome to LifeFlow" });
  await expect(clock).toBeVisible();
  await expect(tour).toHaveCount(0);
  // Settings can still replay it.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Replay the tour" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your day as a wheel" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nova" })).toBeVisible();
  // the tour's card sits over Today's bar, so the idea clouds step away while it runs, and come back after
  const clouds = page.getByRole("list", { name: "Ideas to try" }).getByRole("button");
  await expect(clouds.first()).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Nova" })).toHaveCount(0);
  await expect(clouds.first()).toBeVisible();

  // Saved: their skyling and about them. No school or workplace is typed in setup (owner, 2026-11-11).
  const [prefs] = await queryAsUser<{
    p: { lifeStage?: string; assistantName?: string; assistantStyle?: string; companion?: string; birthDate?: string; school?: string };
  }>(email, "select preferences as p from users where email = $1", [email]);
  expect(prefs.p).toMatchObject({ lifeStage: "both", assistantName: "Nova", assistantStyle: "coach", companion: "ray", birthDate: "2005-04-12" });
  expect(prefs.p.school).toBeUndefined();
  expect(await queryAsUser(email, "select name from employers")).toEqual([]);
  // The name typed in setup was saved (the test's sign-up had set "Maya Chen").
  expect(await queryAsUser(email, "select name from users where email = $1", [email])).toEqual([{ name: "Maya" }]);

  // The tour doesn't come back, setup isn't shown again, and /welcome only sends a finished account to Today.
  await expect
    .poll(async () => (await queryAsUser<{ p: { tour?: string } }>(email, "select preferences as p from users where email = $1", [email]))[0]?.p.tour)
    .toBe("done");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/welcome");
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator(".dc-today[data-setup]")).toHaveCount(0);
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
  const email = await signUp(page, "Sam Ortiz", { onboarding: "stay" });
  await setupSkyling(page); // picking a skyling can wait
  await setupAbout(page, { name: "Sam", birthday: "2001-09-30", week: "Work" });
  await setupFinish(page, email); // finishing needs one real thing on the sky

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

test("a finished account answering under 13 on Today is locked the same way (owner, 2026-11-10)", async ({ page }) => {
  const email = await signUp(page, "Rio Late");
  // an account from before the birthday was asked: Today asks once
  await pool.query(`update users set preferences = preferences - 'birthDate' where email = $1`, [email]);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Your birthday" });
  // a valid date turns Save on once the card is live: wait for React to have taken over the field (a busy machine can
  // show the page well before that, and a date typed earlier is lost), then type it once
  const field = card.getByLabel("Birthday month");
  await expect.poll(() => field.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { timeout: 60_000 }).toBe(true);
  const answer = async (day: string) => {
    await fillBirthday(card, day);
    await expect(card.getByRole("button", { name: "Save" })).toBeEnabled();
    await card.getByRole("button", { name: "Save" }).click();
  };
  // today's date (a phone's picker opens on it) is a slip, not an answer: nothing is locked. Local date: the account's zone is
  // the browser's, so a UTC date would be tomorrow for a browser west of UTC in the evening.
  const now = new Date();
  await answer(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  await expect(card.getByRole("alert")).toHaveText("Check the year.");
  // a real under-13 date is read back first; "Change the date" goes back with nothing locked
  await answer(`${new Date().getFullYear() - 10}-04-04`);
  await expect(card.getByText(/^You entered April 4, \d{4}\.$/)).toBeVisible();
  await expect(card.getByText(/will be locked and everything in it erased/)).toBeVisible();
  await card.getByRole("button", { name: "Change the date" }).click();
  expect(
    (await queryAsUser<{ p: Record<string, unknown> }>(email, "select preferences as p from users where email = $1", [email]))[0].p.ageBlockedAt,
  ).toBeUndefined();
  await card.getByRole("button", { name: "Save" }).click();
  await card.getByRole("button", { name: "Yes, that's right" }).click();
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  // every page leads back to the lock, and nothing of theirs is kept
  await page.goto("/money");
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "LifeFlow is for people 13 and older." })).toBeVisible();
  const [row] = await queryAsUser<{ p: Record<string, unknown>; name: string }>(email, "select preferences as p, name from users where email = $1", [email]);
  expect(Object.keys(row.p).sort()).toEqual(["ageBlockedAt", "onboarding"]);
  expect(row.name).not.toBe("Rio Late");
  // the lock screen can delete the account too (one tap deeper), with the same rules as Settings
  await page.locator("summary", { hasText: "Delete my account" }).click();
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByLabel('Type "DELETE" to confirm').fill("DELETE");
  await page.locator("form button[type=submit]", { hasText: "Delete my account" }).click();
  await expect.poll(async () => (await pool.query("select count(*)::int as n from users where email = $1", [email])).rows[0].n).toBe(0);
});

test("under 13: one calm line, the welcome stays locked, and an older year later doesn't get through", async ({ page }) => {
  const email = await signUp(page, "Kai Young", { onboarding: "stay" });
  await setupSkyling(page);
  await setupAbout(page, { name: "Kai", birthday: `${new Date().getFullYear() - 9}-03-03`, week: "Classes" });
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
  await fillBirthday(card, "1998-08-08");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toHaveCount(0);
  const [row] = await queryAsUser<{ p: { birthDate?: string } }>(email, "select preferences as p from users where email = $1", [email]);
  expect(row.p.birthDate).toBe("1998-08-08");
});
