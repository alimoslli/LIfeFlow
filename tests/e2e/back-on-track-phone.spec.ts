import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

// Back on track (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 3): waiting to-dos get a quiet line and one
// tap spreads them into free time; never "overdue", "missed" or how long it's been; Undo puts them back.
test("waiting to-dos: one tap spreads them into free time, with Undo", async ({ page }) => {
  const email = await signUp(page, "Robin Back");
  for (const title of ["Laundry", "Email Prof Lee", "Call the bank"])
    await queryAsUser(
      email,
      `insert into tasks (user_id, title, due_at, due_all_day) values (current_setting('app.user_id')::uuid, $1, now() - interval '9 days', true)`,
      [title],
    );
  const before = (await queryAsUser<{ d: string }>(email, "select string_agg(date_trunc('second', due_at)::text, ',' order by title) as d from tasks"))[0].d;
  await page.goto("/");
  const back = page.getByTestId("back-on-track").filter({ visible: true });
  await expect(back).toContainText("3 to-dos can find new times.");
  await expect(page.locator("body")).not.toContainText(/overdue|missed|past due|days ago/i);
  await page.screenshot({ path: "test-results/adhd-back-on-track-phone.png" });
  await back.getByRole("button", { name: "Back on track" }).click();
  const done = page.getByTestId("back-on-track-done").filter({ visible: true });
  await expect(done).toContainText(/Laundry (today|tomorrow|on \w+) at \d{1,2}:\d{2} [AP]M/);
  await page.screenshot({ path: "test-results/adhd-back-on-track-done-phone.png" });
  // tasks are behind row-level security: read them as the person
  const [moved] = await queryAsUser<{ n: string }>(email, "select count(*) as n from tasks where due_at > now() and not due_all_day");
  expect(Number(moved.n)).toBe(3);

  await page.getByTestId("back-on-track").filter({ visible: true }).getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(
      async () => (await queryAsUser<{ d: string }>(email, "select string_agg(date_trunc('second', due_at)::text, ',' order by title) as d from tasks"))[0].d,
    )
    .toBe(before);
});
