import { expect, test, type Page } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/** A real touch swipe (Chrome DevTools touch events → pointer events with pointerType "touch"). */
async function swipe(page: Page, selector: ReturnType<Page["locator"]>, dx: number) {
  const box = (await selector.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x0) });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x0 + (dx * i) / 10) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("to-dos on a phone: quick add, swipe to complete, swipe to delete with Undo, detail page", async ({ page }) => {
  const email = await signUp(page, "Ivy Phone");
  await page.goto("/tasks");
  // Quick add from the floating + (the top field is desktop only).
  await page.getByRole("button", { name: "Quick add" }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByLabel("What do you need to do?").fill("Buy lab goggles");
  await sheet.getByRole("button", { name: "Add to-do" }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Added "Buy lab goggles"' })).toBeVisible();
  await page.getByRole("button", { name: "Quick add" }).click();
  await sheet.getByLabel("What do you need to do?").fill("Call the bank");
  await sheet.getByRole("button", { name: "Add to-do" }).click();
  await expect(page.getByRole("link", { name: /Call the bank/ })).toBeVisible();

  // Swipe right completes.
  await swipe(page, page.getByRole("link", { name: /Buy lab goggles/ }), 160);
  await expect(page.getByRole("status").filter({ hasText: "Done: Buy lab goggles" })).toBeVisible();
  await expect
    .poll(async () => (await queryAsUser<{ status: string }>(email, "select status from tasks where title = 'Buy lab goggles'"))[0]?.status)
    .toBe("done");

  // Swipe left deletes, and Undo brings it back.
  await swipe(page, page.getByRole("link", { name: /Call the bank/ }), -160);
  const toast = page.getByRole("status").filter({ hasText: "moved to trash" });
  await expect(toast).toBeVisible();
  await expect.poll(async () => (await queryAsUser(email, "select 1 from tasks where title = 'Call the bank'")).length).toBe(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: /Call the bank/ })).toBeVisible();

  // Tapping a to-do opens its own page with a back button and full-width fields.
  await page.getByRole("link", { name: /Call the bank/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await page.getByRole("button", { name: "High" }).click();
  await page.getByRole("button", { name: /^Due/ }).click();
  await page
    .getByRole("dialog", { name: "Due" })
    .getByRole("button", { name: /^Tomorrow/ })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "To-do saved." })).toBeVisible();
  const [row] = await queryAsUser<{ priority: string; due_at: Date | null }>(email, "select priority, due_at from tasks where title = 'Call the bank'");
  expect(row.priority).toBe("high");
  expect(row.due_at).not.toBeNull();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
});

test("phone shell: tab bar never covers content, tap targets are 44px, search finds records", async ({ page }) => {
  await signUp(page, "Tara Touch");
  await page.goto("/tasks");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Quick add" }).click();
    await page
      .getByRole("dialog", { name: "Quick add" })
      .getByLabel("What do you need to do?")
      .fill(`Errand ${i + 1}`);
    await page.getByRole("dialog", { name: "Quick add" }).getByRole("button", { name: "Add to-do" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`Errand ${i + 1}`) })).toBeVisible();
  }
  for (const path of ["/", "/tasks", "/plan", "/money", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const covered = await page.evaluate(() => {
      const navTop = document.querySelector("nav.lf-tabbar")!.getBoundingClientRect().top;
      const els = [...document.querySelectorAll("main a[href], main button")].filter((e) => e.getBoundingClientRect().height > 0);
      return els.length ? els[els.length - 1].getBoundingClientRect().bottom > navTop : false;
    });
    expect(covered, `${path}: last control is under the tab bar`).toBe(false);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("main button, main [role=checkbox], nav.lf-tabbar a, header button, header a")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
        .map(({ e, r }) => `${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small, `${path}: small tap targets`).toEqual([]);
  }
  // Search (the app bar's search icon opens the ⌘K palette).
  await page.goto("/");
  await page.getByRole("button", { name: "Search and ask" }).click();
  await page.getByRole("combobox", { name: "Search" }).fill("Errand 2");
  await page.getByRole("option", { name: /Errand 2\s*To-do/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
});

test("shifts: blank form can't create a shift, edit and delete work, past shifts ask for hours", async ({ page }) => {
  const email = await signUp(page, "Sam Shift");
  await page.goto("/work");
  await page.getByLabel("Employer").or(page.getByLabel("Job name")).first().fill("Campus Library");
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("button", { name: "Add shift" })).toBeVisible();
  // An untouched quick-add submit must not create a 9 to 5 shift.
  await page.getByRole("button", { name: "Quick add" }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByRole("tab", { name: "Shift" }).click();
  await sheet.getByRole("button", { name: "Add shift" }).click();
  await expect(sheet.getByText("Pick a date, a start time and an end time.")).toBeVisible();
  expect(await queryAsUser(email, "select 1 from work_shifts")).toHaveLength(0);
  await sheet.getByRole("button", { name: /^Date/ }).click();
  await page
    .getByRole("dialog", { name: "Date" })
    .getByRole("button", { name: /^Today/ })
    .click();
  await sheet.getByRole("button", { name: /^Starts/ }).click();
  await page.getByRole("dialog", { name: "Starts" }).getByRole("button", { name: "8:00 AM" }).click();
  await sheet.getByRole("button", { name: /^Ends/ }).click();
  await page.getByRole("dialog", { name: "Ends" }).getByRole("button", { name: "12:00 PM" }).click();
  await sheet.getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Shift added." })).toBeVisible();

  // Edit it: move the end to 1 PM.
  await page.getByRole("button", { name: /^Edit shift on/ }).click();
  const edit = page.getByRole("dialog", { name: "Shift" });
  await edit.getByRole("button", { name: /^Ends/ }).click();
  await page.getByRole("dialog", { name: "Ends" }).getByRole("button", { name: "1:00 PM" }).click();
  await edit.getByRole("button", { name: "Save shift" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Shift saved." })).toBeVisible();
  await expect(page.getByText("8:00 to 1:00 PM")).toBeVisible();

  // A shift that already ended asks for actual hours instead of staying "Scheduled".
  await queryAsUser(email, "update work_shifts set starts_at = now() - interval '30 hours', ends_at = now() - interval '26 hours'");
  await page.reload();
  await expect(page.getByText("Needs hours")).toBeVisible();
  await page.getByRole("button", { name: /^Edit shift on/ }).click();
  await page.getByRole("dialog", { name: "Shift" }).getByRole("button", { name: "Yes, as scheduled" }).click();
  await expect(page.getByText("Worked", { exact: true })).toBeVisible();

  // Delete from the sheet, then Undo.
  await page.getByRole("button", { name: /^Edit shift on/ }).click();
  await page.getByRole("dialog", { name: "Shift" }).getByRole("button", { name: "Delete shift" }).click();
  await page.getByRole("status").filter({ hasText: "moved to trash" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /^Edit shift on/ })).toBeVisible();
});
