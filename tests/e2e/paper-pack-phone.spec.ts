import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

// Gamechanger 1 (owner, 2026-11-26): a saved paper pack opens on its own page; with none yet, one tap asks the skyling.
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

test("a paper pack shows its sources, questions and next steps; none yet offers one", async ({ page }) => {
  const email = await signUp(page, "Maya Lopez");
  const [work] = await queryAsUser<{ id: string }>(
    email,
    `with c as (insert into courses (user_id, name, code) select id, 'Psychology', 'PSY 101' from users where email = $1 returning id, user_id)
     insert into assignments (user_id, course_id, title, kind, due_at, dedupe_key)
     select user_id, id, 'Research paper on sleep and memory', 'assignment', now() + interval '4 days', 'pack-e2e' from c returning id`,
    [email],
  );
  await page.goto(`/school/pack/${work.id}`);
  await expect(page.getByText("No pack yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find sources" })).toBeVisible();
  await page.screenshot({ path: "test-results/paper-pack-empty-phone.png" });

  const sources = [
    {
      title: "Sleep and memory consolidation",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3079906/",
      why: "A review of how sleep helps the brain keep new memories.",
    },
    {
      title: "Sleep, Learning, and Memory",
      url: "https://healthysleep.med.harvard.edu/healthy/matters/benefits-of-sleep/learning-memory",
      why: "Harvard's plain guide to the research, with study examples.",
    },
    {
      title: "Why We Sleep (lecture notes)",
      url: "https://www.apa.org/topics/sleep/why",
      why: "The American Psychological Association on sleep and the mind.",
    },
    {
      title: "Students, sleep and grades",
      url: "https://www.sleepfoundation.org/school-and-sleep",
      why: "What surveys of college students found about sleep and grades.",
    },
  ];
  const questions = [
    "Which stage of sleep matters most for memory?",
    "Does a short nap help as much as a full night?",
    "How much do all-nighters cost on an exam?",
  ];
  await queryAsUser(
    email,
    `insert into paper_packs (user_id, assignment_id, sources, questions, searched_at) select id, $2, $3::jsonb, $4::jsonb, now() from users where email = $1`,
    [email, work.id, JSON.stringify(sources), JSON.stringify(questions)],
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research paper on sleep and memory");
  await expect(page.getByRole("link", { name: "Sleep and memory consolidation" })).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText("Which stage of sleep matters most for memory?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan sessions" })).toBeVisible();
  await page.getByRole("button", { name: "Plan sessions" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/paper-pack-phone.png" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.screenshot({ path: "test-results/paper-pack-laptop.png" });
});
