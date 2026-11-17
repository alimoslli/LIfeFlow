import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * What's due is a section of School, not a page of its own (owner's page map, 2026-11-10): the next 7 days by default
 * (owner, 2026-11-16: rolling, so a Sunday still shows Monday's work), with the other views a tap away, and the old Due
 * address lands on it with its view.
 */
test("School shows what's due under the classes; the old Due link lands on it", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Maya Torres");

  await page.goto("/school");
  await page.getByRole("button", { name: "Add course" }).first().click();
  const course = page.getByRole("dialog", { name: "Add a course" });
  await course.getByLabel("Course name").fill("Intro to Biology");
  await course.getByLabel("Code").fill("BIO 110");
  await course.getByRole("button", { name: "Add course" }).click();
  await expect(course).toBeHidden();

  await page.getByRole("button", { name: "Add assignment" }).first().click();
  const add = page.getByRole("dialog", { name: "Add an assignment" });
  await add.getByLabel("Title").fill("Lab report 3");
  // two days out: inside "Next 7 days" on every day of the week (in the calendar week it fell into next week on a Saturday
  // or Sunday, and the page looked empty on those days)
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await add.getByLabel("Due date").fill(soon);
  await add.getByRole("button", { name: "Add assignment" }).click();
  await expect(add).toBeHidden();

  // Under the classes, the next 7 days by default; one row of section tabs on the page (no second "Classes").
  const due = page.getByRole("region", { name: "Due" });
  await expect(due.getByRole("link", { name: "Next 7 days" })).toHaveAttribute("aria-current", "page");
  await expect(due.getByRole("link", { name: "This week" })).toHaveCount(0);
  await expect(due.getByTestId("assignment-row").filter({ hasText: "Lab report 3" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Classes", exact: true })).toHaveCount(1);

  await due.getByRole("link", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/school\?view=completed#due$/);
  await expect(page.getByRole("region", { name: "Due" }).getByText("What you finish collects here.")).toBeVisible();

  // An old "This week" link opens the next 7 days.
  await page.goto("/school?view=week#due");
  await expect(page.getByRole("region", { name: "Due" }).getByRole("link", { name: "Next 7 days" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Due" }).getByTestId("assignment-row").filter({ hasText: "Lab report 3" })).toBeVisible();

  // The old Due page and its views land here.
  await page.goto("/school/due?view=upcoming");
  await expect(page).toHaveURL(/\/school\?view=upcoming#due$/);
  await expect(page.getByRole("region", { name: "Due" }).getByTestId("assignment-row").filter({ hasText: "Lab report 3" })).toBeVisible();
});

// An empty Today or week used to read "Nothing here. Send Ray your syllabus and every due date lands here", whatever else
// was open. It now says what is true and where the rest is.
test("an empty Next 7 days says what is still open and leads to it", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Maya Torres");
  await page.goto("/school");
  await page.getByRole("button", { name: "Add course" }).first().click();
  const course = page.getByRole("dialog", { name: "Add a course" });
  await course.getByLabel("Course name").fill("Intro to Biology");
  await course.getByRole("button", { name: "Add course" }).click();
  await expect(course).toBeHidden();
  await page.getByRole("button", { name: "Add assignment" }).first().click();
  const add = page.getByRole("dialog", { name: "Add an assignment" });
  await add.getByLabel("Title").fill("Final paper");
  // two weeks out: never in the next 7 days
  await add.getByLabel("Due date").fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  await add.getByRole("button", { name: "Add assignment" }).click();
  await expect(add).toBeHidden();

  const due = page.getByRole("region", { name: "Due" });
  await expect(due.getByRole("link", { name: "Next 7 days" })).toHaveAttribute("aria-current", "page");
  await expect(due.getByText("Nothing due in the next 7 days")).toBeVisible();
  await expect(due.getByText("1 thing is still open.")).toBeVisible();
  await expect(due.getByText("lands here", { exact: false })).toHaveCount(0);
  const more = due.getByRole("link", { name: "See what's coming" });
  expect(Math.round((await more.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(page).toHaveURL(/\/school\?view=upcoming#due$/);
  await expect(page.getByRole("region", { name: "Due" }).getByTestId("assignment-row").filter({ hasText: "Final paper" })).toBeVisible();
  // Today reads the same way
  await page.goto("/school?view=today#due");
  await expect(page.getByRole("region", { name: "Due" }).getByText("Nothing due today")).toBeVisible();
});
