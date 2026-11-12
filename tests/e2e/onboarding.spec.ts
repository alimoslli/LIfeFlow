import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp, fillBirthday } from "./helpers";

test("a new user meets the skylings, tells theirs about themselves, sees how to connect their sky, learns it by doing, then the tour", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  // 1. The skylings come first (research 2026-11-09): picking one brings its name and its tone; a name of their own wins
  // and keeps the look and tone. Each step says what it changes.
  await expect(page.getByRole("heading", { name: "Meet the skylings" })).toBeVisible();
  await expect(page.getByText("Changes who sits on top of your sky")).toBeVisible();
  expect(Math.round((await page.getByLabel("Skyling's name").boundingBox())!.height)).toBeGreaterThanOrEqual(44);
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
  expect(Math.round((await page.getByLabel("What should I call you?").boundingBox())!.height)).toBeGreaterThanOrEqual(44); // 43.99997 is 44 px
  await page.getByLabel("What should I call you?").fill("Maya");
  await expect(page.getByRole("heading", { name: "Hi Maya." })).toBeVisible();
  // no plan or price line in setup: people come in from the waitlist (owner, 2026-11-11)
  await expect(page.getByText(/free while we're testing/)).toHaveCount(0);
  const go = page.getByRole("button", { name: "Connect my sky" });
  await page.getByRole("radio", { name: /^Both/ }).click();
  await expect(go).toBeDisabled(); // the birthday is asked for, neutrally (the age rule is the server's)
  await expect(page.getByText("Private to your account.", { exact: true })).toBeVisible();
  await fillBirthday(page, "2005-04-12");
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
  // every connection is offered right here (owner, 2026-11-11), the work shifts too since they have a job, and the bank
  for (const name of ["Google", "Outlook and Teams", "Work shifts", "Your bank"]) {
    const card = page.getByText(name, { exact: true });
    await expect(card).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Add a photo of your work schedule" })).toBeVisible();
  const google = page.getByRole("link", { name: "Connect Google" });
  if (await google.count()) await expect(google).toHaveAttribute("href", "/api/integrations/google/start?from=welcome");
  // Coming back from Google (its callback lands here): the same step, a plain line about what happened, and
  // everything chosen before is still there (the skyling and the birthday).
  await page.goto("/welcome?connected=google&result=missing_scopes");
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  await expect(page.getByText("Google Calendar needs calendar access to fill your sky.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Birthday year")).toHaveValue("2005");
  await expect(page.getByLabel("Birthday month")).toHaveValue("4");
  await expect(page.getByLabel("Birthday day")).toHaveValue("12");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await page.getByRole("button", { name: "I'll connect later" }).click();

  // 4. Here's your week so far: nothing connected, so nothing is invented. Four tiles, one real thing saved through the
  // existing service, and it lands on the same wheel above. The step says what it changes; five steps now.
  await expect(page.getByRole("heading", { name: "Here's your week so far" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Step 4 of 5" })).toBeVisible();
  await expect(page.getByText("Your skyling changes nothing unless you say yes", { exact: false })).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByTestId("week-counts")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pick up meds, / })).toHaveCount(0);
  const tiles = page.getByRole("list", { name: "Add one real thing" });
  for (const t of ["Class", "Shift", "Bill", "To-do"]) await expect(tiles.getByRole("button", { name: new RegExp(`^${t}`) })).toBeVisible();
  expect(await queryAsUser(email, "select id from tasks")).toEqual([]);
  await tiles.getByRole("button", { name: /^To-do/ }).click();
  const form = page.getByRole("form", { name: "Add a to-do" });
  await form.getByLabel("What needs doing?").fill("Pick up meds");
  await form.getByRole("button", { name: "Save this to-do" }).click();
  await expect(page.getByTestId("week-counts")).toContainText("in the next 7 days.");
  await expect(page.getByRole("button", { name: /^Pick up meds, / }).first()).toBeAttached();
  expect((await queryAsUser<{ title: string }>(email, "select title from tasks")).map((t) => t.title)).toEqual(["Pick up meds"]);
  await page.getByRole("button", { name: "Show me how to read it" }).click();

  // 5. Read your sky: folded back to the wheel, and opening it is ticked off when they do it.
  await expect(page.getByRole("heading", { name: "Read your sky" })).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByText("Open it (done)")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(page.getByText("Fold it back (done)")).toBeAttached();
  await page.getByRole("button", { name: "Go to my sky" }).click();

  // Today, and no tour after the welcome (owner's program, item 7: the welcome taught what the tour did).
  await page.waitForURL((u) => u.pathname === "/");
  const tour = page.getByRole("dialog", { name: "Welcome to LifeFlow" });
  await expect(page.getByTestId("day-clock")).toBeVisible();
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

  // Saved: their skyling and about them (birthday). No school or workplace is typed in setup any more (owner,
  // 2026-11-11): connecting fills those in, so nothing is made up here.
  const [prefs] = await queryAsUser<{
    p: { lifeStage?: string; assistantName?: string; assistantStyle?: string; companion?: string; birthDate?: string; school?: string };
  }>(email, "select preferences as p from users where email = $1", [email]);
  expect(prefs.p).toMatchObject({
    lifeStage: "both",
    assistantName: "Nova",
    assistantStyle: "coach",
    companion: "ray",
    birthDate: "2005-04-12",
  });
  expect(prefs.p.school).toBeUndefined();
  expect(await queryAsUser(email, "select name from employers")).toEqual([]);
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
  await fillBirthday(page, "2001-09-30");
  await page.getByRole("radio", { name: /^Work/ }).click();
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await page.getByRole("button", { name: "I'll connect later" }).click(); // connecting is optional
  await page.getByRole("button", { name: "Show me how to read it" }).click();
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await page.waitForURL((u) => u.pathname === "/");

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
  await fillBirthday(page, "2002-02-02");
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
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Kai");
  await fillBirthday(page, `${new Date().getFullYear() - 9}-03-03`);
  await page.getByRole("radio", { name: /^Classes/ }).click();
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
  await fillBirthday(card, "1998-08-08");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toHaveCount(0);
  const [row] = await queryAsUser<{ p: { birthDate?: string } }>(email, "select preferences as p from users where email = $1", [email]);
  expect(row.p.birthDate).toBe("1998-08-08");
});

test("what landed: the week in words on the real wheel, one first fix with Yes and Undo, Not now steps away", async ({ page }) => {
  const email = await signUp(page, "Dana Wu", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Dana");
  await page.getByRole("radio", { name: /^Classes/ }).click();
  await fillBirthday(page, "2004-06-01");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  // something real landed from their own connection: a class with a due date four days out
  await queryAsUser(
    email,
    `with c as (insert into courses (user_id, name) select id, 'BIO 101' from users where email = $1 returning id, user_id)
     insert into assignments (user_id, course_id, title, due_at, dedupe_key) select user_id, id, 'Lab report', now() + interval '4 days', 'e2e-lab-report' from c`,
    [email],
  );
  await page.goto("/welcome"); // coming back (as after Google): the connect step, with the sky as it is now
  await page.getByRole("button", { name: "I'll connect later" }).click();

  await expect(page.getByRole("heading", { name: "Here's your week so far" })).toBeVisible();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(page.getByTestId("week-counts")).toHaveText("1 due date in the next 7 days.");
  await expect(page.getByRole("list", { name: "Coming up" })).toContainText("Lab report");
  // each row names its real day (four days out), not another one
  const dueDay = new Date(Date.now() + 4 * 86_400_000).toLocaleDateString("en-US", { weekday: "short" });
  await expect(page.getByRole("list", { name: "Coming up" }).getByRole("listitem").filter({ hasText: "Lab report" })).toContainText(dueDay);
  // landed, so no tiles
  await expect(page.getByRole("list", { name: "Add one real thing" })).toHaveCount(0);

  // the one first fix: nothing changes until Yes
  const card = page.getByRole("region", { name: /first fix$/ });
  await expect(card).toContainText("Lab report is due");
  await expect(card).toContainText("Want me to block 2 hours on");
  expect(await queryAsUser(email, "select id from calendar_events")).toEqual([]);
  await card.getByRole("button", { name: "Yes" }).click();
  await expect(card.getByRole("status")).toContainText("Work on Lab report");
  expect((await queryAsUser<{ kind: string }>(email, "select kind from calendar_events")).map((e) => e.kind)).toEqual(["study"]);
  await expect(page.getByRole("button", { name: /^Work on Lab report, / }).first()).toBeAttached();
  // Undo puts it back
  await card.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await queryAsUser(email, "select id from calendar_events")).length).toBe(0);
  await expect(page.getByRole("button", { name: /^Work on Lab report, / })).toHaveCount(0);

  // going on: Read your sky, and the welcome still finishes with the birthday on the account
  await page.getByRole("button", { name: "Show me how to read it" }).click();
  await expect(page.getByRole("heading", { name: "Read your sky" })).toBeVisible();
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("Not now on the first fix steps away and changes nothing", async ({ page }) => {
  const email = await signUp(page, "Eli Ross", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Eli");
  await page.getByRole("radio", { name: /^Classes/ }).click();
  await fillBirthday(page, "2004-06-01");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await queryAsUser(
    email,
    `with c as (insert into courses (user_id, name) select id, 'ENG 201' from users where email = $1 returning id, user_id)
     insert into assignments (user_id, course_id, title, due_at, dedupe_key) select user_id, id, 'Essay', now() + interval '3 days', 'e2e-essay' from c`,
    [email],
  );
  await page.goto("/welcome");
  await page.getByRole("button", { name: "I'll connect later" }).click();
  const card = page.getByRole("region", { name: /first fix$/ });
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);
  expect(await queryAsUser(email, "select id from calendar_events")).toEqual([]);
});
